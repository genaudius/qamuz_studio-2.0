import { describe, expect, it } from 'vitest';

import * as conductorSnap from './conductor-snap';
import { planOperationalEntry } from './conductor-snap';
import { COMMON_TIME, formatBarsBeats, secondsToBeats } from '$lib/core/time';

describe('operational entry on 2|2', () => {
  it('does not look up original-song titles from the project name', () => {
    expect('HUMAN_SESSION_ANCHORS' in conductorSnap).toBe(false);
    expect('matchHumanSessionAnchor' in conductorSnap).toBe(false);
  });

  it('puts an early hit on 2|2 and leaves 1|1 as count-in', () => {
    const plan = planOperationalEntry({ hitSeconds: 0.173, bpm: 130 });
    expect(plan.originSeconds).toBe(0);
    expect(plan.entryBeats).toBe(5);
    expect(formatBarsBeats(plan.clipStartBeats + secondsToBeats(0.173, 130), COMMON_TIME, 960)).toBe(
      '2|2|000'
    );
  });

  it('keeps a pickup before 2|2 when the ensemble hit is later', () => {
    const plan = planOperationalEntry({ hitSeconds: 2.243, bpm: 125 });
    expect(plan.originSeconds).toBe(0);
    expect(formatBarsBeats(plan.clipStartBeats + secondsToBeats(2.243, 125), COMMON_TIME, 960)).toBe(
      '2|2|000'
    );
    const pickupBeats = plan.clipStartBeats + secondsToBeats(0.156, 125);
    expect(pickupBeats).toBeLessThan(plan.entryBeats);
    expect(formatBarsBeats(pickupBeats, COMMON_TIME, 960).startsWith('1|')).toBe(true);
  });
});
