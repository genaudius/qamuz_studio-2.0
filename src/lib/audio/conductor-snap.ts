/**
 * Snap the live Conductor so the confirmed hit enters on 2|2.
 *
 * Operational DAW placement only. Does not create a GenAudius
 * teacher_validated MusicalClock and does not invent meter/PPQ as human truth.
 * WAV files stay intact; clips may start later so 1|1 can count in.
 */

import { findBarAnchors, resolveSessionTempo } from '$lib/audio/detect-tempo';
import {
  beatsToSeconds,
  COMMON_TIME,
  DEFAULT_PPQ,
  formatBarsBeats,
  positionToBeats,
  secondsToBeats,
  toBeats,
  type TimeSignature
} from '$lib/core/time';
import { engine, projectStore, transport } from '$lib/stores';

/** Operational entry on the DAW grid. Not a teacher-validated clock. */
export const OPERATIONAL_ENTRY = { bar: 2, beat: 2, tick: 0 } as const;

/**
 * Original-song titles belong to GenAudius training labs.
 * The live DAW never looks up BPM, hit, or 2|2 from a project/folder name.
 */

export interface OperationalEntryPlan {
  bpm: number;
  entryBeats: number;
  originSeconds: number;
  clipStartBeats: number;
  hitSeconds: number;
}

export function planOperationalEntry(options: {
  hitSeconds: number;
  bpm: number;
  timeSignature?: TimeSignature;
  ppq?: number;
}): OperationalEntryPlan {
  const sig = options.timeSignature ?? COMMON_TIME;
  const ppq = options.ppq ?? DEFAULT_PPQ;
  const bpm = resolveSessionTempo({ hinted: options.bpm });
  const entryBeats = positionToBeats(OPERATIONAL_ENTRY, sig, ppq);
  const hitSeconds = Math.max(0, options.hitSeconds);
  const rawOrigin = hitSeconds - beatsToSeconds(entryBeats, bpm);
  if (rawOrigin >= -1e-9) {
    return {
      bpm,
      entryBeats,
      originSeconds: Math.max(0, rawOrigin),
      clipStartBeats: 0,
      hitSeconds
    };
  }
  return {
    bpm,
    entryBeats,
    originSeconds: 0,
    clipStartBeats: -secondsToBeats(rawOrigin, bpm),
    hitSeconds
  };
}

export interface ConductorSnapReport {
  bpm: number;
  barOneSeconds: number;
  entrySeconds: number;
  entryPosition: string;
  firstAudibleSeconds: number | null;
  pickupSeconds: number;
  clipStartBeats: number;
  teacherValidated: false;
  message: string;
}

function firstSessionBuffer(): AudioBuffer | null {
  let best: AudioBuffer | null = null;
  for (const track of projectStore.project.tracks) {
    for (const clip of track.clips) {
      if (clip.content.kind !== 'audio') continue;
      const buffer = engine.backend.audioBuffer(clip.content.audio.fileReference.fileID);
      if (!buffer) continue;
      const name = `${track.name} ${clip.name}`.toLowerCase();
      if (/\b(master|mix|reference)\b/.test(name)) return buffer;
      if (!best || buffer.length > best.length) best = buffer;
    }
  }
  return best;
}

function alignClipsToEntry(clipStartBeats: number) {
  const bpm = projectStore.project.tempo.bpm;
  let minStart = Number.POSITIVE_INFINITY;
  for (const track of projectStore.project.tracks) {
    for (const clip of track.clips) {
      minStart = Math.min(minStart, toBeats(clip.timeRange.start, bpm));
    }
  }
  if (!Number.isFinite(minStart)) return;
  projectStore.shiftAllClipsByBeats(clipStartBeats - minStart);
}

export function applyBarExactConductor(options: {
  bpm: number;
  barOneSeconds: number;
  firstAudibleSeconds?: number | null;
}): ConductorSnapReport {
  const plan = planOperationalEntry({
    hitSeconds: options.barOneSeconds,
    bpm: options.bpm,
    timeSignature: projectStore.project.timeSignature,
    ppq: projectStore.project.ppq
  });
  const firstAudible = options.firstAudibleSeconds ?? null;
  const pickupSeconds = firstAudible == null ? 0 : Math.max(0, plan.hitSeconds - firstAudible);
  const entryLabel = formatBarsBeats(
    plan.entryBeats,
    projectStore.project.timeSignature,
    projectStore.project.ppq
  );

  transport.setTempo(plan.bpm);
  projectStore.setTempo(plan.bpm);
  alignClipsToEntry(plan.clipStartBeats);
  projectStore.setTimelineOriginSeconds(plan.originSeconds);
  transport.syncBarOneFromSeconds(plan.originSeconds, plan.bpm);
  transport.returnToZero();
  engine.backend.setMetronomeGrid(plan.bpm, transport.timeSignature);
  engine.rebuildSchedule();

  const pickup =
    pickupSeconds > 0.04
      ? ` Pickup: ${pickupSeconds.toFixed(3)} s antes de ${entryLabel}.`
      : ` El golpe de entrada cae en ${entryLabel}.`;

  return {
    bpm: plan.bpm,
    barOneSeconds: plan.originSeconds,
    entrySeconds: plan.hitSeconds,
    entryPosition: entryLabel,
    firstAudibleSeconds: firstAudible,
    pickupSeconds,
    clipStartBeats: plan.clipStartBeats,
    teacherValidated: false,
    message: `Entrada en ${entryLabel} @ ${plan.hitSeconds.toFixed(3)} s · ${plan.bpm} BPM.${pickup} Métrica y PPQ siguen siendo del Conductor del DAW, no teacher_validated.`
  };
}

export function snapImportedSessionToBar(options: {
  bpm?: number | null;
  prompt?: string;
  barOneSeconds?: number | null;
  firstAudibleSeconds?: number | null;
  buffer?: AudioBuffer | null;
} = {}): ConductorSnapReport | null {
  const buffer = options.buffer ?? firstSessionBuffer();
  const detected = buffer ? findBarAnchors(buffer) : null;
  const bpm = resolveSessionTempo({
    hinted: options.bpm,
    prompt: options.prompt,
    buffer
  });
  const hit =
    options.barOneSeconds != null && Number.isFinite(options.barOneSeconds)
      ? Number(options.barOneSeconds)
      : detected?.firstStrongBeatSeconds;
  if (hit == null || !Number.isFinite(hit)) return null;
  const firstAudible = options.firstAudibleSeconds ?? detected?.firstAudibleSeconds ?? null;
  return applyBarExactConductor({
    bpm,
    barOneSeconds: hit,
    firstAudibleSeconds: firstAudible
  });
}
