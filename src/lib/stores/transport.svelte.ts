/**
 * Transport state. Port of DAWCore/Transport/TransportState.swift.
 *
 * The audio backend owns the clock: it reports a sample position, which becomes
 * `playheadBeats`. `smoothPlayheadBeats` is a display-rate interpolation of that
 * value, because audio callbacks arrive in buffer-sized jumps and a playhead
 * driven straight off them visibly stutters. The 1.0 build solves this with a
 * CVDisplayLink; the browser equivalent is requestAnimationFrame.
 */

import type { AudioBackend } from '$lib/audio/backend';
import {
  COMMON_TIME,
  DEFAULT_SAMPLE_RATE,
  beatsPerBar,
  clampBpm,
  formatBarsBeats,
  formatClock,
  fromBeats,
  secondsToBeats,
  type TimeSignature
} from '$lib/core/time';

export type TransportEvent =
  | 'play'
  | 'stop'
  | 'pause'
  | 'record'
  | 'stopRecording'
  | 'returnToZero'
  | 'loopChanged'
  | 'tempoChanged'
  | 'seek';

/** How aggressively the drawn playhead chases the audio clock. */
const SMOOTHING_FACTOR = 0.3;

/** Ignore play/pause toggles closer together than this, as the 1.0 build does. */
const TOGGLE_DEBOUNCE_MS = 200;

export class TransportStore {
  bpm = $state(120);
  timeSignature = $state<TimeSignature>({ ...COMMON_TIME });
  sampleRate = $state(DEFAULT_SAMPLE_RATE);

  isPlaying = $state(false);
  isPaused = $state(false);
  isRecording = $state(false);

  /** Authoritative position, in beats, from the audio clock. */
  playheadBeats = $state(0);
  /** Interpolated position used for drawing. */
  smoothPlayheadBeats = $state(0);

  isLoopEnabled = $state(false);
  loopStartBeats = $state(0);
  loopEndBeats = $state(4);

  isMetronomeEnabled = $state(false);
  metronomeVolume = $state(0.7);

  isCountInEnabled = $state(false);
  countInBars = $state(1);

  /** Beat position of 1|1. File time 0 can sit before this (pickup). */
  barOneBeats = $state(0);

  #backend: AudioBackend | null = null;
  #frame: number | null = null;
  #targetBeats = 0;
  #lastToggle = 0;
  #listeners = new Set<(event: TransportEvent) => void>();

  readonly playheadSeconds = $derived((this.playheadBeats / this.bpm) * 60);
  readonly barsDisplay = $derived(formatBarsBeats(this.playheadBeats, this.timeSignature));
  readonly timeDisplay = $derived(formatClock(this.playheadSeconds));
  readonly currentBar = $derived(
    Math.floor(this.playheadBeats / beatsPerBar(this.timeSignature)) + 1
  );

  bind(backend: AudioBackend): void {
    this.#backend = backend;
    this.sampleRate = backend.sampleRate;
    backend.setMetronomeEnabled(this.isMetronomeEnabled);
    backend.setMetronomeVolume(this.metronomeVolume);
  }

  on(listener: (event: TransportEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(event: TransportEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  // --- playback ---

  play(): void {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.isPaused = false;

    this.#emit('play');
    this.#backend?.play(this.#beatsToSamples(this.playheadBeats));
    this.#startFrameLoop();
  }

  pause(): void {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    this.isPaused = true;
    this.isRecording = false;

    this.#backend?.pause();
    this.#stopFrameLoop();
    this.#emit('pause');
  }

  stop(): void {
    const wasPlaying = this.isPlaying;

    this.isPlaying = false;
    this.isPaused = false;
    this.isRecording = false;

    this.#backend?.stopPlayback();
    this.#stopFrameLoop();

    if (wasPlaying) {
      this.setPlayheadBeats(this.isLoopEnabled ? this.loopStartBeats : 0);
    }

    this.#emit('stop');
  }

  togglePlayPause(): void {
    const now = performance.now();
    if (now - this.#lastToggle < TOGGLE_DEBOUNCE_MS) return;
    this.#lastToggle = now;

    if (this.isPlaying) this.pause();
    else this.play();
  }

  startRecording(): void {
    this.isRecording = true;
    if (!this.isPlaying) this.play();
    this.#emit('record');
  }

  stopRecording(): void {
    this.isRecording = false;
    this.#emit('stopRecording');
  }

  returnToZero(): void {
    this.setPlayheadBeats(this.barOneBeats);
    this.#emit('returnToZero');
  }

  /** Keep 1|1 locked to a file-time origin when tempo changes. */
  syncBarOneFromSeconds(originSeconds: number, bpm = this.bpm): void {
    this.barOneBeats = Math.max(0, secondsToBeats(Math.max(0, originSeconds), bpm));
  }

  // --- playhead ---

  setPlayheadBeats(beats: number, options: { seek?: boolean } = {}): void {
    const clamped = Math.max(0, beats);
    this.playheadBeats = clamped;
    this.#targetBeats = clamped;
    this.smoothPlayheadBeats = clamped;

    if (options.seek !== false) {
      this.#backend?.seek(this.#beatsToSamples(clamped));
      this.#emit('seek');
    }
  }

  nudgePlayheadBars(bars: number): void {
    const perBar = beatsPerBar(this.timeSignature);
    this.setPlayheadBeats(this.playheadBeats + bars * perBar);
  }

  goToBar(bar: number): void {
    const perBar = beatsPerBar(this.timeSignature);
    this.setPlayheadBeats(this.barOneBeats + Math.max(0, bar - 1) * perBar);
  }

  // --- tempo ---

  setTempo(bpm: number): void {
    this.bpm = clampBpm(bpm);
    this.#emit('tempoChanged');
  }

  nudgeTempo(delta: number): void {
    this.setTempo(this.bpm + delta);
  }

  /** Averages the intervals between taps, clamped to the legal BPM range. */
  tapTempo(tapTimes: number[]): void {
    if (tapTimes.length < 2) return;

    let total = 0;
    for (let i = 1; i < tapTimes.length; i += 1) total += tapTimes[i] - tapTimes[i - 1];

    const averageMs = total / (tapTimes.length - 1);
    if (averageMs <= 0) return;

    this.setTempo(60000 / averageMs);
  }

  // --- loop and metronome ---

  toggleLoop(): void {
    this.isLoopEnabled = !this.isLoopEnabled;
    this.#emit('loopChanged');
  }

  setLoopBeats(start: number, end: number): void {
    this.loopStartBeats = Math.max(0, Math.min(start, end));
    this.loopEndBeats = Math.max(this.loopStartBeats + 0.25, end);
    this.#emit('loopChanged');
  }

  toggleMetronome(): void {
    this.isMetronomeEnabled = !this.isMetronomeEnabled;
    this.#backend?.setMetronomeEnabled(this.isMetronomeEnabled);
  }

  setMetronomeVolume(volume: number): void {
    this.metronomeVolume = Math.max(0, Math.min(1, volume));
    this.#backend?.setMetronomeVolume(this.metronomeVolume);
  }

  // --- clock ---

  #beatsToSamples(beats: number): number {
    return fromBeats(beats, this.bpm, this.sampleRate).samples;
  }

  #startFrameLoop(): void {
    if (this.#frame !== null) return;

    const tick = () => {
      this.#frame = requestAnimationFrame(tick);
      this.#pollClock();
    };

    this.#targetBeats = this.playheadBeats;
    this.smoothPlayheadBeats = this.playheadBeats;
    this.#frame = requestAnimationFrame(tick);
  }

  #stopFrameLoop(): void {
    if (this.#frame === null) return;
    cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.smoothPlayheadBeats = this.playheadBeats;
  }

  #pollClock(): void {
    const backend = this.#backend;
    if (!backend || !this.isPlaying) return;

    const seconds = backend.currentSamplePosition / this.sampleRate;
    const beats = (seconds / 60) * this.bpm;

    this.playheadBeats = beats;
    this.#targetBeats = beats;

    if (this.isLoopEnabled && beats >= this.loopEndBeats) {
      const start = this.loopStartBeats;
      this.playheadBeats = start;
      this.#targetBeats = start;
      this.smoothPlayheadBeats = start;
      backend.seek(this.#beatsToSamples(start));
      this.#emit('seek');
      return;
    }

    this.#interpolate();
  }

  /** Chases the audio clock, snapping on backward jumps so loops do not slide. */
  #interpolate(): void {
    const diff = this.#targetBeats - this.smoothPlayheadBeats;

    if (diff < -1) {
      this.smoothPlayheadBeats = this.#targetBeats;
      return;
    }

    const factor = diff > 0 ? SMOOTHING_FACTOR : SMOOTHING_FACTOR * 0.5;
    this.smoothPlayheadBeats += diff * factor;
  }
}
