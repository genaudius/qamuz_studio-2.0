/**
 * Pulls a `{ notes: [...] }` payload out of a Claude reply.
 *
 * The model is asked for bare JSON, but it still wraps it in markdown fences
 * or extra prose. This is the same recovery the 1.0 Swift parser uses.
 */

import { AIServiceError, type GeneratedMIDINote } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asNote(raw: unknown): GeneratedMIDINote | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const pitch = Number(o.pitch);
  const start = Number(o.start ?? o.beat ?? o.beatPosition);
  const duration = Number(o.duration ?? o.length);
  const velocity = Number(o.velocity ?? 100);
  if (![pitch, start, duration, velocity].every(Number.isFinite)) return null;

  return {
    pitch: Math.round(clamp(pitch, 0, 127)),
    start: Math.max(0, start),
    duration: Math.max(0.0625, duration),
    velocity: Math.round(clamp(velocity, 1, 127))
  };
}

export function parseNotesFromResponse(text: string): GeneratedMIDINote[] {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  const attempts = [candidate];
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(candidate.slice(firstBrace, lastBrace + 1));
  }

  for (const json of attempts) {
    try {
      const parsed = JSON.parse(json) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { notes?: unknown }).notes)
          ? (parsed as { notes: unknown[] }).notes
          : null;
      if (!list) continue;

      const notes = list.map(asNote).filter((n): n is GeneratedMIDINote => n !== null);
      if (notes.length > 0) return notes;
    } catch {
      // Try the next candidate.
    }
  }

  throw new AIServiceError('Claude replied, but no MIDI notes could be parsed from it');
}
