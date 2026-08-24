/** Timeline clips. Port of DAWCore/Models/Clip.swift. */

import type { MIDIEvent } from './midi';
import type { TimeRange, TimePosition } from './time';
import type { TrackColor } from './track';
import { newUUID } from './uuid';

export type FadeCurve = 'linear' | 'logarithmic' | 'exponential' | 'sCurve';

export interface AudioFileReference {
  fileID: string;
  /** Absolute path as imported; rewritten to package-relative on save. */
  originalPath: string;
  /** Path inside the `.dawproj` package, e.g. `Audio Files/<uuid>.wav`. */
  relativePath: string;
  sampleRate: number;
  channelCount: number;
  lengthInSamples: number;
  bitDepth: number;
}

export interface WarpMarker {
  id: string;
  sourceSample: number;
  targetPosition: number;
}

export interface AudioClipData {
  fileReference: AudioFileReference;
  sourceStartSample: number;
  sourceLengthSamples: number;
  pitchShift: number;
  timeStretch: number;
  warpMarkers: WarpMarker[];
  preservePitch: boolean;
}

export interface MIDIClipData {
  events: MIDIEvent[];
  originalTempo?: number;
}

export type ClipContent =
  | { kind: 'audio'; audio: AudioClipData }
  | { kind: 'midi'; midi: MIDIClipData }
  | { kind: 'empty' };

export interface Clip {
  id: string;
  name: string;
  /** null inherits the track colour. */
  color?: TrackColor;
  timeRange: TimeRange;
  content: ClipContent;
  gain: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  fadeInCurve: FadeCurve;
  fadeOutCurve: FadeCurve;
  isLooped: boolean;
  loopLength?: TimePosition;
  isMuted: boolean;
  isSelected: boolean;
}

export function makeClip(name: string, timeRange: TimeRange, content: ClipContent): Clip {
  return {
    id: newUUID(),
    name,
    timeRange,
    content,
    gain: 1,
    fadeInDuration: 0,
    fadeOutDuration: 0,
    fadeInCurve: 'linear',
    fadeOutCurve: 'linear',
    isLooped: false,
    isMuted: false,
    isSelected: false
  };
}

export function makeMIDIClip(name: string, timeRange: TimeRange, events: MIDIEvent[] = []): Clip {
  return makeClip(name, timeRange, { kind: 'midi', midi: { events } });
}

export function makeAudioClip(name: string, timeRange: TimeRange, audio: AudioClipData): Clip {
  return makeClip(name, timeRange, { kind: 'audio', audio });
}

export function makeAudioClipData(fileReference: AudioFileReference): AudioClipData {
  return {
    fileReference,
    sourceStartSample: 0,
    sourceLengthSamples: fileReference.lengthInSamples,
    pitchShift: 0,
    timeStretch: 1,
    warpMarkers: [],
    preservePitch: true
  };
}

export function isAudioClip(clip: Clip): clip is Clip & {
  content: { kind: 'audio'; audio: AudioClipData };
} {
  return clip.content.kind === 'audio';
}

export function isMIDIClip(clip: Clip): clip is Clip & {
  content: { kind: 'midi'; midi: MIDIClipData };
} {
  return clip.content.kind === 'midi';
}

export function fadeValue(curve: FadeCurve, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  switch (curve) {
    case 'linear':
      return x;
    case 'logarithmic':
      return Math.log10(1 + 9 * x);
    case 'exponential':
      return x * x;
    case 'sCurve':
      return x * x * (3 - 2 * x);
  }
}
