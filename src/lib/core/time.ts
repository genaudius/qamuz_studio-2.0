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

export function beatsPerBar(sig: TimeSignature): number {
  return sig.numerator;
}

export function clampBpm(bpm: number): number {
  return Math.max(20, Math.min(999, bpm));
}

/** Formats a beat count as `bar.beat.ticks`, matching the transport readout. */
export function formatBarsBeats(beats: number, sig: TimeSignature, ticks = 100): string {
  const perBar = beatsPerBar(sig);
  const safeBeats = Math.max(0, beats);
  const bar = Math.floor(safeBeats / perBar) + 1;
  const beatInBar = Math.floor(safeBeats % perBar) + 1;
  const tick = Math.floor((safeBeats % 1) * ticks);
  return `${bar}.${beatInBar}.${String(tick).padStart(2, '0')}`;
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

export function formatPan(pan: number): string {
  if (Math.abs(pan) < 0.01) return 'C';
  return pan < 0 ? `${Math.round(-pan * 100)}L` : `${Math.round(pan * 100)}R`;
}
