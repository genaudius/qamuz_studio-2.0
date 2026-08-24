import { describe, expect, it } from 'vitest';

import { parseNotesFromResponse } from './parse';

describe('parseNotesFromResponse', () => {
  it('reads a bare JSON object', () => {
    const notes = parseNotesFromResponse(
      '{"notes":[{"pitch":60,"start":0,"duration":1,"velocity":100}]}'
    );
    expect(notes).toEqual([{ pitch: 60, start: 0, duration: 1, velocity: 100 }]);
  });

  it('strips markdown fences and surrounding prose', () => {
    const notes = parseNotesFromResponse(`Here you go:
\`\`\`json
{"notes":[{"pitch": 64, "start": 1.5, "duration": 0.5, "velocity": 90}]}
\`\`\`
Enjoy.`);
    expect(notes[0]).toMatchObject({ pitch: 64, start: 1.5, duration: 0.5, velocity: 90 });
  });

  it('clamps pitch and velocity', () => {
    const notes = parseNotesFromResponse(
      '{"notes":[{"pitch":200,"start":0,"duration":1,"velocity":0}]}'
    );
    expect(notes[0].pitch).toBe(127);
    expect(notes[0].velocity).toBe(1);
  });

  it('throws when there is nothing parseable', () => {
    expect(() => parseNotesFromResponse('sorry, I cannot help')).toThrow(/no MIDI notes/);
  });
});
