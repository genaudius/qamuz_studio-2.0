/**
 * Live channel processing model — EQ, compressor, inserts, and FX sends.
 * Mirrors Limbus-style PROCESS / inserts / REV·DLY without copying their UI.
 */

import { newUUID } from './uuid';
import { createDefaultSuiteState, eqamuzKindToModuleId } from '../eqamuz/registry';

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
  | 'pitch'
  | 'eqamuz'
  | 'eqamuz-suite'
  | 'eqamuz-pro-eq'
  | 'eqamuz-comp'
  | 'eqamuz-saturator'
  | 'eqamuz-delay'
  | 'eqamuz-reverb'
  | 'eqamuz-imager'
  | 'eqamuz-limiter'
  | 'eqamuz-vocal'
  | 'eqamuz-lead'
  | 'eqamuz-electric';

export interface InsertSlot {
  id: string;
  kind: InsertKind;
  enabled: boolean;
  /** Normalized params or serialized JSON-compatible module state. */
  params: Record<string, number | string | boolean | any>;
}

export function isEqamuzInsert(kind: InsertKind): boolean {
  return kind === 'eqamuz' || kind.startsWith('eqamuz-');
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

export interface InsertCatalogEntry {
  kind: InsertKind;
  label: string;
  ready: boolean;
  category: 'EQ & Dynamics' | 'Character & Tone' | 'Time & Space' | 'Studio Suite' | 'Classic FX';
  defaults: Record<string, number>;
}

export const INSERT_CATALOG: InsertCatalogEntry[] = [
  { kind: 'eqamuz-pro-eq', label: 'EQAMUZ PRO-EQ', ready: true, category: 'EQ & Dynamics', defaults: { bypass: 0 } },
  { kind: 'eqamuz-comp', label: 'EQAMUZ DYNAMICS VCA', ready: true, category: 'EQ & Dynamics', defaults: { bypass: 0 } },
  { kind: 'eqamuz-limiter', label: 'EQAMUZ PEAK LIMITER', ready: true, category: 'EQ & Dynamics', defaults: { bypass: 0 } },
  { kind: 'eqamuz-saturator', label: 'EQAMUZ SATURATOR', ready: true, category: 'Character & Tone', defaults: { bypass: 0 } },
  { kind: 'eqamuz-vocal', label: 'EQAMUZ VOCAL FORGE', ready: true, category: 'Character & Tone', defaults: { bypass: 0 } },
  { kind: 'eqamuz-lead', label: 'EQAMUZ LEAD EXCITER', ready: true, category: 'Character & Tone', defaults: { bypass: 0 } },
  { kind: 'eqamuz-electric', label: 'EQAMUZ ELECTRIC DRIVE', ready: true, category: 'Character & Tone', defaults: { bypass: 0 } },
  { kind: 'eqamuz-delay', label: 'EQAMUZ DELAY MATRIX', ready: true, category: 'Time & Space', defaults: { bypass: 0 } },
  { kind: 'eqamuz-reverb', label: 'EQAMUZ SPACE REVERB', ready: true, category: 'Time & Space', defaults: { bypass: 0 } },
  { kind: 'eqamuz-imager', label: 'EQAMUZ PHASE IMAGER', ready: true, category: 'Time & Space', defaults: { bypass: 0 } },
  { kind: 'eqamuz-suite', label: 'EQAMUZ DSP SUITE', ready: true, category: 'Studio Suite', defaults: { bypass: 0, oversample: 4 } },
  { kind: 'eqamuz', label: 'EQAMUZ DSP SUITE (Legacy)', ready: true, category: 'Studio Suite', defaults: { bypass: 0, oversample: 4 } },
  { kind: 'drive', label: 'Q-Drive Saturation', ready: true, category: 'Classic FX', defaults: { drive: 0.35, tone: 0.55, mix: 0.45 } },
  { kind: 'room', label: 'Q-Room Reverb', ready: true, category: 'Classic FX', defaults: { size: 0.4, decay: 0.45, mix: 0.25 } },
  { kind: 'chorus', label: 'Q-Chorus', ready: true, category: 'Classic FX', defaults: { rate: 0.35, depth: 0.4, mix: 0.35 } },
  { kind: 'phaser', label: 'Q-Phaser', ready: true, category: 'Classic FX', defaults: { rate: 0.3, depth: 0.5, mix: 0.4 } },
  { kind: 'doubler', label: 'Q-Doubler', ready: true, category: 'Classic FX', defaults: { width: 0.55, delayMs: 0.35, mix: 0.4 } },
  { kind: 'tubeEq', label: 'Q-Tube EQ', ready: true, category: 'Classic FX', defaults: { low: 0.55, mid: 0.5, high: 0.58, drive: 0.25 } },
  { kind: 'unmask', label: 'Q-Unmask', ready: true, category: 'Classic FX', defaults: { low: 0.25, high: 0.75, threshold: 0.45, ms: 0.5, speed: 0.4 } },
  { kind: 'amp', label: 'Q-Amp', ready: false, category: 'Classic FX', defaults: { gain: 0.4, tone: 0.5 } },
  { kind: 'trigger', label: 'Q-Trigger', ready: false, category: 'Classic FX', defaults: { sens: 0.5 } },
  { kind: 'pitch', label: 'Q-Tune Pitch', ready: false, category: 'Classic FX', defaults: { strength: 0.5 } }
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
  const id = newUUID();
  const slot: InsertSlot = {
    id,
    kind,
    enabled: true,
    params: { ...entry.defaults }
  };
  if (kind === 'eqamuz' || kind.startsWith('eqamuz-')) {
    const focusedModuleId = eqamuzKindToModuleId(kind) ?? undefined;
    slot.params.eqamuzState = createDefaultSuiteState(`inst-${id.slice(0, 8)}`, '', id, focusedModuleId);
  }
  return slot;
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
