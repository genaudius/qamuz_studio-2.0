/** Automation lanes. Port of DAWCore/Models/AutomationLane.swift. */

import { formatDb, formatPan } from './time';
import { newUUID } from './uuid';

export type AutomationCurve = 'step' | 'linear' | 'exponential' | 'logarithmic' | 'sCurve';

export type AutomationParameter =
  | { kind: 'volume' }
  | { kind: 'pan' }
  | { kind: 'mute' }
  | { kind: 'send'; index: number }
  | { kind: 'plugin'; slotIndex: number; parameterID: string };

export interface AutomationPoint {
  id: string;
  beatPosition: number;
  /** Normalized 0...1. */
  value: number;
  curveType: AutomationCurve;
}

export interface AutomationLane {
  id: string;
  parameter: AutomationParameter;
  points: AutomationPoint[];
  isEnabled: boolean;
  isVisible: boolean;
  height: number;
}

export function makeAutomationLane(parameter: AutomationParameter): AutomationLane {
  return {
    id: newUUID(),
    parameter,
    points: [],
    isEnabled: true,
    isVisible: false,
    height: 60
  };
}

export function parameterName(p: AutomationParameter): string {
  switch (p.kind) {
    case 'volume':
      return 'Volume';
    case 'pan':
      return 'Pan';
    case 'mute':
      return 'Mute';
    case 'send':
      return `Send ${p.index + 1}`;
    case 'plugin':
      return p.parameterID;
  }
}

export function parameterDefaultValue(p: AutomationParameter): number {
  switch (p.kind) {
    case 'volume':
      return 0.7937;
    case 'pan':
      return 0.5;
    case 'mute':
      return 0;
    case 'send':
      return 0;
    case 'plugin':
      return 0.5;
  }
}

export function formatParameterValue(p: AutomationParameter, value: number): string {
  switch (p.kind) {
    case 'volume':
    case 'send':
      return formatDb(value);
    case 'pan':
      return formatPan((value - 0.5) * 2);
    case 'mute':
      return value > 0.5 ? 'On' : 'Off';
    case 'plugin':
      return value.toFixed(2);
  }
}

export function interpolateCurve(
  curve: AutomationCurve,
  start: number,
  end: number,
  t: number
): number {
  const x = Math.max(0, Math.min(1, t));
  let factor: number;

  switch (curve) {
    case 'step':
      factor = x < 1 ? 0 : 1;
      break;
    case 'linear':
      factor = x;
      break;
    case 'exponential':
      factor = x * x;
      break;
    case 'logarithmic':
      factor = Math.sqrt(x);
      break;
    case 'sCurve':
      factor = x * x * (3 - 2 * x);
      break;
  }

  return start + (end - start) * factor;
}

export function laneValueAtBeat(lane: AutomationLane, beat: number): number {
  const sorted = [...lane.points].sort((a, b) => a.beatPosition - b.beatPosition);
  if (sorted.length === 0) return parameterDefaultValue(lane.parameter);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (beat <= first.beatPosition) return first.value;
  if (beat >= last.beatPosition) return last.value;

  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i];
    if (next.beatPosition > beat) {
      const prev = sorted[i - 1];
      const span = next.beatPosition - prev.beatPosition;
      const t = span === 0 ? 0 : (beat - prev.beatPosition) / span;
      return interpolateCurve(prev.curveType, prev.value, next.value, t);
    }
  }

  return parameterDefaultValue(lane.parameter);
}

export type AutomationMode = 'off' | 'read' | 'touch' | 'latch' | 'write';
