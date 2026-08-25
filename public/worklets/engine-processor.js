/**
 * Qamuz Studio audio engine, running on the audio render thread.
 *
 * Everything that must be sample-accurate lives here: the transport clock, MIDI
 * event dispatch, the internal instruments, audio clip playback, the metronome,
 * and the per-track mixer with volume and pan.
 *
 * This file is plain JavaScript in `public/` rather than a TypeScript module for
 * a deliberate reason: `addModule` loads it as a classic script with no imports,
 * which is the only form that behaves the same in WebView2 on Windows and WebKit
 * on macOS. Keeping it dependency-free is the portability guarantee.
 */

const QUANTUM = 128;
const MAX_VOICES_PER_TRACK = 32;

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const PITCH_BEND = 0xe0;

const CC_ALL_SOUND_OFF = 120;
const CC_ALL_NOTES_OFF = 123;

function midiToFrequency(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** polyBLEP residual, which removes most of the aliasing from naive saw/square. */
function polyBlep(t, dt) {
  if (t < dt) {
    const x = t / dt - 1;
    return -x * x;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt + 1;
    return x * x;
  }
  return 0;
}

/**
 * Voicing parameters per instrument. `partials` are (ratio, gain, waveform)
 * triples, so one small renderer covers every instrument.
 */
const INSTRUMENTS = {
  piano: {
    attack: 0.002,
    decay: 0.9,
    sustain: 0.18,
    release: 0.35,
    cutoff: 0.55,
    gain: 0.5,
    partials: [
      [1, 1, 'triangle'],
      [2, 0.32, 'sine'],
      [3.01, 0.12, 'sine'],
      [1.004, 0.45, 'triangle']
    ]
  },
  epiano: {
    attack: 0.004,
    decay: 1.4,
    sustain: 0.3,
    release: 0.5,
    cutoff: 0.7,
    gain: 0.45,
    partials: [
      [1, 1, 'sine'],
      [4, 0.24, 'sine'],
      [7, 0.08, 'sine'],
      [0.998, 0.5, 'sine']
    ]
  },
  bass: {
    attack: 0.005,
    decay: 1.8,
    sustain: 0.75,
    release: 0.16,
    cutoff: 0.14,
    gain: 0.6,
    partials: [
      [1, 1, 'saw'],
      [0.5, 0.5, 'sine'],
      [1.005, 0.35, 'saw']
    ]
  },
  lead: {
    attack: 0.008,
    decay: 1.2,
    sustain: 0.7,
    release: 0.2,
    cutoff: 0.4,
    gain: 0.4,
    partials: [
      [1, 1, 'square'],
      [1.007, 0.6, 'saw'],
      [2, 0.2, 'square']
    ]
  },
  pad: {
    attack: 0.35,
    decay: 2.5,
    sustain: 0.8,
    release: 1.1,
    cutoff: 0.3,
    gain: 0.32,
    partials: [
      [1, 1, 'saw'],
      [1.01, 0.85, 'saw'],
      [0.5, 0.4, 'triangle'],
      [2.02, 0.25, 'saw']
    ]
  },
  pluck: {
    attack: 0.001,
    decay: 0.32,
    sustain: 0.02,
    release: 0.22,
    cutoff: 0.5,
    gain: 0.55,
    partials: [
      [1, 1, 'triangle'],
      [2.01, 0.4, 'sine'],
      [3.02, 0.2, 'sine']
    ]
  }
};

/** General-MIDI-ish drum map, so a standard pad controller lands sensibly. */
const DRUM_MAP = {
  35: 'kick',
  36: 'kick',
  37: 'rim',
  38: 'snare',
  39: 'clap',
  40: 'snare',
  41: 'tom',
  42: 'hatClosed',
  43: 'tom',
  44: 'hatClosed',
  45: 'tom',
  46: 'hatOpen',
  47: 'tom',
  48: 'tom',
  49: 'crash',
  50: 'tom',
  51: 'ride',
  57: 'crash'
};

const DRUM_VOICES = {
  kick: { freq: 52, decay: 0.32, noise: 0.04, pitchDrop: 0.75, gain: 1 },
  snare: { freq: 190, decay: 0.19, noise: 0.85, pitchDrop: 0.2, gain: 0.75 },
  clap: { freq: 320, decay: 0.16, noise: 1, pitchDrop: 0, gain: 0.6 },
  rim: { freq: 420, decay: 0.06, noise: 0.7, pitchDrop: 0.3, gain: 0.5 },
  tom: { freq: 120, decay: 0.26, noise: 0.1, pitchDrop: 0.4, gain: 0.7 },
  hatClosed: { freq: 8200, decay: 0.05, noise: 1, pitchDrop: 0, gain: 0.4 },
  hatOpen: { freq: 7600, decay: 0.34, noise: 1, pitchDrop: 0, gain: 0.36 },
  ride: { freq: 6200, decay: 0.9, noise: 0.9, pitchDrop: 0, gain: 0.3 },
  crash: { freq: 5200, decay: 1.4, noise: 1, pitchDrop: 0, gain: 0.32 }
};

class Voice {
  constructor() {
    this.active = false;
    this.note = 0;
    this.phases = new Float32Array(4);
    this.frequency = 440;
    this.velocity = 1;
    this.stage = 'idle';
    this.envelope = 0;
    this.spec = INSTRUMENTS.piano;
    this.filterState = 0;
    this.age = 0;

    // Percussion state
    this.isDrum = false;
    this.drum = null;
    this.drumPhase = 0;
    this.drumTime = 0;
  }

  startTonal(note, velocity, spec) {
    this.active = true;
    this.isDrum = false;
    this.note = note;
    this.frequency = midiToFrequency(note);
    this.velocity = velocity;
    this.spec = spec;
    this.stage = 'attack';
    this.envelope = 0;
    this.filterState = 0;
    this.age = 0;
    this.phases.fill(0);
  }

  startDrum(note, velocity) {
    const name = DRUM_MAP[note] ?? (note < 45 ? 'kick' : 'hatClosed');
    this.active = true;
    this.isDrum = true;
    this.note = note;
    this.velocity = velocity;
    this.drum = DRUM_VOICES[name];
    this.drumPhase = 0;
    this.drumTime = 0;
    this.stage = 'attack';
    this.envelope = 1;
    this.age = 0;
  }

  release() {
    if (!this.active || this.isDrum) return;
    this.stage = 'release';
  }

  kill() {
    this.active = false;
    this.stage = 'idle';
    this.envelope = 0;
  }

  /** Returns one mono sample; the caller applies panning and track gain. */
  render(sampleRate, bendRatio) {
    if (!this.active) return 0;
    this.age += 1;

    if (this.isDrum) return this.#renderDrum(sampleRate);

    const spec = this.spec;
    const dt = 1 / sampleRate;

    switch (this.stage) {
      case 'attack': {
        this.envelope += dt / Math.max(spec.attack, dt);
        if (this.envelope >= 1) {
          this.envelope = 1;
          this.stage = 'decay';
        }
        break;
      }
      case 'decay': {
        const target = spec.sustain;
        this.envelope += (target - this.envelope) * (dt / Math.max(spec.decay, dt)) * 4;
        if (Math.abs(this.envelope - target) < 0.001) this.stage = 'sustain';
        break;
      }
      case 'sustain':
        break;
      case 'release': {
        this.envelope -= dt / Math.max(spec.release, dt);
        if (this.envelope <= 0.0005) {
          this.kill();
          return 0;
        }
        break;
      }
    }

    const baseFreq = this.frequency * bendRatio;
    let sample = 0;
    let gainSum = 0;

    for (let i = 0; i < spec.partials.length; i += 1) {
      const [ratio, gain, wave] = spec.partials[i];
      const freq = baseFreq * ratio;
      if (freq >= sampleRate * 0.48) continue;

      const inc = freq / sampleRate;
      let phase = this.phases[i] + inc;
      if (phase >= 1) phase -= 1;
      this.phases[i] = phase;

      let value;
      if (wave === 'sine') {
        value = Math.sin(phase * Math.PI * 2);
      } else if (wave === 'triangle') {
        value = 4 * Math.abs(phase - 0.5) - 1;
      } else if (wave === 'saw') {
        value = 2 * phase - 1 - polyBlep(phase, inc);
      } else {
        const square = phase < 0.5 ? 1 : -1;
        const shifted = phase + 0.5 >= 1 ? phase - 0.5 : phase + 0.5;
        value = square + polyBlep(phase, inc) - polyBlep(shifted, inc);
      }

      sample += value * gain;
      gainSum += gain;
    }

    if (gainSum > 0) sample /= gainSum;

    // One-pole lowpass, brighter for harder velocities.
    const cutoff = Math.min(0.99, spec.cutoff * (0.45 + 0.55 * this.velocity));
    this.filterState += (sample - this.filterState) * cutoff;

    return this.filterState * this.envelope * this.velocity * spec.gain;
  }

  #renderDrum(sampleRate) {
    const drum = this.drum;
    this.drumTime += 1 / sampleRate;

    const env = Math.exp(-this.drumTime / (drum.decay * 0.35));
    if (env < 0.0005) {
      this.kill();
      return 0;
    }

    const freq = drum.freq * (1 - drum.pitchDrop * (1 - env));
    this.drumPhase += freq / sampleRate;
    if (this.drumPhase >= 1) this.drumPhase -= 1;

    const tone = Math.sin(this.drumPhase * Math.PI * 2);
    const noise = Math.random() * 2 - 1;
    const mixed = tone * (1 - drum.noise) + noise * drum.noise;

    return mixed * env * this.velocity * drum.gain;
  }
}

class Track {
  constructor() {
    this.volume = 0.7937;
    this.pan = 0;
    this.muted = false;
    this.instrument = 'piano';
    this.bendRatio = 1;
    this.voices = [];
    for (let i = 0; i < MAX_VOICES_PER_TRACK; i += 1) this.voices.push(new Voice());
    this.peak = 0;
    this.sumSquares = 0;
    this.clips = [];
  }

  noteOn(note, velocity) {
    let voice = this.voices.find((v) => !v.active);

    if (!voice) {
      // Steal the oldest voice already releasing, else simply the oldest.
      voice = this.voices.reduce((best, candidate) => {
        const bestScore = (best.stage === 'release' ? 1e6 : 0) + best.age;
        const score = (candidate.stage === 'release' ? 1e6 : 0) + candidate.age;
        return score > bestScore ? candidate : best;
      }, this.voices[0]);
    }

    if (this.instrument === 'drums') voice.startDrum(note, velocity);
    else voice.startTonal(note, velocity, INSTRUMENTS[this.instrument] ?? INSTRUMENTS.piano);
  }

  noteOff(note) {
    for (const voice of this.voices) {
      if (voice.active && voice.note === note && voice.stage !== 'release') voice.release();
    }
  }

  allNotesOff(immediate) {
    for (const voice of this.voices) {
      if (!voice.active) continue;
      if (immediate) voice.kill();
      else voice.release();
    }
  }
}

class EngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.tracks = new Map();
    this.buffers = new Map();

    this.playing = false;
    this.transportSample = 0;

    this.events = [];
    this.eventCursor = 0;

    this.metronomeEnabled = false;
    this.metronomeVolume = 0.7;
    this.metronomeBpm = 120;
    this.metronomeNumerator = 4;
    this.clickVoices = [];

    this.masterVolume = 1;
    this.masterPeak = 0;
    this.masterSumSquares = 0;

    this.blocksSinceReport = 0;
    this.reportInterval = 6;

    this.port.onmessage = (event) => this.#handle(event.data);
  }

  #track(id) {
    let track = this.tracks.get(id);
    if (!track) {
      track = new Track();
      this.tracks.set(id, track);
    }
    return track;
  }

  #handle(msg) {
    switch (msg.type) {
      case 'createTrack':
        this.#track(msg.trackID);
        break;

      case 'removeTrack':
        this.tracks.delete(msg.trackID);
        break;

      case 'trackParams': {
        const track = this.#track(msg.trackID);
        if (msg.volume !== undefined) track.volume = msg.volume;
        if (msg.pan !== undefined) track.pan = msg.pan;
        if (msg.muted !== undefined) {
          track.muted = msg.muted;
          if (msg.muted) track.allNotesOff(true);
        }
        if (msg.instrument !== undefined && msg.instrument !== track.instrument) {
          track.allNotesOff(true);
          track.instrument = msg.instrument;
        }
        break;
      }

      case 'scheduleEvents':
        this.events = this.events.concat(msg.events);
        this.events.sort((a, b) => a.samplePosition - b.samplePosition);
        this.#seekEventCursor(this.transportSample);
        break;

      case 'clearEvents':
        this.events = [];
        this.eventCursor = 0;
        break;

      case 'immediateMIDI':
        this.#dispatch(msg.trackID, msg.status, msg.data1, msg.data2);
        break;

      case 'registerBuffer':
        this.buffers.set(msg.fileID, { channels: msg.channels, length: msg.length });
        break;

      case 'scheduleClip': {
        const track = this.#track(msg.clip.trackID);
        track.clips.push(msg.clip);
        break;
      }

      case 'clearClips':
        for (const track of this.tracks.values()) track.clips = [];
        break;

      case 'play':
        this.transportSample = msg.fromSample;
        this.#seekEventCursor(this.transportSample);
        this.playing = true;
        break;

      case 'pause':
        this.playing = false;
        this.#allNotesOff();
        break;

      case 'stop':
        this.playing = false;
        this.transportSample = 0;
        this.eventCursor = 0;
        this.#allNotesOff();
        break;

      case 'seek':
        this.transportSample = msg.toSample;
        this.#seekEventCursor(this.transportSample);
        this.#allNotesOff();
        break;

      case 'metronome':
        if (msg.enabled !== undefined) this.metronomeEnabled = msg.enabled;
        if (msg.volume !== undefined) this.metronomeVolume = msg.volume;
        if (msg.bpm !== undefined) this.metronomeBpm = msg.bpm;
        if (msg.numerator !== undefined) this.metronomeNumerator = msg.numerator;
        break;

      case 'masterVolume':
        this.masterVolume = msg.volume;
        break;
    }
  }

  #seekEventCursor(samplePosition) {
    let low = 0;
    let high = this.events.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.events[mid].samplePosition < samplePosition) low = mid + 1;
      else high = mid;
    }
    this.eventCursor = low;
  }

  #allNotesOff() {
    for (const track of this.tracks.values()) track.allNotesOff(true);
  }

  #dispatch(trackID, status, data1, data2) {
    const track = this.#track(trackID);
    const command = status & 0xf0;

    if (command === NOTE_ON && data2 > 0) {
      if (!track.muted) track.noteOn(data1, data2 / 127);
    } else if (command === NOTE_OFF || (command === NOTE_ON && data2 === 0)) {
      track.noteOff(data1);
    } else if (command === CONTROL_CHANGE) {
      if (data1 === CC_ALL_SOUND_OFF) track.allNotesOff(true);
      else if (data1 === CC_ALL_NOTES_OFF) track.allNotesOff(false);
    } else if (command === PITCH_BEND) {
      const value = ((data2 << 7) | data1) - 8192;
      track.bendRatio = Math.pow(2, (value / 8192) * (2 / 12));
    }
  }

  /** Queues metronome clicks whose beat boundary falls inside this block. */
  #scheduleClicks(blockStart, blockEnd) {
    if (!this.metronomeEnabled) return;

    const samplesPerBeat = (60 / this.metronomeBpm) * sampleRate;
    if (samplesPerBeat <= 0) return;

    const firstBeat = Math.ceil(blockStart / samplesPerBeat);
    const lastBeat = Math.floor((blockEnd - 1) / samplesPerBeat);

    for (let beat = firstBeat; beat <= lastBeat; beat += 1) {
      const position = Math.round(beat * samplesPerBeat);
      if (position < blockStart || position >= blockEnd) continue;

      this.clickVoices.push({
        offset: position - blockStart,
        accent: beat % this.metronomeNumerator === 0,
        phase: 0,
        time: 0
      });
    }
  }

  #renderClicks(left, right, blockSize) {
    if (this.clickVoices.length === 0) return;

    const remaining = [];

    for (const click of this.clickVoices) {
      const frequency = click.accent ? 1800 : 1200;
      const decay = click.accent ? 0.045 : 0.03;
      const gain = this.metronomeVolume * (click.accent ? 0.5 : 0.34);

      for (let i = click.offset; i < blockSize; i += 1) {
        const env = Math.exp(-click.time / decay);
        if (env < 0.001) {
          click.time = Infinity;
          break;
        }

        click.phase += frequency / sampleRate;
        if (click.phase >= 1) click.phase -= 1;
        click.time += 1 / sampleRate;

        const value = Math.sin(click.phase * Math.PI * 2) * env * gain;
        left[i] += value;
        right[i] += value;
      }

      click.offset = 0;
      if (click.time !== Infinity) remaining.push(click);
    }

    this.clickVoices = remaining;
  }

  /** Mixes overlapping audio clips into the track's stereo buffers. Stereo files keep L/R. */
  #renderClips(track, leftBuf, rightBuf, blockStart, blockEnd, blockSize) {
    if (track.clips.length === 0) return;

    for (const clip of track.clips) {
      const clipEnd = clip.startSample + clip.lengthSamples;
      if (clipEnd <= blockStart || clip.startSample >= blockEnd) continue;

      const buffer = this.buffers.get(clip.fileID);
      if (!buffer) continue;

      const from = Math.max(blockStart, clip.startSample);
      const to = Math.min(blockEnd, clipEnd);
      const srcL = buffer.channels[0];
      const srcR = buffer.channels.length > 1 ? buffer.channels[1] : srcL;

      for (let position = from; position < to; position += 1) {
        const clipOffset = position - clip.startSample;
        const sourceIndex = clip.offsetSample + clipOffset;
        if (!srcL || sourceIndex < 0 || sourceIndex >= buffer.length) continue;

        let gain = clip.volume;
        if (clip.fadeInSamples > 0 && clipOffset < clip.fadeInSamples) {
          gain *= clipOffset / clip.fadeInSamples;
        }
        const fromEnd = clip.lengthSamples - clipOffset;
        if (clip.fadeOutSamples > 0 && fromEnd < clip.fadeOutSamples) {
          gain *= fromEnd / clip.fadeOutSamples;
        }

        const index = position - blockStart;
        if (index >= 0 && index < blockSize) {
          leftBuf[index] += srcL[sourceIndex] * gain;
          rightBuf[index] += srcR[sourceIndex] * gain;
        }
      }
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output.length > 1 ? output[1] : output[0];
    const blockSize = left.length || QUANTUM;

    left.fill(0);
    if (right !== left) right.fill(0);

    const blockStart = this.transportSample;
    const blockEnd = blockStart + blockSize;

    if (this.playing) {
      while (
        this.eventCursor < this.events.length &&
        this.events[this.eventCursor].samplePosition < blockEnd
      ) {
        const event = this.events[this.eventCursor];
        this.#dispatch(event.trackID, event.status, event.data1, event.data2);
        this.eventCursor += 1;
      }

      this.#scheduleClicks(blockStart, blockEnd);
    }

    const mixL = new Float32Array(blockSize);
    const mixR = new Float32Array(blockSize);

    for (const track of this.tracks.values()) {
      mixL.fill(0);
      mixR.fill(0);

      let anyVoice = false;
      for (const voice of track.voices) {
        if (!voice.active) continue;
        anyVoice = true;
        for (let i = 0; i < blockSize; i += 1) {
          const value = voice.render(sampleRate, track.bendRatio);
          mixL[i] += value;
          mixR[i] += value;
        }
      }

      const hadClips = track.clips.length > 0;
      if (this.playing && hadClips) {
        this.#renderClips(track, mixL, mixR, blockStart, blockEnd, blockSize);
      }

      if (!anyVoice && !hadClips) {
        track.peak *= 0.6;
        track.sumSquares = 0;
        continue;
      }

      const gain = track.muted ? 0 : track.volume;
      // Stereo balance: a stereo file keeps L/R; pan only attenuates one side.
      const panL = track.pan <= 0 ? 1 : 1 - track.pan;
      const panR = track.pan >= 0 ? 1 : 1 + track.pan;
      const gainLeft = gain * panL;
      const gainRight = gain * panR;

      let peak = 0;
      let sum = 0;

      for (let i = 0; i < blockSize; i += 1) {
        const l = mixL[i] * gainLeft;
        const r = mixR[i] * gainRight;
        left[i] += l;
        if (right !== left) right[i] += r;

        const magnitude = Math.max(Math.abs(l), Math.abs(r));
        if (magnitude > peak) peak = magnitude;
        sum += magnitude * magnitude;
      }

      track.peak = Math.max(peak, track.peak * 0.72);
      track.sumSquares = sum / blockSize;
    }

    this.#renderClicks(left, right, blockSize);

    let masterPeak = 0;
    let masterSum = 0;

    for (let i = 0; i < blockSize; i += 1) {
      left[i] *= this.masterVolume;
      if (right !== left) right[i] *= this.masterVolume;

      // Soft clip so a hot mix distorts gracefully instead of tearing.
      left[i] = Math.tanh(left[i]);
      if (right !== left) right[i] = Math.tanh(right[i]);

      const magnitude = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      if (magnitude > masterPeak) masterPeak = magnitude;
      masterSum += magnitude * magnitude;
    }

    this.masterPeak = Math.max(masterPeak, this.masterPeak * 0.72);
    this.masterSumSquares = masterSum / blockSize;

    if (this.playing) this.transportSample = blockEnd;

    this.blocksSinceReport += 1;
    if (this.blocksSinceReport >= this.reportInterval) {
      this.blocksSinceReport = 0;
      this.#report();
    }

    return true;
  }

  #report() {
    const meters = {};
    for (const [id, track] of this.tracks) {
      meters[id] = { peak: track.peak, rms: Math.sqrt(track.sumSquares) };
    }

    this.port.postMessage({
      type: 'clock',
      samplePosition: this.transportSample,
      contextTime: currentTime,
      playing: this.playing,
      meters,
      master: { peak: this.masterPeak, rms: Math.sqrt(this.masterSumSquares) }
    });
  }
}

registerProcessor('qamuz-engine', EngineProcessor);
