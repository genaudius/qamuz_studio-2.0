/** Project root model. Port of DAWCore/Models/Project.swift. */

import type { AutomationCurve } from './automation';
import type { AudioFileReference, Clip } from './clip';
import {
  rangeEnd,
  type TimeRange,
  type Tempo,
  type TimeSignature,
  COMMON_TIME,
  DEFAULT_PPQ
} from './time';
import { makeTrack, type Track, type TrackColor } from './track';
import { newUUID } from './uuid';
import { makeVRack, type VRack } from './vrack';

export const CURRENT_FORMAT_VERSION = 1;

export interface TempoChange {
  id: string;
  beatPosition: number;
  tempo: Tempo;
  curveType: AutomationCurve;
}

export interface TimeSignatureChange {
  id: string;
  beatPosition: number;
  timeSignature: TimeSignature;
}

export type MarkerType =
  | 'generic'
  | 'verse'
  | 'chorus'
  | 'bridge'
  | 'intro'
  | 'outro'
  | 'drop'
  | 'breakdown'
  | 'cuePoint';

export interface Marker {
  id: string;
  name: string;
  beatPosition: number;
  color: TrackColor;
  type: MarkerType;
}

export interface ProjectMetadata {
  artist: string;
  album: string;
  genre: string;
  comments: string;
  copyright: string;
}

export interface Rect {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}

export interface OpenPluginWindow {
  id: string;
  windowFrame?: Rect;
  isRackInstrument: boolean;
  rackInstrumentID?: string;
  trackID?: string;
}

/** UI state that travels with the project file. */
export interface DAWState {
  showVRack: boolean;
  showMixer: boolean;
  showInspector: boolean;
  zoomLevel: number;
  horizontalScrollOffset: number;
  verticalScrollOffset: number;
  selectedTrackID?: string;
  /** In beats. */
  playheadPosition: number;
  openPluginWindows: OpenPluginWindow[];
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;

  tempo: Tempo;
  timeSignature: TimeSignature;
  /** Ticks per quarter. Clone 1.0 used 480; Pro Tools / GenAudius clocks use 960. */
  ppq: number;
  /** File seconds where 1|1 sits. 0 means the timeline origin is bar 1. */
  timelineOriginSeconds: number;
  tempoChanges: TempoChange[];
  timeSignatureChanges: TimeSignatureChange[];

  sampleRate: number;

  tracks: Track[];
  masterTrack: Track;

  vRack: VRack;

  markers: Marker[];

  loopRegion?: TimeRange;
  isLoopEnabled: boolean;

  audioFiles: AudioFileReference[];

  metadata: ProjectMetadata;
  dawState: DAWState;

  formatVersion: number;
}

export function makeProjectMetadata(): ProjectMetadata {
  return { artist: '', album: '', genre: '', comments: '', copyright: '' };
}

export function makeDAWState(): DAWState {
  return {
    showVRack: false,
    showMixer: false,
    showInspector: false,
    zoomLevel: 1,
    horizontalScrollOffset: 0,
    verticalScrollOffset: 0,
    playheadPosition: 0,
    openPluginWindows: []
  };
}

/** Mirrors ProjectFactory.createNewProject: one audio track plus four MIDI tracks. */
export function createNewProject(name = 'Untitled Project', sampleRate = 44100): Project {
  const now = new Date().toISOString();

  return {
    id: newUUID(),
    name,
    createdAt: now,
    modifiedAt: now,
    tempo: { bpm: 120 },
    timeSignature: { ...COMMON_TIME },
    ppq: DEFAULT_PPQ,
    timelineOriginSeconds: 0,
    tempoChanges: [],
    timeSignatureChanges: [],
    sampleRate,
    tracks: [
      makeTrack('Audio 1', 'audio', 'blue'),
      makeTrack('Midi 1', 'midi', 'green'),
      makeTrack('Midi 2', 'midi', 'orange'),
      makeTrack('Midi 3', 'midi', 'yellow'),
      makeTrack('Midi 4', 'midi', 'cyan')
    ],
    masterTrack: makeTrack('Master', 'master', 'gray'),
    vRack: makeVRack(),
    markers: [],
    isLoopEnabled: false,
    audioFiles: [],
    metadata: makeProjectMetadata(),
    dawState: makeDAWState(),
    formatVersion: CURRENT_FORMAT_VERSION
  };
}

export function findTrack(project: Project, id: string): Track | undefined {
  return project.tracks.find((t) => t.id === id);
}

export function findClip(
  project: Project,
  clipID: string
): { track: Track; clip: Clip } | undefined {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipID);
    if (clip) return { track, clip };
  }
  return undefined;
}

/** Tempo in effect at a beat position, honouring tempo changes. */
export function tempoAtBeat(project: Project, beat: number): number {
  const sorted = [...project.tempoChanges].sort((a, b) => b.beatPosition - a.beatPosition);
  for (const change of sorted) {
    if (change.beatPosition <= beat) return change.tempo.bpm;
  }
  return project.tempo.bpm;
}

export function timeSignatureAtBeat(project: Project, beat: number): TimeSignature {
  const sorted = [...project.timeSignatureChanges].sort((a, b) => b.beatPosition - a.beatPosition);
  for (const change of sorted) {
    if (change.beatPosition <= beat) return change.timeSignature;
  }
  return project.timeSignature;
}

/** Project length in samples, from the furthest clip end. */
export function projectDurationSamples(project: Project): number {
  let max = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, rangeEnd(clip.timeRange).samples);
    }
  }
  return max;
}

export function projectDurationBeats(project: Project): number {
  const samples = projectDurationSamples(project);
  return (samples / project.sampleRate / 60) * project.tempo.bpm;
}
