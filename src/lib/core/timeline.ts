/**
 * Open-ended DAW timeline. The 1.0 clone hard-capped the arrange at 64 beats
 * (`pixelsPerBeat * 64`), so a song hit a wall and went silent. Studio 2.0
 * keeps growing: there is no song end on the ruler. Export still uses the
 * last clip as the bounce length.
 */

import type { Project } from './project';
import { beatsPerBar, toBeats, type TimeSignature } from './time';

/** Empty bars kept past whatever is farthest (clips, playhead, loop, scroll). */
export const TIMELINE_PAD_BARS = 64;
/** Floor so a new session already scrolls like Logic / Pro Tools. */
export const TIMELINE_MIN_BARS = 256;

export function lastContentBeats(project: Project, bpm = project.tempo.bpm): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const clipEnd = toBeats(clip.timeRange.start, bpm) + toBeats(clip.timeRange.duration, bpm);
      if (clipEnd > end) end = clipEnd;
    }
  }
  return end;
}

export function openTimelineBeats(options: {
  contentEnd: number;
  playhead?: number;
  loopEnd?: number;
  selectionEnd?: number;
  horizon?: number;
  timeSignature?: TimeSignature;
}): number {
  const perBar = beatsPerBar(options.timeSignature ?? { numerator: 4, denominator: 4 });
  const pad = TIMELINE_PAD_BARS * perBar;
  const floor = TIMELINE_MIN_BARS * perBar;
  const farthest = Math.max(
    0,
    options.contentEnd,
    options.playhead ?? 0,
    options.loopEnd ?? 0,
    options.selectionEnd ?? 0,
    options.horizon ?? 0
  );
  return Math.max(floor, Math.ceil((farthest + pad) / perBar) * perBar);
}

export function shouldGrowHorizon(scrollLeft: number, viewWidth: number, contentWidth: number): boolean {
  if (contentWidth <= 0 || viewWidth <= 0) return false;
  return scrollLeft + viewWidth >= contentWidth - Math.max(240, viewWidth * 0.2);
}
