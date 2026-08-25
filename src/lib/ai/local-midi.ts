/**
 * On-grid MIDI parts Maestro writes without GenAudius.
 * Genre + style change the groove. Bachata paloma anticipates the NEXT chord,
 * not the same one — otherwise every bar sounds like cha-cha-cha.
 */

import type { InstrumentName } from '$lib/audio/backend';
import type { GeneratedMIDINote } from './types';
import type { BachataStyle, PartRole, TonalMode } from './song-sketch';
import { foldText, pitchClassOf } from './song-sketch';

export type GrooveGenre = 'bachata' | 'merengue' | 'salsa' | 'generic';

export type MidiOptions = {
  key?: string;
  mode?: TonalMode;
  feel?: BachataStyle | 'default';
  groove?: string;
  role?: PartRole;
};

export function localPartForSound(
  sound: InstrumentName,
  beatCount: number,
  beatsPerBar = 4,
  options: MidiOptions = {}
): GeneratedMIDINote[] {
  const length = Math.max(beatsPerBar, beatCount);
  const role = options.role ?? roleFromSound(sound);
  const ctx = harmonicContext(options, beatsPerBar);
  switch (role) {
    case 'bass':
      return bassLine(length, ctx);
    case 'bongo':
    case 'guiro':
      return percussionGroove(length, ctx, role);
    case 'segunda':
      return segundaLine(length, ctx);
    case 'requinto':
      return requintoLine(length, ctx);
    case 'piano':
      return pianoComp(length, ctx);
    default:
      if (sound === 'drums') return percussionGroove(length, ctx, 'bongo');
      if (sound === 'pad') return padBeds(length, ctx);
      if (sound === 'pluck') return segundaLine(length, ctx);
      if (sound === 'lead') return requintoLine(length, ctx);
      return bassLine(length, ctx);
  }
}

type Harmony = {
  beatsPerBar: number;
  feel: BachataStyle;
  genre: GrooveGenre;
  roots: number[];
  thirds: number[];
  fifths: number[];
};

function roleFromSound(sound: InstrumentName): PartRole | null {
  if (sound === 'bass') return 'bass';
  if (sound === 'drums') return 'bongo';
  if (sound === 'pluck') return 'segunda';
  if (sound === 'lead') return 'requinto';
  if (sound === 'piano' || sound === 'epiano') return 'piano';
  return null;
}

export function grooveGenreOf(value?: string): GrooveGenre {
  const t = foldText(value || '');
  if (t.includes('merengue')) return 'merengue';
  if (t.includes('salsa')) return 'salsa';
  if (t.includes('bachata') || t.includes('bolero')) return 'bachata';
  return 'generic';
}

function resolvedFeel(feel: MidiOptions['feel'], genre: GrooveGenre): BachataStyle {
  if (feel === 'bolero' || feel === 'bailable' || feel === 'romantico') return feel;
  if (genre === 'bachata') return 'romantico';
  return 'romantico';
}

function harmonicContext(options: MidiOptions, beatsPerBar: number): Harmony {
  const pc = pitchClassOf(options.key || 'C');
  const minor = options.mode === 'minor';
  const tonic = 36 + pc;
  const genre = grooveGenreOf(options.groove);
  const degrees = minor ? [0, 7, 3, 5] : [0, 7, 9, 5];
  const third = minor ? 3 : 4;
  const roots = degrees.map((d) => tonic + d);
  return {
    beatsPerBar,
    feel: resolvedFeel(options.feel, genre),
    genre: genre === 'generic' && options.groove ? 'generic' : genre === 'generic' ? 'bachata' : genre,
    roots,
    thirds: roots.map((root) => root + third),
    fifths: roots.map((root) => root + 7)
  };
}

function chordIndex(bar: number): number {
  return ((bar % 4) + 4) % 4;
}

function note(pitch: number, start: number, duration: number, velocity: number): GeneratedMIDINote {
  return { pitch, start, duration, velocity };
}

function pushIf(
  notes: GeneratedMIDINote[],
  pitch: number,
  start: number,
  duration: number,
  velocity: number,
  limit: number
): void {
  if (start >= limit - 0.04) return;
  notes.push(note(pitch, start, Math.min(duration, limit - start), velocity));
}

function bassLine(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  if (ctx.genre === 'merengue') return bassMerengue(beats, ctx);
  if (ctx.genre === 'salsa') return bassSalsa(beats, ctx);
  return bassBachata(beats, ctx);
}

function bassBachata(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  const notes: GeneratedMIDINote[] = [];
  for (let bar = 0; bar * ctx.beatsPerBar < beats; bar++) {
    const origin = bar * ctx.beatsPerBar;
    const remain = beats - origin;
    if (remain <= 0.05) break;
    const root = ctx.roots[chordIndex(bar)];
    const fifth = ctx.fifths[chordIndex(bar)];
    const coming = ctx.roots[chordIndex(bar + 1)];
    const turnaround = (bar + 1) % 8 === 0;
    const phraseB = Math.floor(bar / 4) % 2 === 1;

    if (ctx.feel === 'bolero') {
      pushIf(notes, root, origin, Math.min(3.4, remain), 108, beats);
      if (bar % 2 === 1 && remain > 2.4) {
        pushIf(notes, fifth, origin + 2.5, 1.2, 86, beats);
      }
      continue;
    }

    pushIf(notes, root, origin, ctx.feel === 'bailable' ? 1.15 : 1.7, 112, beats);

    if (ctx.feel === 'bailable') {
      pushIf(notes, root, origin + 1, 0.22, 58, beats);
      if (phraseB) pushIf(notes, fifth - 12, origin + 1.5, 0.22, 70, beats);
      pushIf(notes, fifth, origin + 2, 0.85, 100, beats);
      pushIf(notes, coming, origin + 3.25, 0.38, 96, beats);
      if (turnaround) pushIf(notes, coming + 12, origin + 3.75, 0.2, 80, beats);
      continue;
    }

    if (!turnaround) {
      pushIf(notes, fifth, origin + 2, 1.05, 98, beats);
    } else {
      pushIf(notes, fifth, origin + 2, 0.7, 90, beats);
    }
    pushIf(notes, coming, origin + 3.5, 0.42, 92, beats);
  }
  return notes;
}

function bassMerengue(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  const notes: GeneratedMIDINote[] = [];
  for (let bar = 0; bar * ctx.beatsPerBar < beats; bar++) {
    const origin = bar * ctx.beatsPerBar;
    const root = ctx.roots[chordIndex(bar)];
    const fifth = ctx.fifths[chordIndex(bar)];
    const busy = ctx.feel === 'bailable';
    if (busy) {
      for (let i = 0; i < 4; i++) {
        pushIf(notes, i % 2 === 0 ? root : fifth, origin + i * 0.5, 0.42, i === 0 ? 114 : 88, beats);
      }
      continue;
    }
    pushIf(notes, root, origin, 0.9, 114, beats);
    pushIf(notes, fifth, origin + 1, 0.9, 96, beats);
    pushIf(notes, root, origin + 2, 0.9, 108, beats);
    pushIf(notes, fifth, origin + 3, 0.9, 96, beats);
  }
  return notes;
}

function bassSalsa(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  const notes: GeneratedMIDINote[] = [];
  for (let bar = 0; bar * ctx.beatsPerBar < beats; bar++) {
    const origin = bar * ctx.beatsPerBar;
    const root = ctx.roots[chordIndex(bar)];
    const fifth = ctx.fifths[chordIndex(bar)];
    const coming = ctx.roots[chordIndex(bar + 1)];
    pushIf(notes, root, origin + 1.5, 0.45, 104, beats);
    pushIf(notes, fifth, origin + 2.5, 0.4, 90, beats);
    pushIf(notes, coming, origin + 3.5, 0.45, 100, beats);
    if (ctx.feel === 'bailable') pushIf(notes, coming, origin + 3.75, 0.2, 72, beats);
  }
  return notes;
}

function percussionGroove(beats: number, ctx: Harmony, role: 'bongo' | 'guiro'): GeneratedMIDINote[] {
  if (role === 'guiro') return guiroGroove(beats, ctx);
  if (ctx.genre === 'merengue') return merengueDrum(beats, ctx);
  if (ctx.genre === 'salsa') return salsaDrum(beats, ctx);
  return bongoMartillo(beats, ctx);
}

function bongoMartillo(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  const notes: GeneratedMIDINote[] = [];
  const low = 60;
  const high = 61;
  const slap = 63;
  for (let beat = 0; beat < beats; beat++) {
    const inBar = beat % ctx.beatsPerBar;
    if (ctx.feel === 'bolero') {
      if (inBar === 0) pushIf(notes, low, beat, 0.5, 110, beats);
      if (inBar === 2) pushIf(notes, high, beat, 0.4, 88, beats);
      continue;
    }
    if (inBar === 0) pushIf(notes, low, beat, 0.32, 118, beats);
    if (inBar === 2) pushIf(notes, high, beat, 0.28, 104, beats);
    if (inBar === 3) pushIf(notes, slap, beat + 0.5, 0.18, 92, beats);
    if (ctx.feel === 'bailable') {
      if (inBar === 1) pushIf(notes, slap, beat + 0.5, 0.16, 78, beats);
      if (inBar === 3) pushIf(notes, high, beat + 0.75, 0.12, 74, beats);
    }
  }
  return notes;
}

function guiroGroove(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  const notes: GeneratedMIDINote[] = [];
  const high = 71;
  const low = 70;
  for (let beat = 0; beat < beats; beat++) {
    const inBar = beat % ctx.beatsPerBar;
    if (ctx.feel === 'bolero' || ctx.genre === 'salsa' && ctx.feel !== 'bailable') {
      if (inBar % 2 === 0) pushIf(notes, high, beat, 0.35, 86, beats);
      continue;
    }
    if (ctx.genre === 'merengue' || ctx.feel === 'bailable') {
      pushIf(notes, high, beat, 0.12, inBar === 0 ? 96 : 70, beats);
      pushIf(notes, low, beat + 0.25, 0.1, 62, beats);
      pushIf(notes, high, beat + 0.5, 0.12, 78, beats);
      pushIf(notes, low, beat + 0.75, 0.1, 58, beats);
      continue;
    }
    pushIf(notes, high, beat, 0.18, inBar % 2 === 0 ? 90 : 68, beats);
    pushIf(notes, low, beat + 0.5, 0.16, 64, beats);
  }
  return notes;
}

function merengueDrum(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  const notes: GeneratedMIDINote[] = [];
  for (let beat = 0; beat < beats; beat++) {
    const inBar = beat % ctx.beatsPerBar;
    if (inBar === 0 || inBar === 2) pushIf(notes, 60, beat, 0.28, 120, beats);
    if (inBar === 1 || inBar === 3) pushIf(notes, 61, beat, 0.22, 96, beats);
    if (ctx.feel === 'bailable') pushIf(notes, 63, beat + 0.5, 0.14, 80, beats);
  }
  return notes;
}

function salsaDrum(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  const notes: GeneratedMIDINote[] = [];
  for (let beat = 0; beat < beats; beat++) {
    const inBar = beat % ctx.beatsPerBar;
    if (inBar === 0) pushIf(notes, 60, beat, 0.25, 110, beats);
    if (inBar === 1) pushIf(notes, 61, beat + 0.5, 0.2, 98, beats);
    if (inBar === 2) pushIf(notes, 60, beat, 0.22, 100, beats);
    if (inBar === 3) pushIf(notes, 63, beat + 0.5, 0.18, 88, beats);
  }
  return notes;
}

function segundaLine(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  const notes: GeneratedMIDINote[] = [];
  for (let bar = 0; bar * ctx.beatsPerBar < beats; bar++) {
    const origin = bar * ctx.beatsPerBar;
    const remain = beats - origin;
    if (remain <= 0.05) break;
    const root = ctx.roots[chordIndex(bar)] + 12;
    const third = ctx.thirds[chordIndex(bar)] + 12;
    const fifth = ctx.fifths[chordIndex(bar)] + 12;
    const chord = [root, third, fifth];
    if (ctx.feel === 'bolero' || ctx.genre === 'salsa' && ctx.feel !== 'bailable') {
      for (const pitch of chord) pushIf(notes, pitch, origin, Math.min(3.6, remain), 78, beats);
      continue;
    }
    if (ctx.genre === 'merengue') {
      for (let i = 0; i < 4; i++) {
        for (const pitch of chord) pushIf(notes, pitch, origin + i, 0.4, i % 2 === 0 ? 86 : 72, beats);
      }
      continue;
    }
    const stab = ctx.feel === 'bailable' ? 0.32 : 0.5;
    for (const pitch of chord) {
      pushIf(notes, pitch, origin + 0.5, stab, 84, beats);
      pushIf(notes, pitch, origin + 2.5, stab, 80, beats);
    }
    if (ctx.feel === 'bailable') {
      for (const pitch of chord) pushIf(notes, pitch, origin + 1.75, 0.22, 70, beats);
    }
  }
  return notes;
}

function requintoLine(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  const notes: GeneratedMIDINote[] = [];
  for (let bar = 0; bar * ctx.beatsPerBar < beats; bar++) {
    const origin = bar * ctx.beatsPerBar;
    const root = ctx.roots[chordIndex(bar)] + 24;
    const third = ctx.thirds[chordIndex(bar)] + 24;
    const fifth = ctx.fifths[chordIndex(bar)] + 24;
    const phraseB = Math.floor(bar / 4) % 2 === 1;
    if (ctx.feel === 'bolero') {
      if (bar % 2 === 0) {
        pushIf(notes, root, origin + 1, 1.4, 90, beats);
        pushIf(notes, fifth, origin + 3, 0.85, 84, beats);
      }
      continue;
    }
    if (ctx.genre === 'merengue') {
      const run = [root, third, fifth, third + 12];
      run.forEach((pitch, i) => pushIf(notes, pitch, origin + i, 0.7, 90, beats));
      continue;
    }
    if (ctx.feel === 'bailable' || ctx.genre === 'salsa') {
      const motif = phraseB
        ? [root, third, fifth, third + 12, fifth, third, root, fifth]
        : [root, fifth, third, root, fifth, third + 12, fifth, root];
      motif.forEach((pitch, i) => pushIf(notes, pitch, origin + i * 0.5, 0.38, 92, beats));
      continue;
    }
    const motif = phraseB ? [root, fifth, third, comingSafe(fifth)] : [root, third, fifth, root];
    motif.forEach((pitch, i) => pushIf(notes, pitch, origin + 0.5 + i, 0.7, 90, beats));
  }
  return notes;
}

function comingSafe(pitch: number): number {
  return Math.min(127, pitch + 12);
}

function pianoComp(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  const notes: GeneratedMIDINote[] = [];
  for (let bar = 0; bar * ctx.beatsPerBar < beats; bar++) {
    const origin = bar * ctx.beatsPerBar;
    const remain = beats - origin;
    const chord = [
      ctx.roots[chordIndex(bar)] + 24,
      ctx.thirds[chordIndex(bar)] + 24,
      ctx.fifths[chordIndex(bar)] + 24
    ];
    const hold = ctx.feel === 'bolero' ? ctx.beatsPerBar - 0.1 : ctx.feel === 'bailable' ? 0.45 : 1.8;
    const hits = ctx.feel === 'bailable' ? [0, 1.5, 2.5] : [0];
    for (const at of hits) {
      for (const pitch of chord) pushIf(notes, pitch, origin + at, Math.min(hold, remain - at), 76, beats);
    }
  }
  return notes;
}

function padBeds(beats: number, ctx: Harmony): GeneratedMIDINote[] {
  const notes: GeneratedMIDINote[] = [];
  for (let bar = 0; bar * ctx.beatsPerBar < beats; bar += 2) {
    const origin = bar * ctx.beatsPerBar;
    const dur = Math.min(ctx.beatsPerBar * 2 - 0.05, beats - origin);
    const root = ctx.roots[chordIndex(bar)] + 12;
    notes.push(note(root, origin, dur, 70));
    notes.push(note(root + 7, origin, dur, 64));
    notes.push(note(root + 12 + 4, origin, dur, 58));
  }
  return notes;
}

export function transposeNotes(notes: GeneratedMIDINote[], semitones: number, durationScale = 1): GeneratedMIDINote[] {
  return notes.map((item) => ({
    ...item,
    pitch: Math.max(0, Math.min(127, item.pitch + semitones)),
    duration: Math.max(0.08, item.duration * durationScale)
  }));
}

export function describeGroove(options: MidiOptions): string {
  const genre = grooveGenreOf(options.groove) === 'generic' ? 'bachata' : grooveGenreOf(options.groove);
  const feel = resolvedFeel(options.feel, genre);
  if (genre === 'merengue') return 'merengue: bajo a tiempo (1–2–3–4), no paloma';
  if (genre === 'salsa') return 'salsa: tumbao (descansa el 1, marca 2+ y 4)';
  if (feel === 'bolero') return 'bachata bolero: notas largas, casi sin anticipo';
  if (feel === 'bailable') return 'bachata bailable: paloma + offbeats, anticipa el siguiente acorde';
  return 'bachata romántica: paloma (raíz, quinta, anticipo del siguiente acorde)';
}
