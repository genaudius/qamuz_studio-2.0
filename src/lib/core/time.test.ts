import { describe, expect, it } from 'vitest';

import { createNewProject } from './project';
import { decodeProjectFile, encodeProjectFile } from './serialize';
import {
  COMMON_TIME,
  DEFAULT_PPQ,
  MIDI_PPQ,
  PRO_TOOLS_PPQ,
  formatBarsBeats,
  musicalBeatsToSeconds,
  parseBarsBeatsTicks,
  positionToBeats,
  secondsToMusicalBeats
} from './time';

const FOUR_FOUR = COMMON_TIME;

describe('conductor / MusicalClock port', () => {
  it('defaults new projects to Pro Tools 960 PPQ', () => {
    const project = createNewProject();
    expect(project.ppq).toBe(PRO_TOOLS_PPQ);
    expect(project.timelineOriginSeconds).toBe(0);
    expect(DEFAULT_PPQ).toBe(960);
  });

  it('formats like Pro Tools bar|beat|tick, not the old 2-digit centiseconds', () => {
    expect(formatBarsBeats(0, FOUR_FOUR, 960)).toBe('1|1|000');
    expect(formatBarsBeats(1.25, FOUR_FOUR, 960)).toBe('1|2|240');
    expect(formatBarsBeats(-0.1, FOUR_FOUR, 960)).toBe('pre 1|1');
  });

  it('round-trips clone 1.0 480 ticks and Pro Tools 960', () => {
    expect(formatBarsBeats(0.5, FOUR_FOUR, MIDI_PPQ)).toBe('1|1|240');
    expect(parseBarsBeatsTicks('2|4|240')).toEqual({ bar: 2, beat: 4, tick: 240 });
    expect(parseBarsBeatsTicks('2.4.240')).toEqual({ bar: 2, beat: 4, tick: 240 });
  });

  it('matches the Ecos de Amor teacher positions at 130 BPM 4/4 960', () => {
    const requintoBeats = positionToBeats({ bar: 2, beat: 4, tick: 240 }, FOUR_FOUR, 960);
    const strongBeats = positionToBeats({ bar: 2, beat: 4, tick: 957 }, FOUR_FOUR, 960);
    expect(requintoBeats).toBeCloseTo(7.25, 10);
    expect(musicalBeatsToSeconds(requintoBeats, 130, 0)).toBeCloseTo(3.346153846, 9);
    expect(musicalBeatsToSeconds(strongBeats, 130, 0)).toBeCloseTo(3.690865385, 9);
  });

  it('maps Session C 0.173 s onto 2|2 when 1|1 is a count-in', () => {
    const entryBeats = positionToBeats({ bar: 2, beat: 2, tick: 0 }, FOUR_FOUR, 960);
    const origin = 0.173 - (entryBeats / 130) * 60;
    const clipStartBeats = -secondsToMusicalBeats(origin, 130, 0);
    expect(entryBeats).toBe(5);
    expect(origin).toBeLessThan(0);
    expect(
      formatBarsBeats(clipStartBeats + (0.173 / 60) * 130, FOUR_FOUR, 960)
    ).toBe('2|2|000');
  });

  it('keeps opening 1.0 clone projects that have no ppq key', () => {
    const project = createNewProject('Legacy');
    const envelope = JSON.parse(encodeProjectFile(project)) as {
      project: Record<string, unknown>;
    };
    delete envelope.project.ppq;
    delete envelope.project.timelineOriginSeconds;
    const opened = decodeProjectFile(JSON.stringify(envelope));
    expect(opened.project.ppq).toBe(960);
    expect(opened.project.timelineOriginSeconds).toBe(0);
  });
});
