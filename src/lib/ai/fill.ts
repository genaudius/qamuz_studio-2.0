/**
 * Apply Generative Fill to the current range selection.
 */

import { importAudioBytes } from '$lib/audio/import';
import { isNoteEvent } from '$lib/core/midi';
import { toBeats } from '$lib/core/time';
import { engine, projectStore, transport } from '$lib/stores';
import { editMIDI, generateMIDI } from './claude';
import { generateAIAudio } from './elevenlabs';
import type { AIAudioModel, GeneratedMIDINote, TrackNoteContext } from './types';

export function beatCountOfRange(): number {
  const range = projectStore.rangeSelection;
  if (!range) return 0;
  return Math.max(1, Math.round(range.endBeat - range.startBeat));
}

export function notesInSelection(): GeneratedMIDINote[] {
  const range = projectStore.rangeSelection;
  if (!range) return [];

  const track = projectStore.project.tracks.find((t) => t.id === range.trackID);
  if (!track) return [];

  const bpm = projectStore.project.tempo.bpm;
  const notes: GeneratedMIDINote[] = [];

  for (const clip of track.clips) {
    if (clip.content.kind !== 'midi') continue;
    const clipStart = toBeats(clip.timeRange.start, bpm);
    for (const event of clip.content.midi.events) {
      if (!isNoteEvent(event)) continue;
      const abs = clipStart + event.beatPosition;
      const end = abs + event.type.note.duration;
      if (abs < range.endBeat && end > range.startBeat) {
        notes.push({
          pitch: event.type.note.pitch,
          start: Math.max(0, abs - range.startBeat),
          duration: event.type.note.duration,
          velocity: event.type.note.velocity
        });
      }
    }
  }

  return notes;
}

export function otherTrackContext(): TrackNoteContext[] {
  const range = projectStore.rangeSelection;
  const bpm = projectStore.project.tempo.bpm;
  const start = range?.startBeat ?? 0;
  const end = range?.endBeat ?? start + 8;

  return projectStore.project.tracks
    .filter((t) => t.id !== range?.trackID)
    .map((track) => {
      const notes: GeneratedMIDINote[] = [];
      for (const clip of track.clips) {
        if (clip.content.kind !== 'midi') continue;
        const clipStart = toBeats(clip.timeRange.start, bpm);
        for (const event of clip.content.midi.events) {
          if (!isNoteEvent(event)) continue;
          const abs = clipStart + event.beatPosition;
          if (abs >= start && abs < end) {
            notes.push({
              pitch: event.type.note.pitch,
              start: abs - start,
              duration: event.type.note.duration,
              velocity: event.type.note.velocity
            });
          }
        }
      }
      return { trackName: track.name, notes };
    })
    .filter((t) => t.notes.length > 0);
}

export async function runMIDIFill(prompt: string): Promise<void> {
  const range = projectStore.rangeSelection;
  if (!range) throw new Error('Select a beat range on a MIDI track first');

  const beats = beatCountOfRange();
  const current = notesInSelection();
  const otherTracks = otherTrackContext();
  const tempo = transport.bpm;
  const timeSignature = transport.timeSignature;

  projectStore.isAIGenerating = true;
  try {
    const result =
      current.length > 0
        ? await editMIDI({
            prompt,
            currentNotes: current,
            beatCount: beats,
            tempo,
            timeSignature,
            otherTracks
          })
        : await generateMIDI({
            prompt,
            beatCount: beats,
            tempo,
            timeSignature,
            otherTracks
          });

    projectStore.insertGeneratedMIDI(
      range.trackID,
      range.startBeat,
      range.endBeat,
      result.notes.map((n) => ({
        beat: n.start,
        pitch: n.pitch,
        duration: n.duration,
        velocity: n.velocity
      })),
      result.suggestedName,
      current.length > 0
    );
    engine.rebuildSchedule();
    projectStore.bottomPanel = 'pianoRoll';
  } finally {
    projectStore.isAIGenerating = false;
    projectStore.aiFillMode = false;
  }
}

export async function runAudioFill(prompt: string, model: AIAudioModel): Promise<void> {
  const range = projectStore.rangeSelection;
  if (!range) throw new Error('Select a beat range on an audio track first');

  const beats = beatCountOfRange();
  const seconds = (beats / transport.bpm) * 60;

  projectStore.isAIGenerating = true;
  try {
    const bytes = await generateAIAudio({ prompt, model, durationSeconds: seconds });
    await importAudioBytes(bytes, range.trackID, range.startBeat, prompt.slice(0, 32) || 'Generated');
  } finally {
    projectStore.isAIGenerating = false;
    projectStore.aiFillMode = false;
  }
}
