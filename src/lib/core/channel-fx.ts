/**
 * Live channel processing model — EQ, compressor, inserts, and FX sends.
 * Mirrors Limbus-style PROCESS / inserts / REV·DLY without copying their UI.
 */

import { newUUID } from './uuid';

export type EqBandType = 'lowshelf' | 'peaking' | 'highshelf';

export interface EqBand {
  type: EqBandType;
  freq: number;
  gainDb: number;
  q: number;
  enabled: boolean;
}

export interface ChannelEq {
  enabled: boolean;
  /** 5-band parametric (Limbus B1–B5 flow). */
  bands: EqBand[];
}

export interface ChannelComp {
  enabled: boolean;
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  makeupDb: number;
}

export type InsertKind =
  | 'drive'
  | 'room'
  | 'chorus'
  | 'phaser'
  | 'doubler'
  | 'tubeEq'
  | 'unmask'
  | 'amp'
  | 'trigger'
  | 'pitch';

export interface InsertSlot {
  id: string;
  kind: InsertKind;
  enabled: boolean;
  /** 0–1 normalized params; meaning depends on kind. */
  params: Record<string, number>;
}

export interface ChannelSends {
  reverb: number;
  delay: number;
}

export interface ChannelProcess {
  preGainDb: number;
  phaseInvert: boolean;
  eq: ChannelEq;
  comp: ChannelComp;
  inserts: InsertSlot[];
  sends: ChannelSends;
}

export interface FxBuses {
  reverb: {
    enabled: boolean;
    algorithm: 'hall' | 'room' | 'plate';
    size: number;
    decay: number;
    precut: number;
    busVolDb: number;
  };
  delay: {
    enabled: boolean;
    /** Beat subdivision: 0.25 = 1/4, 0.125 = 1/8, etc. */
    syncBeats: number;
    feedback: number;
    busVolDb: number;
  };
}

export const INSERT_CATALOG: {
  kind: InsertKind;
  label: string;
  ready: boolean;
  defaults: Record<string, number>;
}[] = [
  { kind: 'drive', label: 'Q-Drive Saturation', ready: true, defaults: { drive: 0.35, tone: 0.55, mix: 0.45 } },
  { kind: 'room', label: 'Q-Room Reverb', ready: true, defaults: { size: 0.4, decay: 0.45, mix: 0.25 } },
  { kind: 'chorus', label: 'Q-Chorus', ready: true, defaults: { rate: 0.35, depth: 0.4, mix: 0.35 } },
  { kind: 'phaser', label: 'Q-Phaser', ready: true, defaults: { rate: 0.3, depth: 0.5, mix: 0.4 } },
  { kind: 'doubler', label: 'Q-Doubler', ready: true, defaults: { width: 0.55, delayMs: 0.35, mix: 0.4 } },
  { kind: 'tubeEq', label: 'Q-Tube EQ', ready: true, defaults: { low: 0.55, mid: 0.5, high: 0.58, drive: 0.25 } },
  { kind: 'unmask', label: 'Q-Unmask', ready: true, defaults: { low: 0.25, high: 0.75, threshold: 0.45, ms: 0.5, speed: 0.4 } },
  { kind: 'amp', label: 'Q-Amp', ready: false, defaults: { gain: 0.4, tone: 0.5 } },
  { kind: 'trigger', label: 'Q-Trigger', ready: false, defaults: { sens: 0.5 } },
  { kind: 'pitch', label: 'Q-Tune Pitch', ready: false, defaults: { strength: 0.5 } }
];

export function defaultEqBands(): EqBand[] {
  return [
    { type: 'lowshelf', freq: 60, gainDb: 0, q: 0.7, enabled: true },
    { type: 'peaking', freq: 250, gainDb: 0, q: 1, enabled: true },
    { type: 'peaking', freq: 1000, gainDb: 0, q: 1, enabled: true },
    { type: 'peaking', freq: 4000, gainDb: 0, q: 1, enabled: true },
    { type: 'highshelf', freq: 10000, gainDb: 0, q: 0.7, enabled: true }
  ];
}

export function makeChannelProcess(): ChannelProcess {
  return {
    preGainDb: 0,
    phaseInvert: false,
    eq: { enabled: false, bands: defaultEqBands() },
    comp: {
      enabled: false,
      thresholdDb: -18,
      ratio: 4,
      attackMs: 5,
      releaseMs: 50,
      makeupDb: 0
    },
    inserts: [],
    sends: { reverb: 0, delay: 0 }
  };
}

export function makeFxBuses(): FxBuses {
  return {
    reverb: {
      enabled: true,
      algorithm: 'hall',
      size: 0.55,
      decay: 0.5,
      precut: 0.35,
      busVolDb: -6
    },
    delay: {
      enabled: true,
      syncBeats: 0.25,
      feedback: 0.35,
      busVolDb: -8
    }
  };
}

export function makeInsert(kind: InsertKind): InsertSlot | null {
  const entry = INSERT_CATALOG.find((c) => c.kind === kind);
  if (!entry?.ready) return null;
  return {
    id: newUUID(),
    kind,
    enabled: true,
    params: { ...entry.defaults }
  };
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(g: number): number {
  if (g <= 1e-8) return -80;
  return 20 * Math.log10(g);
}

/** Flatten channel process for worklet messages. */
export function channelProcessPayload(cp: ChannelProcess): Record<string, unknown> {
  return {
    preGain: dbToGain(cp.preGainDb),
    phaseInvert: cp.phaseInvert,
    eqEnabled: cp.eq.enabled,
    eqBands: cp.eq.bands.map((b) => ({
      type: b.type,
      freq: b.freq,
      gainDb: b.gainDb,
      q: b.q,
      enabled: b.enabled
    })),
    compEnabled: cp.comp.enabled,
    comp: {
      thresholdDb: cp.comp.thresholdDb,
      ratio: cp.comp.ratio,
      attackMs: cp.comp.attackMs,
      releaseMs: cp.comp.releaseMs,
      makeupDb: cp.comp.makeupDb
    },
    inserts: cp.inserts.map((i) => ({
      id: i.id,
      kind: i.kind,
      enabled: i.enabled,
      params: i.params
    })),
    sendReverb: cp.sends.reverb,
    sendDelay: cp.sends.delay
  };
}

export function fxBusesPayload(buses: FxBuses, bpm: number): Record<string, unknown> {
  return {
    reverb: { ...buses.reverb },
    delay: { ...buses.delay, bpm }
  };
}
