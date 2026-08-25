/**
 * Minimal Standard MIDI File reader (format 0/1). Enough to drop .mid stems
 * onto MIDI tracks with notes, tempo and a track name.
 */

import { makeNoteEvent, type MIDIEvent } from '$lib/core/midi';

export interface ParsedMidiTrack {
  name: string;
  channel: number;
  notes: MIDIEvent[];
  endBeat: number;
}

export interface ParsedMidiFile {
  format: number;
  ticksPerQuarter: number;
  tempoBpm: number;
  tracks: ParsedMidiTrack[];
}

class Cursor {
  offset = 0;
  constructor(readonly bytes: Uint8Array) {}

  remaining(): number {
    return this.bytes.length - this.offset;
  }

  u8(): number {
    const value = this.bytes[this.offset] ?? 0;
    this.offset += 1;
    return value;
  }

  u16(): number {
    return (this.u8() << 8) | this.u8();
  }

  u32(): number {
    return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0;
  }

  bytesOf(length: number): Uint8Array {
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  ascii(length: number): string {
    return new TextDecoder('latin1').decode(this.bytesOf(length));
  }

  vlq(): number {
    let value = 0;
    for (let i = 0; i < 4; i += 1) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) break;
    }
    return value;
  }
}

function decodeChunk(cursor: Cursor): { type: string; data: Uint8Array } | null {
  if (cursor.remaining() < 8) return null;
  const type = cursor.ascii(4);
  const length = cursor.u32();
  if (cursor.remaining() < length) return null;
  return { type, data: cursor.bytesOf(length) };
}

function ticksToBeats(ticks: number, ticksPerQuarter: number): number {
  return ticks / Math.max(1, ticksPerQuarter);
}

function parseTrack(data: Uint8Array, ticksPerQuarter: number): {
  name: string;
  notes: MIDIEvent[];
  endTick: number;
  channel: number;
  tempoUs: number | null;
} {
  const cursor = new Cursor(data);
  let tick = 0;
  let running = 0;
  let name = '';
  let tempoUs: number | null = null;
  let channel = 0;
  const active = new Map<string, { tick: number; velocity: number }>();
  const notes: MIDIEvent[] = [];

  const noteOff = (ch: number, pitch: number, at: number) => {
    const key = `${ch}:${pitch}`;
    const start = active.get(key);
    if (!start) return;
    active.delete(key);
    const duration = Math.max(0.05, ticksToBeats(at - start.tick, ticksPerQuarter));
    notes.push(makeNoteEvent(ticksToBeats(start.tick, ticksPerQuarter), pitch, start.velocity, duration, ch));
  };

  while (cursor.remaining() > 0) {
    tick += cursor.vlq();
    let status = cursor.u8();
    if (status < 0x80) {
      cursor.offset -= 1;
      status = running;
    } else if (status < 0xf0) {
      running = status;
    }

    if (status === 0xff) {
      const meta = cursor.u8();
      const length = cursor.vlq();
      const payload = cursor.bytesOf(length);
      if (meta === 0x03 || meta === 0x04) {
        const label = new TextDecoder('latin1').decode(payload).trim();
        if (label && !name) name = label;
      } else if (meta === 0x51 && payload.length >= 3) {
        tempoUs = (payload[0] << 16) | (payload[1] << 8) | payload[2];
      } else if (meta === 0x2f) {
        break;
      }
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      cursor.bytesOf(cursor.vlq());
      continue;
    }

    const type = status & 0xf0;
    const ch = status & 0x0f;
    channel = ch;

    if (type === 0xc0 || type === 0xd0) {
      cursor.u8();
      continue;
    }

    const data1 = cursor.u8();
    const data2 = type === 0xf0 ? 0 : cursor.u8();

    if (type === 0x90 && data2 > 0) {
      active.set(`${ch}:${data1}`, { tick, velocity: data2 });
    } else if (type === 0x80 || (type === 0x90 && data2 === 0)) {
      noteOff(ch, data1, tick);
    }
  }

  for (const key of [...active.keys()]) {
    const pitch = Number(key.split(':')[1]);
    const ch = Number(key.split(':')[0]);
    noteOff(ch, pitch, tick);
  }

  const endTick = notes.reduce((max, event) => {
    if (event.type.kind !== 'note') return max;
    const end = event.beatPosition + event.type.note.duration;
    return Math.max(max, end * ticksPerQuarter);
  }, tick);

  return { name, notes, endTick, channel, tempoUs };
}

export function parseMidiFile(bytes: ArrayBuffer): ParsedMidiFile {
  const cursor = new Cursor(new Uint8Array(bytes));
  const header = decodeChunk(cursor);
  if (!header || header.type !== 'MThd' || header.data.length < 6) {
    throw new Error('Archivo MIDI inválido');
  }
  const head = new Cursor(header.data);
  const format = head.u16();
  const trackCount = head.u16();
  const division = head.u16();
  const ticksPerQuarter = division & 0x8000 ? 480 : division;

  let tempoUs = 500_000;
  const tracks: ParsedMidiTrack[] = [];

  for (let i = 0; i < trackCount; i += 1) {
    const chunk = decodeChunk(cursor);
    if (!chunk || chunk.type !== 'MTrk') break;
    const parsed = parseTrack(chunk.data, ticksPerQuarter);
    if (parsed.tempoUs) tempoUs = parsed.tempoUs;
    if (parsed.notes.length === 0) continue;
    tracks.push({
      name: parsed.name || `MIDI ${tracks.length + 1}`,
      channel: parsed.channel,
      notes: parsed.notes,
      endBeat: Math.max(1, ticksToBeats(parsed.endTick, ticksPerQuarter))
    });
  }

  if (tracks.length === 0 && format === 0) {
    throw new Error('El MIDI no tiene notas');
  }

  return {
    format,
    ticksPerQuarter,
    tempoBpm: Math.round(60_000_000 / Math.max(1, tempoUs)),
    tracks
  };
}

export const MIDI_TICKS_PER_QUARTER = 480;

function vlq(value: number): number[] {
  const amount = Math.max(0, Math.floor(value));
  const bytes = [amount & 0x7f];
  let rest = amount >> 7;
  while (rest > 0) {
    bytes.unshift(0x80 | (rest & 0x7f));
    rest >>= 7;
  }
  return bytes;
}

function beatsToTicks(beats: number, ticksPerQuarter = MIDI_TICKS_PER_QUARTER): number {
  return Math.max(0, Math.round(beats * ticksPerQuarter));
}

export interface MidiNoteWrite {
  beat: number;
  pitch: number;
  duration: number;
  velocity: number;
  channel?: number;
}

/** Standard MIDI File format 1 (tempo track + one note track). Any DAW can import it. */
export function encodeMidiFile(
  name: string,
  bpm: number,
  notes: MidiNoteWrite[],
  ticksPerQuarter = MIDI_TICKS_PER_QUARTER
): Uint8Array {
  const tempoUs = Math.round(60_000_000 / Math.max(1, bpm));
  const tempoTrack: number[] = [
    ...vlq(0),
    0xff,
    0x51,
    0x03,
    (tempoUs >> 16) & 0xff,
    (tempoUs >> 8) & 0xff,
    tempoUs & 0xff,
    ...vlq(0),
    0xff,
    0x2f,
    0x00
  ];

  const events: { tick: number; bytes: number[] }[] = [];
  const label = name.slice(0, 32);
  events.push({
    tick: 0,
    bytes: [0xff, 0x03, label.length, ...[...label].map((ch) => ch.charCodeAt(0) & 0x7f)]
  });

  for (const note of notes) {
    const channel = Math.min(15, Math.max(0, note.channel ?? 0));
    const start = beatsToTicks(note.beat, ticksPerQuarter);
    const end = start + Math.max(1, beatsToTicks(note.duration, ticksPerQuarter));
    const pitch = Math.min(127, Math.max(0, Math.round(note.pitch)));
    const velocity = Math.min(127, Math.max(1, Math.round(note.velocity)));
    events.push({ tick: start, bytes: [0x90 | channel, pitch, velocity] });
    events.push({ tick: end, bytes: [0x80 | channel, pitch, 0] });
  }

  events.sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]);

  const noteTrack: number[] = [];
  let cursor = 0;
  for (const event of events) {
    noteTrack.push(...vlq(event.tick - cursor), ...event.bytes);
    cursor = event.tick;
  }
  noteTrack.push(...vlq(0), 0xff, 0x2f, 0x00);

  const chunks = [tempoTrack, noteTrack];
  const bytes: number[] = [
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    1,
    0,
    chunks.length,
    (ticksPerQuarter >> 8) & 0xff,
    ticksPerQuarter & 0xff
  ];

  for (const track of chunks) {
    bytes.push(0x4d, 0x54, 0x72, 0x6b);
    bytes.push((track.length >> 24) & 0xff, (track.length >> 16) & 0xff, (track.length >> 8) & 0xff, track.length & 0xff);
    bytes.push(...track);
  }

  return new Uint8Array(bytes);
}
