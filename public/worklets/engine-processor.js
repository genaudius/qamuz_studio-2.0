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

class Biquad {
  constructor() {
    this.b0 = 1;
    this.b1 = 0;
    this.b2 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.z1 = 0;
    this.z2 = 0;
  }

  setPeaking(freq, gainDb, q, sampleRate) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const alpha = Math.sin(w0) / (2 * Math.max(0.1, q));
    const cos = Math.cos(w0);
    const b0 = 1 + alpha * A;
    const b1 = -2 * cos;
    const b2 = 1 - alpha * A;
    const a0 = 1 + alpha / A;
    const a1 = -2 * cos;
    const a2 = 1 - alpha / A;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  setLowshelf(freq, gainDb, sampleRate) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const S = 1;
    const alpha = (Math.sin(w0) / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const cos = Math.cos(w0);
    const b0 = A * (A + 1 - (A - 1) * cos + 2 * Math.sqrt(A) * alpha);
    const b1 = 2 * A * (A - 1 - (A + 1) * cos);
    const b2 = A * (A + 1 - (A - 1) * cos - 2 * Math.sqrt(A) * alpha);
    const a0 = A + 1 + (A - 1) * cos + 2 * Math.sqrt(A) * alpha;
    const a1 = -2 * (A - 1 + (A + 1) * cos);
    const a2 = A + 1 + (A - 1) * cos - 2 * Math.sqrt(A) * alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  setHighshelf(freq, gainDb, sampleRate) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const S = 1;
    const alpha = (Math.sin(w0) / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const cos = Math.cos(w0);
    const b0 = A * (A + 1 + (A - 1) * cos + 2 * Math.sqrt(A) * alpha);
    const b1 = -2 * A * (A - 1 + (A + 1) * cos);
    const b2 = A * (A + 1 + (A - 1) * cos - 2 * Math.sqrt(A) * alpha);
    const a0 = A + 1 - (A - 1) * cos + 2 * Math.sqrt(A) * alpha;
    const a1 = 2 * (A - 1 - (A + 1) * cos);
    const a2 = A + 1 - (A - 1) * cos - 2 * Math.sqrt(A) * alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  setHighpass(freq, q, sampleRate) {
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const alpha = Math.sin(w0) / (2 * Math.max(0.1, q));
    const cos = Math.cos(w0);
    const b0 = (1 + cos) / 2;
    const b1 = -(1 + cos);
    const b2 = (1 + cos) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cos;
    const a2 = 1 - alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  setLowpass(freq, q, sampleRate) {
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const alpha = Math.sin(w0) / (2 * Math.max(0.1, q));
    const cos = Math.cos(w0);
    const b0 = (1 - cos) / 2;
    const b1 = 1 - cos;
    const b2 = (1 - cos) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cos;
    const a2 = 1 - alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(x) {
    const out = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * out + this.z2;
    this.z2 = this.b2 * x - this.a2 * out;
    return out;
  }
}

class SimpleReverb {
  constructor(sampleRate) {
    this.combLen = [
      Math.floor(0.0297 * sampleRate),
      Math.floor(0.0371 * sampleRate),
      Math.floor(0.0411 * sampleRate),
      Math.floor(0.0437 * sampleRate)
    ];
    this.combs = this.combLen.map((n) => ({ buf: new Float32Array(n), i: 0, f: 0.8 }));
    this.apLen = [Math.floor(0.005 * sampleRate), Math.floor(0.0017 * sampleRate)];
    this.aps = this.apLen.map((n) => ({ buf: new Float32Array(n), i: 0 }));
    this.lp = 0;
  }

  process(x, size, decay, precut) {
    let sum = 0;
    const damp = 0.2 + precut * 0.7;
    for (const c of this.combs) {
      const y = c.buf[c.i];
      c.f = 0.55 + decay * 0.4 * (0.7 + size * 0.3);
      c.buf[c.i] = x + y * c.f * (1 - damp * 0.15);
      c.i = (c.i + 1) % c.buf.length;
      sum += y;
    }
    let z = sum * 0.25;
    for (const ap of this.aps) {
      const bufy = ap.buf[ap.i];
      const out = -z + bufy;
      ap.buf[ap.i] = z + bufy * 0.5;
      ap.i = (ap.i + 1) % ap.buf.length;
      z = out;
    }
    this.lp = this.lp * (0.4 + precut * 0.5) + z * (0.6 - precut * 0.4);
    return this.lp;
  }
}

class DelayLine {
  constructor(maxSamples) {
    this.buf = new Float32Array(maxSamples);
    this.max = maxSamples;
    this.w = 0;
  }

  write(x) {
    this.buf[this.w] = x;
    this.w = (this.w + 1) % this.max;
  }

  read(delaySamples) {
    const d = Math.max(1, Math.min(this.max - 1, Math.floor(delaySamples)));
    const r = (this.w - d + this.max) % this.max;
    return this.buf[r];
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

    this.preGain = 1;
    this.phaseInvert = false;
    this.eqEnabled = false;
    this.eqBands = [];
    this.eqL = [new Biquad(), new Biquad(), new Biquad(), new Biquad(), new Biquad()];
    this.eqR = [new Biquad(), new Biquad(), new Biquad(), new Biquad(), new Biquad()];
    this.compEnabled = false;
    this.comp = { thresholdDb: -18, ratio: 4, attackMs: 5, releaseMs: 50, makeupDb: 0 };
    this.compEnv = 0;
    this.inserts = [];
    this.sendReverb = 0;
    this.sendDelay = 0;
    this.chorusPhase = 0;
    this.phaserPhase = 0;
    this.delayIns = new DelayLine(Math.floor((typeof sampleRate === 'number' ? sampleRate : 48000) * 0.1));
    this.unmaskEnv = 0;
    this.eqamuzFx = new Map();
  }

  noteOn(note, velocity) {
    let voice = this.voices.find((v) => !v.active);

    if (!voice) {
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

  syncEq(sampleRate) {
    for (let i = 0; i < 5; i += 1) {
      const band = this.eqBands[i];
      if (!band) continue;
      const apply = (bq) => {
        if (band.type === 'lowshelf') bq.setLowshelf(band.freq, band.gainDb, sampleRate);
        else if (band.type === 'highshelf') bq.setHighshelf(band.freq, band.gainDb, sampleRate);
        else bq.setPeaking(band.freq, band.gainDb, band.q, sampleRate);
      };
      apply(this.eqL[i]);
      apply(this.eqR[i]);
    }
  }

  #filterSample(bqChain, x, bands) {
    let y = x;
    for (let i = 0; i < bqChain.length; i += 1) {
      const band = bands[i];
      if (!band || !band.enabled) continue;
      if (Math.abs(band.gainDb) < 0.01 && band.type === 'peaking') continue;
      y = bqChain[i].process(y);
    }
    return y;
  }

  #compress(x, sampleRate) {
    if (!this.compEnabled) return x;
    const thr = Math.pow(10, this.comp.thresholdDb / 20);
    const ratio = Math.max(1, this.comp.ratio);
    const atk = Math.exp(-1 / (sampleRate * (this.comp.attackMs / 1000)));
    const rel = Math.exp(-1 / (sampleRate * (this.comp.releaseMs / 1000)));
    const level = Math.abs(x);
    if (level > this.compEnv) this.compEnv = atk * this.compEnv + (1 - atk) * level;
    else this.compEnv = rel * this.compEnv + (1 - rel) * level;
    let gr = 1;
    if (this.compEnv > thr) {
      const over = this.compEnv / thr;
      const compressed = Math.pow(over, 1 / ratio - 1);
      gr = compressed;
    }
    const makeup = Math.pow(10, this.comp.makeupDb / 20);
    return x * gr * makeup;
  }

  #processInserts(l, r, sampleRate) {
    let left = l;
    let right = r;
    for (const ins of this.inserts) {
      if (!ins.enabled) continue;
      const p = ins.params || {};
      const eqState = p.eqamuzState;
      const ab = eqState ? (eqState.currentABState === 'B' ? eqState.stateB : eqState.stateA) : null;

      if (ins.kind === 'drive') {
        const drive = 1 + (p.drive ?? 0.35) * 8;
        const wetL = Math.tanh(left * drive) / Math.tanh(drive);
        const wetR = Math.tanh(right * drive) / Math.tanh(drive);
        const mix = p.mix ?? 0.45;
        left = left * (1 - mix) + wetL * mix;
        right = right * (1 - mix) + wetR * mix;
      } else if (ins.kind === 'tubeEq') {
        const low = ((p.low ?? 0.55) - 0.5) * 12;
        const mid = ((p.mid ?? 0.5) - 0.5) * 8;
        const high = ((p.high ?? 0.58) - 0.5) * 10;
        const drive = 1 + (p.drive ?? 0.25) * 3;
        const satL = Math.tanh(left * drive);
        const satR = Math.tanh(right * drive);
        left = satL * (1 + mid * 0.05) + Math.sign(satL) * Math.abs(satL) * 0.02 * high + satL * 0.03 * low;
        right = satR * (1 + mid * 0.05) + Math.sign(satR) * Math.abs(satR) * 0.02 * high + satR * 0.03 * low;
      } else if (ins.kind === 'chorus') {
        this.chorusPhase += ((0.1 + (p.rate ?? 0.35) * 2) * Math.PI * 2) / sampleRate;
        const depth = 0.002 + (p.depth ?? 0.4) * 0.008;
        const delaySamples = (0.012 + Math.sin(this.chorusPhase) * depth) * sampleRate;
        this.delayIns.write((left + right) * 0.5);
        const wet = this.delayIns.read(delaySamples);
        const mix = p.mix ?? 0.35;
        left = left * (1 - mix) + wet * mix;
        right = right * (1 - mix) + wet * mix;
      } else if (ins.kind === 'phaser') {
        this.phaserPhase += ((0.05 + (p.rate ?? 0.3) * 1.5) * Math.PI * 2) / sampleRate;
        const depth = p.depth ?? 0.5;
        const allpassL = left + Math.sin(this.phaserPhase) * depth * 0.5 * left;
        const allpassR = right + Math.sin(this.phaserPhase + 0.5) * depth * 0.5 * right;
        const mix = p.mix ?? 0.4;
        left = left * (1 - mix) + allpassL * mix;
        right = right * (1 - mix) + allpassR * mix;
      } else if (ins.kind === 'doubler') {
        const delayMs = 8 + (p.delayMs ?? 0.35) * 24;
        this.delayIns.write((left + right) * 0.5);
        const wet = this.delayIns.read((delayMs / 1000) * sampleRate);
        const width = p.width ?? 0.55;
        const mix = p.mix ?? 0.4;
        left = left * (1 - mix) + wet * mix * (0.7 + width * 0.3);
        right = right * (1 - mix) + wet * mix * (0.7 - width * 0.3);
      } else if (ins.kind === 'room') {
        this.delayIns.write((left + right) * 0.5);
        const size = p.size ?? 0.4;
        const decay = p.decay ?? 0.45;
        const wet =
          this.delayIns.read((0.02 + size * 0.06) * sampleRate) * (0.4 + decay * 0.5) +
          this.delayIns.read((0.035 + size * 0.08) * sampleRate) * 0.25;
        const mix = p.mix ?? 0.25;
        left = left * (1 - mix) + wet * mix;
        right = right * (1 - mix) + wet * mix;
      } else if (ins.kind === 'unmask') {
        const thr = p.threshold ?? 0.45;
        const speed = 0.001 + (p.speed ?? 0.4) * 0.02;
        const level = Math.max(Math.abs(left), Math.abs(right));
        this.unmaskEnv += (level - this.unmaskEnv) * speed;
        const duck = this.unmaskEnv > thr * 0.5 ? Math.max(0.55, 1 - (this.unmaskEnv - thr * 0.5)) : 1;
        left *= 0.85 + duck * 0.15;
        right *= 0.85 + duck * 0.15;
      }
      // --- EQAMUZ REAL DSP PROCESSORS ---
      else if (ins.kind === 'eqamuz-pro-eq') {
        const mod = ab?.pro_eq;
        const out = this.#processEqamuzProEq(ins.id, left, right, mod, sampleRate);
        left = out[0];
        right = out[1];
      } else if (ins.kind === 'eqamuz-comp') {
        const mod = ab?.comp;
        const out = this.#processEqamuzComp(ins.id, left, right, mod, sampleRate);
        left = out[0];
        right = out[1];
      } else if (ins.kind === 'eqamuz-saturator') {
        const mod = ab?.saturator;
        const out = this.#processEqamuzSaturator(left, right, mod);
        left = out[0];
        right = out[1];
      } else if (ins.kind === 'eqamuz-delay') {
        const mod = ab?.delay;
        const out = this.#processEqamuzDelay(ins.id, left, right, mod, sampleRate);
        left = out[0];
        right = out[1];
      } else if (ins.kind === 'eqamuz-reverb') {
        const mod = ab?.reverb;
        const out = this.#processEqamuzReverb(ins.id, left, right, mod, sampleRate);
        left = out[0];
        right = out[1];
      } else if (ins.kind === 'eqamuz-imager') {
        const mod = ab?.imager;
        const out = this.#processEqamuzImager(left, right, mod);
        left = out[0];
        right = out[1];
      } else if (ins.kind === 'eqamuz-limiter') {
        const mod = ab?.limiter;
        const out = this.#processEqamuzLimiter(ins.id, left, right, mod, sampleRate);
        left = out[0];
        right = out[1];
      } else if (ins.kind === 'eqamuz-vocal') {
        const mod = ab?.vocal;
        const out = this.#processEqamuzVocal(ins.id, left, right, mod, sampleRate);
        left = out[0];
        right = out[1];
      } else if (ins.kind === 'eqamuz-lead') {
        const mod = ab?.lead;
        const out = this.#processEqamuzLead(ins.id, left, right, mod, sampleRate);
        left = out[0];
        right = out[1];
      } else if (ins.kind === 'eqamuz-electric') {
        const mod = ab?.electric;
        const out = this.#processEqamuzElectric(ins.id, left, right, mod, sampleRate);
        left = out[0];
        right = out[1];
      } else if (ins.kind === 'eqamuz' || ins.kind === 'eqamuz-suite') {
        const out = this.#processEqamuzSuite(ins.id, left, right, ab, sampleRate);
        left = out[0];
        right = out[1];
      }
    }
    return [left, right];
  }

  #processEqamuzProEq(insId, l, r, mod, sampleRate) {
    if (mod && (mod.enabled === false || mod.bypass)) return [l, r];
    let fx = this.eqamuzFx.get(insId);
    if (!fx || fx.type !== 'pro_eq') {
      fx = {
        type: 'pro_eq',
        biquadsL: Array.from({ length: 8 }, () => new Biquad()),
        biquadsR: Array.from({ length: 8 }, () => new Biquad()),
        lastSig: ''
      };
      this.eqamuzFx.set(insId, fx);
    }
    const bands = mod?.bands;
    if (bands && Array.isArray(bands)) {
      const sig = bands.map((b) => `${b.type}:${b.freqHz}:${b.gainDb}:${b.q}:${b.enabled}`).join('|');
      if (sig !== fx.lastSig) {
        fx.lastSig = sig;
        for (let i = 0; i < 8 && i < bands.length; i += 1) {
          const b = bands[i];
          const bqL = fx.biquadsL[i];
          const bqR = fx.biquadsR[i];
          if (!b || !b.enabled) continue;
          const freq = Math.max(20, Math.min(sampleRate * 0.48, b.freqHz || 1000));
          const gain = b.gainDb || 0;
          const q = Math.max(0.1, b.q || 0.707);
          const apply = (bq) => {
            if (b.type === 'HPF') bq.setHighpass(freq, q, sampleRate);
            else if (b.type === 'LOW_SHELF') bq.setLowshelf(freq, gain, sampleRate);
            else if (b.type === 'HIGH_SHELF') bq.setHighshelf(freq, gain, sampleRate);
            else if (b.type === 'LPF') bq.setLowpass(freq, q, sampleRate);
            else bq.setPeaking(freq, gain, q, sampleRate);
          };
          apply(bqL);
          apply(bqR);
        }
      }
      let outL = l;
      let outR = r;
      for (let i = 0; i < 8 && i < bands.length; i += 1) {
        const b = bands[i];
        if (!b || !b.enabled) continue;
        if (Math.abs(b.gainDb || 0) < 0.01 && (b.type === 'BELL' || b.type === 'BELL_DYNAMIC')) continue;
        outL = fx.biquadsL[i].process(outL);
        outR = fx.biquadsR[i].process(outR);
      }
      return [outL, outR];
    }
    return [l, r];
  }

  #processEqamuzComp(insId, l, r, mod, sampleRate) {
    if (mod && (mod.enabled === false || mod.bypass)) return [l, r];
    let fx = this.eqamuzFx.get(insId);
    if (!fx || fx.type !== 'comp') {
      fx = { type: 'comp', env: 0 };
      this.eqamuzFx.set(insId, fx);
    }
    const thresholdDb = mod?.thresholdDb ?? -18;
    const ratio = Math.max(1, mod?.ratio ?? 4);
    const attackMs = Math.max(0.1, mod?.attackMs ?? 12);
    const releaseMs = Math.max(5, mod?.releaseMs ?? 140);
    const makeupDb = mod?.makeupDb ?? 0;
    const mix = mod?.mix !== undefined ? mod.mix : 1.0;

    const thrLinear = Math.pow(10, thresholdDb / 20);
    const atk = Math.exp(-1 / (sampleRate * (attackMs / 1000)));
    const rel = Math.exp(-1 / (sampleRate * (releaseMs / 1000)));
    const level = Math.max(Math.abs(l), Math.abs(r));

    if (level > fx.env) fx.env = atk * fx.env + (1 - atk) * level;
    else fx.env = rel * fx.env + (1 - rel) * level;

    let gr = 1.0;
    if (fx.env > thrLinear) {
      const over = fx.env / thrLinear;
      gr = Math.pow(over, 1 / ratio - 1);
    }
    const makeupGain = Math.pow(10, makeupDb / 20);
    const wetL = l * gr * makeupGain;
    const wetR = r * gr * makeupGain;
    return [l * (1 - mix) + wetL * mix, r * (1 - mix) + wetR * mix];
  }

  #processEqamuzSaturator(l, r, mod) {
    if (mod && (mod.enabled === false || mod.bypass)) return [l, r];
    const driveNorm = mod?.drive ?? 0.35;
    const drive = 1 + driveNorm * 9;
    const mode = String(mod?.characterMode || 'TAPE II');
    const mix = mod?.mix !== undefined ? mod.mix : 1.0;
    const outGain = Math.pow(10, (mod?.outputGainDb || 0) / 20);

    const saturate = (x) => {
      let sat = x * drive;
      if (mode.includes('TAPE')) {
        sat = Math.tanh(sat);
      } else if (mode.includes('TUBE')) {
        sat = sat > 0 ? Math.tanh(sat) : Math.tanh(sat * 1.2) * 0.85;
      } else if (mode.includes('TRANSISTOR')) {
        sat = Math.max(-1.0, Math.min(1.0, sat * 1.25)) * 0.85;
      } else {
        sat = Math.max(-0.95, Math.min(0.95, sat));
      }
      return (sat / Math.tanh(drive)) * outGain;
    };

    const wetL = saturate(l);
    const wetR = saturate(r);
    return [l * (1 - mix) + wetL * mix, r * (1 - mix) + wetR * mix];
  }

  #processEqamuzDelay(insId, l, r, mod, sampleRate) {
    if (mod && (mod.enabled === false || mod.bypass)) return [l, r];
    let fx = this.eqamuzFx.get(insId);
    if (!fx || fx.type !== 'delay') {
      const maxSamples = Math.floor(sampleRate * 2.5);
      fx = {
        type: 'delay',
        lineL: new DelayLine(maxSamples),
        lineR: new DelayLine(maxSamples)
      };
      this.eqamuzFx.set(insId, fx);
    }
    const timeMs = mod?.timeMs ?? 250;
    const delaySamples = Math.floor((timeMs / 1000) * sampleRate);
    const feedback = Math.max(0, Math.min(0.95, mod?.feedback ?? 0.35));
    const mix = mod?.mix !== undefined ? mod.mix : 0.4;

    const delayedL = fx.lineL.read(delaySamples);
    const delayedR = fx.lineR.read(delaySamples);

    fx.lineL.write(l + delayedL * feedback);
    fx.lineR.write(r + delayedR * feedback);

    return [l * (1 - mix) + delayedL * mix, r * (1 - mix) + delayedR * mix];
  }

  #processEqamuzReverb(insId, l, r, mod, sampleRate) {
    if (mod && (mod.enabled === false || mod.bypass)) return [l, r];
    let fx = this.eqamuzFx.get(insId);
    if (!fx || fx.type !== 'reverb') {
      fx = { type: 'reverb', engine: new SimpleReverb(sampleRate) };
      this.eqamuzFx.set(insId, fx);
    }
    const decay = mod?.decaySec !== undefined ? Math.min(1.0, mod.decaySec / 6.0) : 0.5;
    const size = mod?.size ?? 0.55;
    const mix = mod?.mix !== undefined ? mod.mix : 0.35;
    const wet = fx.engine.process((l + r) * 0.5, size, decay, 0.35);
    return [l * (1 - mix) + wet * mix, r * (1 - mix) + wet * mix];
  }

  #processEqamuzImager(l, r, mod) {
    if (mod && (mod.enabled === false || mod.bypass)) return [l, r];
    const width = (mod?.widthPercent !== undefined ? mod.widthPercent : 100) / 100;
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5 * width;
    return [mid + side, mid - side];
  }

  #processEqamuzLimiter(insId, l, r, mod, sampleRate) {
    if (mod && (mod.enabled === false || mod.bypass)) return [l, r];
    const inGain = Math.pow(10, (mod?.inputGainDb || 0) / 20);
    const ceilingDb = mod?.ceilingDb ?? -0.5;
    const ceilLinear = Math.pow(10, ceilingDb / 20);
    let outL = l * inGain;
    let outR = r * inGain;
    if (Math.abs(outL) > ceilLinear) {
      outL = Math.sign(outL) * (ceilLinear + (Math.abs(outL) - ceilLinear) * 0.1);
      outL = Math.max(-ceilLinear, Math.min(ceilLinear, outL));
    }
    if (Math.abs(outR) > ceilLinear) {
      outR = Math.sign(outR) * (ceilLinear + (Math.abs(outR) - ceilLinear) * 0.1);
      outR = Math.max(-ceilLinear, Math.min(ceilLinear, outR));
    }
    return [outL, outR];
  }

  #processEqamuzVocal(insId, l, r, mod, sampleRate) {
    if (mod && (mod.enabled === false || mod.bypass)) return [l, r];
    const compOut = this.#processEqamuzComp(insId + '_lev', l, r, {
      thresholdDb: -20,
      ratio: 3.5,
      attackMs: 8,
      releaseMs: 120,
      makeupDb: 2.5,
      mix: 0.85
    }, sampleRate);
    const airGain = 1.25;
    return [compOut[0] * airGain, compOut[1] * airGain];
  }

  #processEqamuzLead(insId, l, r, mod, sampleRate) {
    if (mod && (mod.enabled === false || mod.bypass)) return [l, r];
    const drive = mod?.drive ?? 0.4;
    const boost = Math.pow(10, (mod?.boostDb || 3.0) / 20);
    const sat = this.#processEqamuzSaturator(l, r, { drive: drive * 0.8, characterMode: 'TUBE', mix: 0.6 });
    return [sat[0] * boost, sat[1] * boost];
  }

  #processEqamuzElectric(insId, l, r, mod, sampleRate) {
    if (mod && (mod.enabled === false || mod.bypass)) return [l, r];
    const gain = mod?.gain ?? 0.5;
    return this.#processEqamuzSaturator(l, r, { drive: gain, characterMode: 'TRANSISTOR', mix: 0.75 });
  }

  #processEqamuzSuite(insId, l, r, ab, sampleRate) {
    if (!ab) return [l, r];
    let out = [l, r];
    if (ab.vocal?.enabled && !ab.vocal?.bypass) out = this.#processEqamuzVocal(insId + '_vocal', out[0], out[1], ab.vocal, sampleRate);
    if (ab.lead?.enabled && !ab.lead?.bypass) out = this.#processEqamuzLead(insId + '_lead', out[0], out[1], ab.lead, sampleRate);
    if (ab.electric?.enabled && !ab.electric?.bypass) out = this.#processEqamuzElectric(insId + '_electric', out[0], out[1], ab.electric, sampleRate);
    if (ab.pro_eq?.enabled && !ab.pro_eq?.bypass) out = this.#processEqamuzProEq(insId + '_eq', out[0], out[1], ab.pro_eq, sampleRate);
    if (ab.comp?.enabled && !ab.comp?.bypass) out = this.#processEqamuzComp(insId + '_comp', out[0], out[1], ab.comp, sampleRate);
    if (ab.saturator?.enabled && !ab.saturator?.bypass) out = this.#processEqamuzSaturator(out[0], out[1], ab.saturator);
    if (ab.delay?.enabled && !ab.delay?.bypass) out = this.#processEqamuzDelay(insId + '_delay', out[0], out[1], ab.delay, sampleRate);
    if (ab.reverb?.enabled && !ab.reverb?.bypass) out = this.#processEqamuzReverb(insId + '_reverb', out[0], out[1], ab.reverb, sampleRate);
    if (ab.imager?.enabled && !ab.imager?.bypass) out = this.#processEqamuzImager(out[0], out[1], ab.imager);
    if (ab.limiter?.enabled && !ab.limiter?.bypass) out = this.#processEqamuzLimiter(insId + '_limiter', out[0], out[1], ab.limiter, sampleRate);
    return out;
  }

  processStereo(l, r, sampleRate) {
    let left = l * this.preGain;
    let right = r * this.preGain;
    if (this.phaseInvert) {
      left = -left;
      right = -right;
    }
    if (this.eqEnabled) {
      left = this.#filterSample(this.eqL, left, this.eqBands);
      right = this.#filterSample(this.eqR, right, this.eqBands);
    }
    left = this.#compress(left, sampleRate);
    right = this.#compress(right, sampleRate);
    return this.#processInserts(left, right, sampleRate);
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

    this.fxReverb = new SimpleReverb(sampleRate);
    this.fxDelayL = new DelayLine(Math.floor(sampleRate * 2));
    this.fxDelayR = new DelayLine(Math.floor(sampleRate * 2));
    this.fxBuses = {
      reverb: { enabled: true, size: 0.55, decay: 0.5, precut: 0.35, busVolDb: -6 },
      delay: { enabled: true, syncBeats: 0.25, feedback: 0.35, busVolDb: -8, bpm: 120 }
    };

    // Analysis ring for spectrum (downsampled mono)
    this.analysisBuf = new Float32Array(2048);
    this.analysisWrite = 0;
    this.analysisListen = 'stereo'; // stereo | mid | side

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
        if (msg.preGain !== undefined) track.preGain = msg.preGain;
        if (msg.phaseInvert !== undefined) track.phaseInvert = msg.phaseInvert;
        if (msg.eqEnabled !== undefined) track.eqEnabled = msg.eqEnabled;
        if (msg.eqBands !== undefined) {
          track.eqBands = msg.eqBands;
          track.syncEq(sampleRate);
        }
        if (msg.compEnabled !== undefined) track.compEnabled = msg.compEnabled;
        if (msg.comp !== undefined) track.comp = msg.comp;
        if (msg.inserts !== undefined) track.inserts = msg.inserts;
        if (msg.sendReverb !== undefined) track.sendReverb = msg.sendReverb;
        if (msg.sendDelay !== undefined) track.sendDelay = msg.sendDelay;
        break;
      }

      case 'fxBuses':
        if (msg.reverb) Object.assign(this.fxBuses.reverb, msg.reverb);
        if (msg.delay) Object.assign(this.fxBuses.delay, msg.delay);
        break;

      case 'analysisListen':
        if (msg.mode) this.analysisListen = msg.mode;
        break;

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
    const revIn = new Float32Array(blockSize);
    const dlyIn = new Float32Array(blockSize);

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
      const panL = track.pan <= 0 ? 1 : 1 - track.pan;
      const panR = track.pan >= 0 ? 1 : 1 + track.pan;
      const gainLeft = gain * panL;
      const gainRight = gain * panR;

      let peak = 0;
      let sum = 0;

      for (let i = 0; i < blockSize; i += 1) {
        const processed = track.processStereo(mixL[i], mixR[i], sampleRate);
        const l = processed[0] * gainLeft;
        const r = processed[1] * gainRight;
        left[i] += l;
        if (right !== left) right[i] += r;

        if (!track.muted) {
          revIn[i] += ((l + r) * 0.5) * track.sendReverb;
          dlyIn[i] += ((l + r) * 0.5) * track.sendDelay;
        }

        const magnitude = Math.max(Math.abs(l), Math.abs(r));
        if (magnitude > peak) peak = magnitude;
        sum += magnitude * magnitude;
      }

      track.peak = Math.max(peak, track.peak * 0.72);
      track.sumSquares = sum / blockSize;
    }

    // FX buses
    const rev = this.fxBuses.reverb;
    const dly = this.fxBuses.delay;
    const revGain = rev.enabled ? Math.pow(10, (rev.busVolDb ?? -6) / 20) : 0;
    const dlyGain = dly.enabled ? Math.pow(10, (dly.busVolDb ?? -8) / 20) : 0;
    const bpm = dly.bpm || this.metronomeBpm || 120;
    const delaySamples = ((dly.syncBeats || 0.25) * 60) / bpm * sampleRate;

    for (let i = 0; i < blockSize; i += 1) {
      if (revGain > 0.0001 && revIn[i] !== 0) {
        const wet = this.fxReverb.process(revIn[i], rev.size ?? 0.55, rev.decay ?? 0.5, rev.precut ?? 0.35);
        left[i] += wet * revGain;
        if (right !== left) right[i] += wet * revGain;
      }
      if (dlyGain > 0.0001) {
        const fb = dly.feedback ?? 0.35;
        const delayedL = this.fxDelayL.read(delaySamples);
        const delayedR = this.fxDelayR.read(delaySamples);
        this.fxDelayL.write(dlyIn[i] + delayedL * fb);
        this.fxDelayR.write(dlyIn[i] + delayedR * fb);
        left[i] += delayedL * dlyGain;
        if (right !== left) right[i] += delayedR * dlyGain;
      }
    }

    this.#renderClicks(left, right, blockSize);

    let masterPeak = 0;
    let masterSum = 0;
    let truePeak = 0;

    for (let i = 0; i < blockSize; i += 1) {
      left[i] *= this.masterVolume;
      if (right !== left) right[i] *= this.masterVolume;

      left[i] = Math.tanh(left[i]);
      if (right !== left) right[i] = Math.tanh(right[i]);

      let l = left[i];
      let r = right !== left ? right[i] : left[i];
      if (this.analysisListen === 'mid') {
        const m = (l + r) * 0.5;
        l = m;
        r = m;
        left[i] = m;
        if (right !== left) right[i] = m;
      } else if (this.analysisListen === 'side') {
        const s = (l - r) * 0.5;
        l = s;
        r = -s;
        left[i] = s;
        if (right !== left) right[i] = -s;
      }

      const mono = (l + r) * 0.5;
      this.analysisBuf[this.analysisWrite] = mono;
      this.analysisWrite = (this.analysisWrite + 1) % this.analysisBuf.length;

      const magnitude = Math.max(Math.abs(l), Math.abs(r));
      if (magnitude > masterPeak) masterPeak = magnitude;
      if (magnitude > truePeak) truePeak = magnitude;
      masterSum += magnitude * magnitude;
    }

    this.masterPeak = Math.max(masterPeak, this.masterPeak * 0.72);
    this.masterSumSquares = masterSum / blockSize;
    this.masterTruePeak = Math.max(truePeak, (this.masterTruePeak || 0) * 0.995);

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

    // Lightweight spectrum snapshot (64 bins magnitude)
    const spectrum = new Float32Array(64);
    const n = this.analysisBuf.length;
    for (let bin = 0; bin < 64; bin += 1) {
      let re = 0;
      let im = 0;
      const freq = bin / 64;
      for (let i = 0; i < n; i += 8) {
        const x = this.analysisBuf[(this.analysisWrite + i) % n];
        const ang = -2 * Math.PI * freq * i;
        re += x * Math.cos(ang);
        im += x * Math.sin(ang);
      }
      spectrum[bin] = Math.sqrt(re * re + im * im) / (n / 8);
    }

    this.port.postMessage({
      type: 'clock',
      samplePosition: this.transportSample,
      contextTime: currentTime,
      playing: this.playing,
      meters,
      master: {
        peak: this.masterPeak,
        rms: Math.sqrt(this.masterSumSquares),
        truePeak: this.masterTruePeak || 0
      },
      spectrum: Array.from(spectrum)
    });
  }
}

registerProcessor('qamuz-engine', EngineProcessor);
