import { describe, expect, it } from 'vitest';

import { encodeMidiFile, parseMidiFile } from './midi-file';

function vlq(value: number): number[] {
  if (value < 0x80) return [value];
  return [0x80 | ((value >> 7) & 0x7f), value & 0x7f];
}

function midiNoteOnOff(): Uint8Array {
  const track: number[] = [
    0x00, 0xff, 0x03, 0x04, 0x42, 0x61, 0x6a, 0x6f, // name "Bajo"
    ...vlq(0), 0x90, 0x24, 0x64,
    ...vlq(480), 0x80, 0x24, 0x00,
    0x00, 0xff, 0x2f, 0x00
  ];
  const header = [
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0, // 480 tpq
    0x4d, 0x54, 0x72, 0x6b,
    (track.length >> 24) & 0xff,
    (track.length >> 16) & 0xff,
    (track.length >> 8) & 0xff,
    track.length & 0xff,
    ...track
  ];
  return new Uint8Array(header);
}

describe('parseMidiFile', () => {
  it('reads a one-note format-0 file', () => {
    const parsed = parseMidiFile(midiNoteOnOff().buffer);
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].name).toBe('Bajo');
    expect(parsed.tracks[0].notes).toHaveLength(1);
    expect(parsed.tracks[0].notes[0].type.kind).toBe('note');
    if (parsed.tracks[0].notes[0].type.kind === 'note') {
      expect(parsed.tracks[0].notes[0].type.note.pitch).toBe(36);
    }
  });

  it('roundtrips notes through encodeMidiFile', () => {
    const bytes = encodeMidiFile('Bajo', 128, [
      { beat: 0, pitch: 36, duration: 1, velocity: 100 },
      { beat: 2, pitch: 43, duration: 0.5, velocity: 90 }
    ]);
    const parsed = parseMidiFile(bytes.buffer);
    expect(parsed.tempoBpm).toBe(128);
    expect(parsed.tracks[0].notes).toHaveLength(2);
    expect(parsed.tracks[0].name).toBe('Bajo');
  });
});
