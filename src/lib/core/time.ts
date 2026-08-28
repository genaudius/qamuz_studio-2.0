/** Musical time primitives. Port of DAWCore/Models/TimePosition.swift. */

export const DEFAULT_SAMPLE_RATE = 44100;

/** A sample-accurate position, carrying the rate it was measured at. */
export interface TimePosition {
  samples: number;
  sampleRate: number;
}

export interface TimeRange {
  start: TimePosition;
  duration: TimePosition;
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface Tempo {
  bpm: number;
}

export const COMMON_TIME: TimeSignature = { numerator: 4, denominator: 4 };

/** MIDI file / clone 1.0 `TimePosition.formatted` default. */
export const MIDI_PPQ = 480;
/** Pro Tools and GenAudius Ecos teacher clocks. */
export const PRO_TOOLS_PPQ = 960;
export const HIGH_RES_PPQ = 1920;
export const DEFAULT_PPQ = PRO_TOOLS_PPQ;
export const PPQ_PRESETS = [MIDI_PPQ, PRO_TOOLS_PPQ, HIGH_RES_PPQ] as const;

export interface MusicalPosition {
  bar: number;
  beat: number;
  tick: number;
}

export function clampPpq(ppq: number): number {
  const n = Math.round(Number.isFinite(ppq) ? ppq : DEFAULT_PPQ);
  if ((PPQ_PRESETS as readonly number[]).includes(n)) return n;
  return Math.max(24, Math.min(9600, n));
}

export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds / 60) * bpm;
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats / Math.max(1e-9, bpm)) * 60;
}

/** File/timeline seconds → beats relative to where 1|1 sits. */
export function secondsToMusicalBeats(seconds: number, bpm: number, originSeconds = 0): number {
  return secondsToBeats(seconds - originSeconds, bpm);
}

export function musicalBeatsToSeconds(beats: number, bpm: number, originSeconds = 0): number {
  return originSeconds + beatsToSeconds(beats, bpm);
}

export function timePosition(samples = 0, sampleRate = DEFAULT_SAMPLE_RATE): TimePosition {
  return { samples: Math.round(samples), sampleRate };
}

export function fromSeconds(seconds: number, sampleRate = DEFAULT_SAMPLE_RATE): TimePosition {
  return { samples: Math.round(seconds * sampleRate), sampleRate };
}

export function fromBeats(
  beats: number,
  bpm: number,
  sampleRate = DEFAULT_SAMPLE_RATE
): TimePosition {
  return fromSeconds((beats / bpm) * 60, sampleRate);
}

export function toSeconds(p: TimePosition): number {
  return p.samples / p.sampleRate;
}

export function toBeats(p: TimePosition, bpm: number): number {
  return (toSeconds(p) / 60) * bpm;
}

export function addPositions(a: TimePosition, b: TimePosition): TimePosition {
  return { samples: a.samples + b.samples, sampleRate: a.sampleRate };
}

export function subtractPositions(a: TimePosition, b: TimePosition): TimePosition {
  return { samples: a.samples - b.samples, sampleRate: a.sampleRate };
}

export function rangeFromBeats(
  startBeat: number,
  durationBeats: number,
  bpm: number,
  sampleRate = DEFAULT_SAMPLE_RATE
): TimeRange {
  return {
    start: fromBeats(startBeat, bpm, sampleRate),
    duration: fromBeats(durationBeats, bpm, sampleRate)
  };
}

export function rangeEnd(r: TimeRange): TimePosition {
  return addPositions(r.start, r.duration);
}

export function rangeContains(r: TimeRange, p: TimePosition): boolean {
  return p.samples >= r.start.samples && p.samples < rangeEnd(r).samples;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start.samples < rangeEnd(b).samples && rangeEnd(a).samples > b.start.samples;
}

/** Convert a TimePosition into samples at another rate (engine vs file). */
export function toSampleRate(position: TimePosition, sampleRate: number): number {
  const sourceRate = position.sampleRate || sampleRate;
  if (!sourceRate || sourceRate === sampleRate) return Math.round(position.samples);
  return Math.round((position.samples / sourceRate) * sampleRate);
}

export function beatsPerBar(sig: TimeSignature): number {
  return sig.numerator;
}

export function clampBpm(bpm: number): number {
  return Math.max(20, Math.min(999, bpm));
}

export function beatsToPosition(
  beats: number,
  sig: TimeSignature,
  ppq = DEFAULT_PPQ
): MusicalPosition {
  const perBar = Math.max(1, beatsPerBar(sig));
  const resolved = clampPpq(ppq);
  const safe = Math.max(0, beats);
  const bar = Math.floor(safe / perBar) + 1;
  const beatInBar = Math.floor(safe % perBar) + 1;
  const tick = Math.min(resolved - 1, Math.floor((safe % 1) * resolved));
  return { bar, beat: beatInBar, tick: Math.max(0, tick) };
}

export function positionToBeats(
  position: MusicalPosition,
  sig: TimeSignature,
  ppq = DEFAULT_PPQ
): number {
  const perBar = Math.max(1, beatsPerBar(sig));
  const resolved = clampPpq(ppq);
  return (position.bar - 1) * perBar + (position.beat - 1) + position.tick / resolved;
}

/** Pro Tools / GenAudius `bar|beat|tick`. Port of clone 1.0 `TimePosition.formatted`. */
export function formatBarsBeats(beats: number, sig: TimeSignature, ppq = DEFAULT_PPQ): string {
  if (beats < -1e-9) return 'pre 1|1';
  const { bar, beat, tick } = beatsToPosition(beats, sig, ppq);
  return `${bar}|${beat}|${String(tick).padStart(3, '0')}`;
}

export function parseBarsBeatsTicks(text: string): MusicalPosition | null {
  const match = text.trim().match(/^(\d+)\s*[|.\-]\s*(\d+)\s*[|.\-]\s*(\d+)$/);
  if (!match) return null;
  const bar = Number(match[1]);
  const beat = Number(match[2]);
  const tick = Number(match[3]);
  if (![bar, beat, tick].every((n) => Number.isFinite(n) && n >= 0)) return null;
  return { bar, beat, tick };
}

/** Formats seconds as `MM:SS:FF` with hundredths as frames. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const f = Math.floor((safe % 1) * 100);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(m)}:${pad(s)}:${pad(f)}`;
}

export type QuantizeMode = 'nearest' | 'floor' | 'ceil';

export function quantize(beats: number, gridDivision: number, mode: QuantizeMode = 'nearest') {
  const steps = beats / gridDivision;
  const rounded =
    mode === 'nearest' ? Math.round(steps) : mode === 'floor' ? Math.floor(steps) : Math.ceil(steps);
  return rounded * gridDivision;
}

export const GRID_DIVISIONS = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  thirtySecond: 0.125,
  tripletQuarter: 2 / 3,
  tripletEighth: 1 / 3,
  tripletSixteenth: 1 / 6
} as const;

export type GridDivisionName = keyof typeof GRID_DIVISIONS;

export function linearToDb(linear: number): number {
  return linear <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(linear);
}

export function dbToLinear(db: number): number {
  return db === Number.NEGATIVE_INFINITY ? 0 : Math.pow(10, db / 20);
}

export function formatDb(linear: number): string {
  const db = linearToDb(linear);
  return db === Number.NEGATIVE_INFINITY ? '-\u221E dB' : `${db.toFixed(1)} dB`;
}

/** Map a 0..1 linear peak onto a 0..1 meter throw (−48 dBFS silent, 0 dBFS full). */
export function meterThrow(peak: number, floorDb = -48): number {
  if (peak <= 0) return 0;
  const db = linearToDb(peak);
  if (db === Number.NEGATIVE_INFINITY) return 0;
  return Math.max(0, Math.min(1, (db - floorDb) / -floorDb));
}

export function formatPan(pan: number): string {
  if (Math.abs(pan) < 0.01) return 'C';
  return pan < 0 ? `${Math.round(-pan * 100)}L` : `${Math.round(pan * 100)}R`;
}
