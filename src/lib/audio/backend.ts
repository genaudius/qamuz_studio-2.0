/**
 * The contract between the UI and whatever is making sound.
 *
 * Mirrors DAWCore/Audio/AudioBackendProtocol.swift. Today the only
 * implementation is `WebAudioBackend` (AudioWorklet, identical on Windows and
 * macOS). A later native backend in Rust with cpal implements this same
 * interface, so nothing above this line has to change to gain low latency.
 *
 * Plugin hosting is deliberately absent: it is meaningless in a WebView and will
 * arrive as a separate capability interface alongside the native backend.
 */

import type { TimeSignature } from '$lib/core/time';

export interface ScheduledMIDIEvent {
  trackID: string;
  samplePosition: number;
  /** Raw MIDI status byte, channel already merged in. */
  status: number;
  data1: number;
  data2: number;
  channel: number;
}

export interface ScheduledAudioClip {
  clipID: string;
  trackID: string;
  /** Timeline position, in samples, where the clip starts. */
  startSample: number;
  /** Offset into the source buffer. */
  offsetSample: number;
  /** How many samples to play. */
  lengthSamples: number;
  volume: number;
  fadeInSamples: number;
  fadeOutSamples: number;
}

export interface TrackMeterLevel {
  peak: number;
  rms: number;
}

export type AudioBackendState = 'idle' | 'starting' | 'running' | 'suspended' | 'failed';

export const MIDI_STATUS = {
  noteOff: 0x80,
  noteOn: 0x90,
  controlChange: 0xb0,
  programChange: 0xc0,
  pitchBend: 0xe0
} as const;

export function noteOnEvent(
  trackID: string,
  samplePosition: number,
  note: number,
  velocity: number,
  channel = 0
): ScheduledMIDIEvent {
  return {
    trackID,
    samplePosition,
    status: MIDI_STATUS.noteOn | (channel & 0x0f),
    data1: note,
    data2: velocity,
    channel
  };
}

export function noteOffEvent(
  trackID: string,
  samplePosition: number,
  note: number,
  channel = 0
): ScheduledMIDIEvent {
  return {
    trackID,
    samplePosition,
    status: MIDI_STATUS.noteOff | (channel & 0x0f),
    data1: note,
    data2: 0,
    channel
  };
}

export interface AudioBackend {
  readonly state: AudioBackendState;
  readonly isRunning: boolean;
  readonly sampleRate: number;
  readonly bufferSize: number;
  /** Authoritative transport clock, in samples. */
  readonly currentSamplePosition: number;
  readonly isPlaying: boolean;
  readonly masterVolume: number;

  start(): Promise<void>;
  stop(): void;

  createTrack(trackID: string): void;
  removeTrack(trackID: string): void;
  setTrackVolume(trackID: string, volume: number): void;
  setTrackPan(trackID: string, pan: number): void;
  setTrackMute(trackID: string, muted: boolean): void;
  /** Which internal instrument a MIDI track plays through. */
  setTrackInstrument(trackID: string, instrument: InstrumentName): void;

  scheduleMIDIEvent(event: ScheduledMIDIEvent): void;
  scheduleMIDIEvents(events: ScheduledMIDIEvent[]): void;
  sendImmediateMIDI(trackID: string, status: number, data1: number, data2: number): void;
  clearScheduledMIDIEvents(): void;

  /** Registers decoded audio so clips can reference it by file id. */
  registerAudioBuffer(fileID: string, buffer: AudioBuffer): void;
  hasAudioBuffer(fileID: string): boolean;
  scheduleAudioClip(fileID: string, clip: ScheduledAudioClip): void;
  clearAudioClips(): void;

  play(fromSample: number): void;
  pause(): void;
  stopPlayback(): void;
  seek(toSample: number): void;

  setMetronomeEnabled(enabled: boolean): void;
  setMetronomeVolume(volume: number): void;
  setMetronomeGrid(bpm: number, timeSignature: TimeSignature): void;

  setMasterVolume(volume: number): void;
  meterLevel(trackID: string): TrackMeterLevel;
  masterMeterLevel(): TrackMeterLevel;

  /** Non-realtime render of a sample range, for bounce and export. */
  bounceOffline(
    startSample: number,
    endSample: number,
    onProgress?: (fraction: number) => void
  ): Promise<AudioBuffer>;
}

export type InstrumentName = 'piano' | 'epiano' | 'bass' | 'lead' | 'pad' | 'pluck' | 'drums';

export const INSTRUMENTS: { id: InstrumentName; label: string }[] = [
  { id: 'piano', label: 'Grand Piano' },
  { id: 'epiano', label: 'Electric Piano' },
  { id: 'bass', label: 'Analog Bass' },
  { id: 'lead', label: 'Lead Synth' },
  { id: 'pad', label: 'Warm Pad' },
  { id: 'pluck', label: 'Pluck' },
  { id: 'drums', label: 'Drum Kit' }
];

export class AudioBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioBackendError';
  }
}
