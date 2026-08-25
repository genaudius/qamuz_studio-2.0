import { describe, expect, it } from 'vitest';

import { localPartForSound } from './local-midi';

describe('localPartForSound', () => {
  it('writes a bass line that covers the section', () => {
    const notes = localPartForSound('bass', 8, 4);
    expect(notes.length).toBeGreaterThan(2);
    expect(notes[0]?.pitch).toBe(36);
    expect(Math.max(...notes.map((note) => note.start + note.duration))).toBeGreaterThan(3);
  });

  it('keeps drums on the grid', () => {
    const notes = localPartForSound('drums', 4, 4);
    expect(notes.some((note) => note.pitch === 60 || note.pitch === 61)).toBe(true);
    expect(notes[0]?.start).toBeGreaterThanOrEqual(0);
  });

  it('changes the bass groove by bachata style', () => {
    const bolero = localPartForSound('bass', 16, 4, { feel: 'bolero', groove: 'bachata', role: 'bass' });
    const bailable = localPartForSound('bass', 16, 4, { feel: 'bailable', groove: 'bachata', role: 'bass' });
    expect(bailable.length).toBeGreaterThan(bolero.length);
    const paloma = localPartForSound('bass', 8, 4, { feel: 'romantico', groove: 'bachata', role: 'bass' });
    const nextChord = paloma.some((item) => item.start >= 3.4 && item.start < 4 && item.pitch !== paloma[0]?.pitch);
    expect(nextChord).toBe(true);
  });

  it('does not use bachata paloma for merengue', () => {
    const bachata = localPartForSound('bass', 8, 4, { feel: 'romantico', groove: 'bachata', role: 'bass' });
    const merengue = localPartForSound('bass', 8, 4, { groove: 'merengue', role: 'bass' });
    const merengueOnBeat = merengue.filter((item) => Math.abs(item.start - Math.round(item.start)) < 0.05);
    const bachataPickup = bachata.filter((item) => item.start > 3.3 && item.start < 3.7);
    expect(merengueOnBeat.length).toBeGreaterThan(bachataPickup.length);
    expect(merengue.length).not.toBe(bachata.length);
  });
});
