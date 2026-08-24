/**
 * Native `AudioBackend` that sits in front of the same contract as Web Audio.
 *
 * Device listing and a cpal output stream live in Rust. Mixing, instruments
 * and clip playback still go through `WebAudioBackend` until the native graph
 * is finished — the UI never has to know. VST3 hosting is the next pass on
 * this same class.
 */

import type { TimeSignature } from '$lib/core/time';
import { isTauri, tauriInvoke } from '$lib/persistence/tauri';
import {
  AudioBackendError,
  type AudioBackend,
  type AudioBackendState,
  type InstrumentName,
  type ScheduledAudioClip,
  type ScheduledMIDIEvent,
  type TrackMeterLevel
} from './backend';
import { WebAudioBackend } from './web-audio-backend';

export interface NativeAudioDevice {
  id: string;
  name: string;
  isOutput: boolean;
  isDefault: boolean;
  maxChannels: number;
  sampleRate: number;
}

export interface NativeBackendStatus {
  available: boolean;
  host: string;
  streamRunning: boolean;
  vst3Ready: boolean;
  message: string;
}

export async function listNativeAudioDevices(): Promise<NativeAudioDevice[]> {
  if (!isTauri()) return [];
  try {
    return await tauriInvoke<NativeAudioDevice[]>('list_audio_devices');
  } catch {
    return [];
  }
}

export async function nativeAudioStatus(): Promise<NativeBackendStatus | null> {
  if (!isTauri()) return null;
  try {
    return await tauriInvoke<NativeBackendStatus>('native_audio_status');
  } catch {
    return null;
  }
}

export class NativeAudioBackend implements AudioBackend {
  /** The mixer that is actually making sound today. */
  readonly inner = new WebAudioBackend();

  #nativeRunning = false;

  get kind(): 'native' {
    return 'native';
  }

  get state(): AudioBackendState {
    return this.inner.state;
  }

  get isRunning(): boolean {
    return this.inner.isRunning;
  }

  get sampleRate(): number {
    return this.inner.sampleRate;
  }

  get bufferSize(): number {
    return this.inner.bufferSize;
  }

  get currentSamplePosition(): number {
    return this.inner.currentSamplePosition;
  }

  get isPlaying(): boolean {
    return this.inner.isPlaying;
  }

  get masterVolume(): number {
    return this.inner.masterVolume;
  }

  get audioContext(): AudioContext | null {
    return this.inner.audioContext;
  }

  get nativeStreamRunning(): boolean {
    return this.#nativeRunning;
  }

  async start(): Promise<void> {
    await this.inner.start();
    if (!isTauri()) return;

    try {
      await tauriInvoke<string>('start_native_output_stream');
      this.#nativeRunning = true;
    } catch (error) {
      // Enumeration can succeed while exclusive-mode devices refuse a stream.
      // Mixing still works through Web Audio.
      console.warn('[native-audio]', (error as Error).message);
    }
  }

  async resume(): Promise<void> {
    await this.inner.resume();
  }

  stop(): void {
    this.inner.stop();
    if (isTauri()) {
      void tauriInvoke('stop_native_output_stream').catch(() => undefined);
    }
    this.#nativeRunning = false;
  }

  createTrack(trackID: string): void {
    this.inner.createTrack(trackID);
  }

  removeTrack(trackID: string): void {
    this.inner.removeTrack(trackID);
  }

  setTrackVolume(trackID: string, volume: number): void {
    this.inner.setTrackVolume(trackID, volume);
  }

  setTrackPan(trackID: string, pan: number): void {
    this.inner.setTrackPan(trackID, pan);
  }

  setTrackMute(trackID: string, muted: boolean): void {
    this.inner.setTrackMute(trackID, muted);
  }

  setTrackInstrument(trackID: string, instrument: InstrumentName): void {
    this.inner.setTrackInstrument(trackID, instrument);
  }

  scheduleMIDIEvent(event: ScheduledMIDIEvent): void {
    this.inner.scheduleMIDIEvent(event);
  }

  scheduleMIDIEvents(events: ScheduledMIDIEvent[]): void {
    this.inner.scheduleMIDIEvents(events);
  }

  sendImmediateMIDI(trackID: string, status: number, data1: number, data2: number): void {
    this.inner.sendImmediateMIDI(trackID, status, data1, data2);
  }

  clearScheduledMIDIEvents(): void {
    this.inner.clearScheduledMIDIEvents();
  }

  registerAudioBuffer(fileID: string, buffer: AudioBuffer): void {
    this.inner.registerAudioBuffer(fileID, buffer);
  }

  hasAudioBuffer(fileID: string): boolean {
    return this.inner.hasAudioBuffer(fileID);
  }

  scheduleAudioClip(fileID: string, clip: ScheduledAudioClip): void {
    this.inner.scheduleAudioClip(fileID, clip);
  }

  clearAudioClips(): void {
    this.inner.clearAudioClips();
  }

  play(fromSample: number): void {
    this.inner.play(fromSample);
  }

  pause(): void {
    this.inner.pause();
  }

  stopPlayback(): void {
    this.inner.stopPlayback();
  }

  seek(toSample: number): void {
    this.inner.seek(toSample);
  }

  setMetronomeEnabled(enabled: boolean): void {
    this.inner.setMetronomeEnabled(enabled);
  }

  setMetronomeVolume(volume: number): void {
    this.inner.setMetronomeVolume(volume);
  }

  setMetronomeGrid(bpm: number, timeSignature: TimeSignature): void {
    this.inner.setMetronomeGrid(bpm, timeSignature);
  }

  setMasterVolume(volume: number): void {
    this.inner.setMasterVolume(volume);
  }

  meterLevel(trackID: string): TrackMeterLevel {
    return this.inner.meterLevel(trackID);
  }

  masterMeterLevel(): TrackMeterLevel {
    return this.inner.masterMeterLevel();
  }

  bounceOffline(
    startSample: number,
    endSample: number,
    onProgress?: (fraction: number) => void
  ): Promise<AudioBuffer> {
    return this.inner.bounceOffline(startSample, endSample, onProgress);
  }
}

export function unsupportedVst3(): never {
  throw new AudioBackendError(
    'VST3 hosting is not available in the WebView. It lands with the native cpal graph.'
  );
}
