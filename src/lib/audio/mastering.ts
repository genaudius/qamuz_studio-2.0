/**
 * QAMUZ MASTER PRO processing: bounce, measure, style, EQ, dynamics, loudness.
 */

import { lastContentBeats } from '$lib/core/timeline';
import type { Project } from '$lib/core/project';
import { engine, projectStore, transport } from '$lib/stores';

export type MasterStyle = 'qwarm' | 'qbalance' | 'qopen';

export interface MasterRecipe {
  style: MasterStyle;
  inputTrimDb: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  presence: number;
  deEsser: number;
  deEsserHz: number;
  stereoWidth: number;
  compression: number;
  character: number;
  saturation: number;
  loudness: number;
  gainMatch: boolean;
  bypass: boolean;
}

export interface LoudnessReport {
  peakDb: number;
  rmsDb: number;
  lufs: number;
  durationSec: number;
}

export const MASTER_STYLES: { id: MasterStyle; label: string }[] = [
  { id: 'qwarm', label: 'Q-Warm' },
  { id: 'qbalance', label: 'Q-Balance' },
  { id: 'qopen', label: 'Q-Open' }
];

export const DEFAULT_RECIPE: MasterRecipe = {
  style: 'qbalance',
  inputTrimDb: 0,
  eqLow: 0.5,
  eqMid: 0.5,
  eqHigh: 0.5,
  presence: 0.35,
  deEsser: 0.2,
  deEsserHz: 0.55,
  stereoWidth: 0.55,
  compression: 0.4,
  character: 0.35,
  saturation: 0.2,
  loudness: 0.55,
  gainMatch: false,
  bypass: false
};

export function projectEndBeats(project: Project = projectStore.project): number {
  return Math.max(lastContentBeats(project), 8);
}

export type BounceRange = { startBeat: number; endBeat: number };

export function bounceRangeFromSelection(project: Project = projectStore.project): BounceRange {
  const songEnd = projectEndBeats(project);
  const range = projectStore.rangeSelection;
  if (range && range.endBeat - range.startBeat >= 0.25) {
    return { startBeat: Math.max(0, range.startBeat), endBeat: range.endBeat };
  }
  return { startBeat: 0, endBeat: songEnd };
}

export function measureLoudness(buffer: AudioBuffer): LoudnessReport {
  const channels = Math.min(2, buffer.numberOfChannels);
  const length = buffer.length;
  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : left;
  let peak = 0;
  let energy = 0;
  for (let i = 0; i < length; i += 1) {
    const l = left[i];
    const r = right[i];
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    energy += (l * l + r * r) * 0.5;
  }
  const rms = Math.sqrt(energy / Math.max(1, length));
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -120;
  const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -120;
  return {
    peakDb,
    rmsDb,
    lufs: rmsDb + 0.7,
    durationSec: length / buffer.sampleRate
  };
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function styleTilt(style: MasterStyle): { low: number; mid: number; high: number } {
  if (style === 'qwarm') return { low: 1.4, mid: 0.1, high: -0.8 };
  if (style === 'qopen') return { low: -0.3, mid: 0.3, high: 1.8 };
  return { low: 0.15, mid: 0.1, high: 0.25 };
}

export function logSpectrum(buffer: AudioBuffer, bands = 96): Float32Array {
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const window = Math.min(6144, channel.length);
  const start = Math.max(0, Math.floor((channel.length - window) / 2));
  const out = new Float32Array(bands);
  for (let band = 0; band < bands; band += 1) {
    const freq = 20 * Math.pow(1000, band / Math.max(1, bands - 1));
    const omega = (2 * Math.PI * freq) / sampleRate;
    let re = 0;
    let im = 0;
    const step = 3;
    for (let i = 0; i < window; i += step) {
      const sample = channel[start + i];
      re += sample * Math.cos(omega * i);
      im += sample * Math.sin(omega * i);
    }
    out[band] = Math.sqrt(re * re + im * im) / (window / step);
  }
  return out;
}

/**
 * AudioBuffer factory for offline DSP. Prefers the live engine context, but
 * falls back to a standalone OfflineAudioContext so mastering works even when
 * the engine has not started (e.g. AudioContext blocked by autoplay policy in
 * the embedded SaaS iframe). createBuffer never needs a running context.
 */
let scratchCtx: OfflineAudioContext | null = null;
function makeBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
  const live = engine.backend.audioContext;
  if (live) return live.createBuffer(channels, length, sampleRate);
  if (
    !scratchCtx ||
    scratchCtx.sampleRate !== sampleRate
  ) {
    // Length here is irrelevant; the context is only used as a buffer factory.
    scratchCtx = new OfflineAudioContext(2, 1, sampleRate);
  }
  return scratchCtx.createBuffer(channels, length, sampleRate);
}

export function applyMastering(source: AudioBuffer, recipe: MasterRecipe): AudioBuffer {
  const out = makeBuffer(2, source.length, source.sampleRate);
  const srcL = source.getChannelData(0);
  const srcR = source.numberOfChannels > 1 ? source.getChannelData(1) : srcL;
  const dstL = out.getChannelData(0);
  const dstR = out.getChannelData(1);

  if (recipe.bypass) {
    dstL.set(srcL);
    dstR.set(srcR);
    return out;
  }

  const tilt = styleTilt(recipe.style);
  const trim = dbToGain(recipe.inputTrimDb);
  const lowG = dbToGain((recipe.eqLow - 0.5) * 10 + tilt.low);
  const midG = dbToGain((recipe.eqMid - 0.5) * 8 + tilt.mid);
  const highG = dbToGain((recipe.eqHigh - 0.5) * 10 + tilt.high);
  const presenceG = dbToGain(recipe.presence * 5);
  const width = 0.35 + recipe.stereoWidth * 1.3;
  const compress = recipe.compression;
  const sat = 1 + recipe.saturation * 1.4;
  const character = recipe.character;
  const ess = recipe.deEsser;
  const essHz = 4000 + recipe.deEsserHz * 6000;
  const essCoef = Math.min(0.35, essHz / source.sampleRate);
  const targetLufs = -16 + recipe.loudness * 8;
  const dry = measureLoudness(source);
  const makeup = dbToGain((targetLufs - dry.lufs) * (0.35 + recipe.loudness * 0.7));
  const ceiling = dbToGain(-0.3);

  let envL = 0;
  let envR = 0;
  let lowL = 0;
  let lowR = 0;
  let highL = 0;
  let highR = 0;
  let essL = 0;
  let essR = 0;
  const lowCoef = 0.0016;
  const highCoef = 0.07;
  const attack = 0.01 + compress * 0.04;
  const release = 0.08 + compress * 0.2;

  for (let i = 0; i < source.length; i += 1) {
    let l = srcL[i] * trim;
    let r = srcR[i] * trim;

    lowL += lowCoef * (l - lowL);
    lowR += lowCoef * (r - lowR);
    highL += highCoef * (l - highL);
    highR += highCoef * (r - highR);
    const airL = l - highL;
    const airR = r - highR;
    const bodyL = l - lowL - airL;
    const bodyR = r - lowR - airR;
    l = lowL * lowG + bodyL * midG * presenceG + airL * highG;
    r = lowR * lowG + bodyR * midG * presenceG + airR * highG;

    essL += essCoef * (l - essL);
    essR += essCoef * (r - essR);
    const sibilL = l - essL;
    const sibilR = r - essR;
    l = essL + sibilL * (1 - ess * 0.75);
    r = essR + sibilR * (1 - ess * 0.75);

    const absL = Math.abs(l);
    const absR = Math.abs(r);
    envL += (absL > envL ? attack : release) * (absL - envL);
    envR += (absR > envR ? attack : release) * (absR - envR);
    const gainL = 1 / (1 + envL * compress * 3.2);
    const gainR = 1 / (1 + envR * compress * 3.2);
    l *= gainL;
    r *= gainR;

    l = Math.tanh(l * sat) * (1 + character * 0.15);
    r = Math.tanh(r * sat) * (1 + character * 0.15);

    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5 * width;
    l = (mid + side) * makeup;
    r = (mid - side) * makeup;

    dstL[i] = Math.max(-ceiling, Math.min(ceiling, l));
    dstR[i] = Math.max(-ceiling, Math.min(ceiling, r));
  }

  if (recipe.gainMatch) {
    const wet = measureLoudness(out);
    const match = dbToGain(dry.rmsDb - wet.rmsDb);
    for (let i = 0; i < source.length; i += 1) {
      dstL[i] *= match;
      dstR[i] *= match;
    }
  }

  return out;
}

export async function bounceMix(range?: BounceRange): Promise<AudioBuffer> {
  const span = range ?? { startBeat: 0, endBeat: projectEndBeats() };
  const sampleRate = engine.backend.sampleRate;
  const bpm = Math.max(1, transport.bpm);
  const startSample = Math.round((Math.max(0, span.startBeat) / bpm) * 60 * sampleRate);
  const endSample = Math.round((Math.max(span.startBeat + 0.25, span.endBeat) / bpm) * 60 * sampleRate);
  return await engine.backend.bounceOffline(startSample, Math.max(startSample + Math.round(sampleRate * 0.05), endSample));
}

export function downloadWav(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
