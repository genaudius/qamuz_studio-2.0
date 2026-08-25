import { describe, expect, it } from 'vitest';

import type { Project } from './project';
import { fromBeats, toSampleRate } from './time';
import {
  lastContentBeats,
  openTimelineBeats,
  shouldGrowHorizon,
  TIMELINE_MIN_BARS,
  TIMELINE_PAD_BARS
} from './timeline';

describe('open timeline', () => {
  it('never ends at the 1.0 clone’s 64-beat wall', () => {
    const beats = openTimelineBeats({ contentEnd: 0 });
    expect(beats).toBe(TIMELINE_MIN_BARS * 4);
    expect(beats).toBeGreaterThan(64);
  });

  it('keeps padding past a 3-minute song at 120 BPM', () => {
    const threeMinutes = (180 / 60) * 120;
    const beats = openTimelineBeats({ contentEnd: threeMinutes });
    expect(beats).toBeGreaterThan(threeMinutes + TIMELINE_PAD_BARS * 4 - 4);
  });

  it('grows when the playhead walks past the clips', () => {
    const idle = openTimelineBeats({ contentEnd: 16 });
    const rolling = openTimelineBeats({ contentEnd: 16, playhead: idle - 8 });
    expect(rolling).toBeGreaterThan(idle);
  });

  it('reads clip end in beats, not raw samples', () => {
    const project = {
      tempo: { bpm: 120 },
      tracks: [
        {
          clips: [
            {
              timeRange: {
                start: fromBeats(0, 120, 44100),
                duration: fromBeats(360, 120, 44100)
              }
            }
          ]
        }
      ]
    } as Project;
    expect(lastContentBeats(project)).toBeCloseTo(360, 5);
  });

  it('asks for more bars when the scroller is near the right edge', () => {
    expect(shouldGrowHorizon(9000, 1200, 10200)).toBe(true);
    expect(shouldGrowHorizon(0, 1200, 10200)).toBe(false);
  });
});

describe('sample-rate conversion', () => {
  it('keeps a 3-minute clip the same length when the engine is 48 kHz', () => {
    const duration = fromBeats(360, 120, 44100);
    const at48k = toSampleRate(duration, 48000);
    expect(at48k / 48000).toBeCloseTo(180, 5);
  });
});
