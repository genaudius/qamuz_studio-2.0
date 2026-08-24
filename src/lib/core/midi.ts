/** MIDI events. Port of DAWCore/Models/MIDIEvent.swift. */

import { newUUID } from './uuid';

export interface NoteData {
  pitch: number;
  velocity: number;
  /** Duration in beats. */
  duration: number;
  releaseVelocity?: number;
}

/** Discriminated union standing in for the Swift enum with associated values. */
export type MIDIEventType =
  | { kind: 'note'; note: NoteData }
  | { kind: 'controlChange'; controller: number; value: number }
  | { kind: 'programChange'; program: number }
  | { kind: 'pitchBend'; value: number }
  | { kind: 'aftertouch'; pressure: number }
  | { kind: 'polyAftertouch'; note: number; pressure: number }
  | { kind: 'sysex'; data: string };

export interface MIDIEvent {
  id: string;
  /** Beats relative to the clip start. */
  beatPosition: number;
  type: MIDIEventType;
  channel: number;
}

export function makeNoteData(
  pitch: number,
  velocity = 100,
  duration = 0.25,
  releaseVelocity?: number
): NoteData {
  return {
    pitch: Math.min(127, Math.max(0, Math.round(pitch))),
    velocity: Math.min(127, Math.max(1, Math.round(velocity))),
    duration: Math.max(0, duration),
    ...(releaseVelocity === undefined ? {} : { releaseVelocity })
  };
}

export function makeNoteEvent(
  beatPosition: number,
  pitch: number,
  velocity = 100,
  duration = 0.25,
  channel = 0
): MIDIEvent {
  return {
    id: newUUID(),
    beatPosition,
    type: { kind: 'note', note: makeNoteData(pitch, velocity, duration) },
    channel: Math.min(15, Math.max(0, channel))
  };
}

export function isNoteEvent(
  event: MIDIEvent
): event is MIDIEvent & { type: { kind: 'note'; note: NoteData } } {
  return event.type.kind === 'note';
}

export function noteEvents(events: MIDIEvent[]): (MIDIEvent & {
  type: { kind: 'note'; note: NoteData };
})[] {
  return events.filter(isNoteEvent);
}

export function sortedEvents(events: MIDIEvent[]): MIDIEvent[] {
  return [...events].sort((a, b) => a.beatPosition - b.beatPosition);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  return `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${octave}`;
}

export function isBlackKey(pitch: number): boolean {
  return NOTE_NAMES[((pitch % 12) + 12) % 12].includes('#');
}

const NOTE_VALUES: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11
};

export function pitchFromName(name: string): number | null {
  const match = /^([A-Ga-g][#b]?)(-?\d+)$/.exec(name.trim());
  if (!match) return null;

  const letter = match[1][0].toUpperCase() + match[1].slice(1);
  const value = NOTE_VALUES[letter];
  if (value === undefined) return null;

  const midi = (Number(match[2]) + 1) * 12 + value;
  return midi >= 0 && midi <= 127 ? midi : null;
}

export const MIDI_CONTROLLERS = {
  modWheel: 1,
  breath: 2,
  volume: 7,
  pan: 10,
  expression: 11,
  sustainPedal: 64,
  allSoundOff: 120,
  resetAllControllers: 121,
  allNotesOff: 123
} as const;

export const MIDI_SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
} as const;

export type MIDIScaleName = keyof typeof MIDI_SCALES;

export function scaleContains(scale: MIDIScaleName, pitch: number, root: number): boolean {
  const interval = (((pitch - root) % 12) + 12) % 12;
  return (MIDI_SCALES[scale] as readonly number[]).includes(interval);
}
