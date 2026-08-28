/**
 * `AudioBackend` on top of Web Audio and a single AudioWorklet node.
 *
 * Identical behaviour on Windows and macOS, available from day one. Latency is
 * whatever the platform WebView gives (roughly 10-30 ms), which is fine for
 * writing, editing and playback but not for tracking a live performance with
 * monitoring. That is why this sits behind an interface: the native Rust backend
 * replaces it without touching the UI.
 */

import type { TimeSignature } from '$lib/core/time';
import {
  AudioBackendError,
  type AudioBackend,
  type AudioBackendState,
  type InstrumentName,
  type ScheduledAudioClip,
  type ScheduledMIDIEvent,
  type TrackMeterLevel
} from './backend';

const WORKLET_URL = `${import.meta.env.BASE_URL}worklets/engine-processor.js`;
const PROCESSOR_NAME = 'qamuz-engine';
const SILENT_METER: TrackMeterLevel = { peak: 0, rms: 0 };

interface ClockMessage {
  type: 'clock';
  samplePosition: number;
  contextTime: number;
  playing: boolean;
  meters: Record<string, TrackMeterLevel>;
  master: TrackMeterLevel;
}

export class WebAudioBackend implements AudioBackend {
  #context: AudioContext | null = null;
  #node: AudioWorkletNode | null = null;
  #state: AudioBackendState = 'idle';

  #playing = false;
  #clockSample = 0;
  #clockContextTime = 0;
  #pausedSample = 0;

  #meters = new Map<string, TrackMeterLevel>();
  #master: TrackMeterLevel = SILENT_METER;

  #buffers = new Map<string, AudioBuffer>();
  #masterVolume = 1;
  #startPromise: Promise<void> | null = null;

  /**
   * Main-thread mirror of the state the worklet holds. The worklet cannot be
   * queried, so an offline bounce needs a local copy to replay into a fresh
   * instance.
   */
  #trackParams = new Map<string, Record<string, unknown>>();
  #events: ScheduledMIDIEvent[] = [];
  #clips: (ScheduledAudioClip & { fileID: string })[] = [];
  #metronome = { enabled: false, volume: 0.7, bpm: 120, numerator: 4 };

  get state(): AudioBackendState {
    return this.#state;
  }

  get isRunning(): boolean {
    return this.#state === 'running';
  }

  get sampleRate(): number {
    return this.#context?.sampleRate ?? 48000;
  }

  get bufferSize(): number {
    return 128;
  }

  /** Exposed so callers can decode files at the engine's own sample rate. */
  get audioContext(): AudioContext | null {
    return this.#context;
  }

  get isPlaying(): boolean {
    return this.#playing;
  }

  get masterVolume(): number {
    return this.#masterVolume;
  }

  /**
   * The worklet reports its clock every few blocks; between reports the position
   * is extrapolated from the context clock. Both are the same clock, so this is
   * precise rather than a guess, and it gives the UI a value on every frame.
   */
  get currentSamplePosition(): number {
    if (!this.#playing || !this.#context) return this.#pausedSample;

    const elapsed = (this.#context.currentTime - this.#clockContextTime) * this.sampleRate;
    return Math.max(0, this.#clockSample + elapsed);
  }

  async start(): Promise<void> {
    if (this.#startPromise) return this.#startPromise;

    this.#startPromise = this.#startInternal();
    return this.#startPromise;
  }

  async #startInternal(): Promise<void> {
    this.#state = 'starting';

    try {
      const context = new AudioContext({ latencyHint: 'interactive' });
      await context.audioWorklet.addModule(WORKLET_URL);

      const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      node.port.onmessage = (event: MessageEvent<ClockMessage>) => this.#onMessage(event.data);
      node.connect(context.destination);

      this.#context = context;
      this.#node = node;

      // Autoplay policy: the context can stay suspended until a user gesture.
      if (context.state !== 'running') {
        await context.resume().catch(() => undefined);
      }
      this.#state = this.#contextState(context);
    } catch (error) {
      this.#state = 'failed';
      this.#startPromise = null;
      throw new AudioBackendError(`Could not start the audio engine: ${(error as Error).message}`);
    }
  }

  #contextState(context: AudioContext): AudioBackendState {
    const state: string = context.state;
    if (state === 'running') return 'running';
    if (state === 'closed') return 'idle';
    return 'suspended';
  }

  /** Call from a user gesture if the context was blocked by autoplay policy. */
  async resume(): Promise<void> {
    const context = this.#context;
    if (!context) {
      await this.start();
      return;
    }

    if (context.state !== 'running') await context.resume();
    this.#state = this.#contextState(context);
  }

  stop(): void {
    this.#node?.disconnect();
    this.#node = null;
    void this.#context?.close();
    this.#context = null;
    this.#state = 'idle';
    this.#playing = false;
    this.#startPromise = null;
  }

  #onMessage(message: ClockMessage): void {
    if (message.type !== 'clock') return;

    this.#clockSample = message.samplePosition;
    this.#clockContextTime = message.contextTime;
    if (!message.playing) this.#pausedSample = message.samplePosition;

    this.#meters.clear();
    for (const [id, level] of Object.entries(message.meters)) {
      this.#meters.set(id, level);
    }
    this.#master = message.master;
  }

  #post(message: Record<string, unknown>): void {
    this.#node?.port.postMessage(message);
  }

  // --- tracks ---

  createTrack(trackID: string): void {
    if (!this.#trackParams.has(trackID)) this.#trackParams.set(trackID, {});
    this.#post({ type: 'createTrack', trackID });
  }

  removeTrack(trackID: string): void {
    this.#post({ type: 'removeTrack', trackID });
    this.#trackParams.delete(trackID);
    this.#meters.delete(trackID);
    this.#clips = this.#clips.filter((c) => c.trackID !== trackID);
  }

  #setTrackParam(trackID: string, key: string, value: unknown): void {
    const params = this.#trackParams.get(trackID) ?? {};
    params[key] = value;
    this.#trackParams.set(trackID, params);
    this.#post({ type: 'trackParams', trackID, [key]: value });
  }

  setTrackVolume(trackID: string, volume: number): void {
    this.#setTrackParam(trackID, 'volume', volume);
  }

  setTrackPan(trackID: string, pan: number): void {
    this.#setTrackParam(trackID, 'pan', pan);
  }

  setTrackMute(trackID: string, muted: boolean): void {
    this.#setTrackParam(trackID, 'muted', muted);
  }

  setTrackInstrument(trackID: string, instrument: InstrumentName): void {
    this.#setTrackParam(trackID, 'instrument', instrument);
  }

  // --- MIDI ---

  scheduleMIDIEvent(event: ScheduledMIDIEvent): void {
    this.scheduleMIDIEvents([event]);
  }

  scheduleMIDIEvents(events: ScheduledMIDIEvent[]): void {
    if (events.length === 0) return;
    this.#events = this.#events.concat(events);
    this.#post({ type: 'scheduleEvents', events });
  }

  sendImmediateMIDI(trackID: string, status: number, data1: number, data2: number): void {
    this.#post({ type: 'immediateMIDI', trackID, status, data1, data2 });
  }

  clearScheduledMIDIEvents(): void {
    this.#events = [];
    this.#post({ type: 'clearEvents' });
  }

  // --- audio clips ---

  registerAudioBuffer(fileID: string, buffer: AudioBuffer): void {
    if (this.#buffers.has(fileID)) return;
    this.#buffers.set(fileID, buffer);

    // Copies rather than transfers: the main thread keeps the buffer for
    // waveform drawing and re-scheduling.
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      channels.push(buffer.getChannelData(c).slice());
    }

    this.#post({ type: 'registerBuffer', fileID, channels, length: buffer.length });
  }

  hasAudioBuffer(fileID: string): boolean {
    return this.#buffers.has(fileID);
  }

  audioBuffer(fileID: string): AudioBuffer | undefined {
    return this.#buffers.get(fileID);
  }

  scheduleAudioClip(fileID: string, clip: ScheduledAudioClip): void {
    const entry = { ...clip, fileID };
    this.#clips.push(entry);
    this.#post({ type: 'scheduleClip', clip: entry });
  }

  clearAudioClips(): void {
    this.#clips = [];
    this.#post({ type: 'clearClips' });
  }

  // --- transport ---

  play(fromSample: number): void {
    this.#playing = true;
    this.#clockSample = fromSample;
    this.#clockContextTime = this.#context?.currentTime ?? 0;
    this.#post({ type: 'play', fromSample: Math.round(fromSample) });
  }

  pause(): void {
    this.#playing = false;
    this.#pausedSample = this.currentSamplePosition;
    this.#post({ type: 'pause' });
  }

  stopPlayback(): void {
    this.#playing = false;
    this.#pausedSample = 0;
    this.#post({ type: 'stop' });
  }

  seek(toSample: number): void {
    const target = Math.max(0, Math.round(toSample));
    this.#clockSample = target;
    this.#clockContextTime = this.#context?.currentTime ?? 0;
    if (!this.#playing) this.#pausedSample = target;
    this.#post({ type: 'seek', toSample: target });
  }

  // --- metronome and master ---

  setMetronomeEnabled(enabled: boolean): void {
    this.#metronome.enabled = enabled;
    this.#post({ type: 'metronome', enabled });
  }

  setMetronomeVolume(volume: number): void {
    this.#metronome.volume = volume;
    this.#post({ type: 'metronome', volume });
  }

  setMetronomeGrid(bpm: number, timeSignature: TimeSignature): void {
    this.#metronome.bpm = bpm;
    this.#metronome.numerator = timeSignature.numerator;
    this.#post({ type: 'metronome', bpm, numerator: timeSignature.numerator });
  }

  setMasterVolume(volume: number): void {
    this.#masterVolume = Math.max(0, Math.min(2, volume));
    this.#post({ type: 'masterVolume', volume: this.#masterVolume });
  }

  meterLevel(trackID: string): TrackMeterLevel {
    return this.#meters.get(trackID) ?? SILENT_METER;
  }

  masterMeterLevel(): TrackMeterLevel {
    return this.#master;
  }

  /**
   * Renders a sample range through a fresh instance of the same worklet in an
   * OfflineAudioContext, so a bounce sounds like what was heard live.
   */
  async bounceOffline(
    startSample: number,
    endSample: number,
    onProgress?: (fraction: number) => void
  ): Promise<AudioBuffer> {
    const length = Math.max(1, Math.round(endSample - startSample));
    const context = new OfflineAudioContext({
      numberOfChannels: 2,
      length,
      sampleRate: this.sampleRate
    });

    await context.audioWorklet.addModule(WORKLET_URL);

    const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });
    node.connect(context.destination);

    onProgress?.(0);

    // The offline node starts empty, so replay the mirrored engine state.
    for (const [fileID, buffer] of this.#buffers) {
      const channels: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c += 1) {
        channels.push(buffer.getChannelData(c).slice());
      }
      node.port.postMessage({ type: 'registerBuffer', fileID, channels, length: buffer.length });
    }

    for (const [trackID, params] of this.#trackParams) {
      node.port.postMessage({ type: 'createTrack', trackID });
      node.port.postMessage({ type: 'trackParams', trackID, ...params });
    }

    for (const clip of this.#clips) node.port.postMessage({ type: 'scheduleClip', clip });
    if (this.#events.length > 0) {
      node.port.postMessage({ type: 'scheduleEvents', events: this.#events });
    }

    // A bounce should not contain the click track.
    node.port.postMessage({
      type: 'metronome',
      enabled: false,
      bpm: this.#metronome.bpm,
      numerator: this.#metronome.numerator
    });
    node.port.postMessage({ type: 'masterVolume', volume: this.#masterVolume });
    node.port.postMessage({ type: 'play', fromSample: Math.round(startSample) });

    const rendered = await context.startRendering();
    onProgress?.(1);
    return rendered;
  }
}
