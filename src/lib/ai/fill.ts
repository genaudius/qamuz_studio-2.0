/**
 * Apply Generative Fill to the current range selection.
 */

import { importAudioBytes } from '$lib/audio/import';
import type { InstrumentName } from '$lib/audio/backend';
import { isNoteEvent } from '$lib/core/midi';
import { toBeats } from '$lib/core/time';
import { engine, projectStore, transport } from '$lib/stores';
import { editMIDI, generateMIDI } from './claude';
import { isClaudeConfigured } from './config';
import { generateAIAudio } from './elevenlabs';
import { localPartForSound } from './local-midi';
import type { AIAudioModel, GeneratedMIDINote, MIDIGenerationResult, TrackNoteContext } from './types';

function soundFromPrompt(prompt: string): InstrumentName {
  const t = prompt.toLowerCase();
  if (/(bajo|bass)/.test(t)) return 'bass';
  if (/(bater|drum)/.test(t)) return 'drums';
  if (/piano/.test(t)) return 'piano';
  if (/(pad|cuerda|string)/.test(t)) return 'pad';
  if (/(guitar|requinto|pluck)/.test(t)) return 'pluck';
  if (/(lead|synth|metal)/.test(t)) return 'lead';
  return 'bass';
}

function localMidiResult(prompt: string, beats: number, beatsPerBar: number): MIDIGenerationResult {
  return {
    notes: localPartForSound(soundFromPrompt(prompt), beats, beatsPerBar),
    suggestedName: prompt.slice(0, 20) || 'MIDI'
  };
}

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
    let result: MIDIGenerationResult;
    try {
      if (isClaudeConfigured() && current.length > 0) {
        result = await editMIDI({
          prompt,
          currentNotes: current,
          beatCount: beats,
          tempo,
          timeSignature,
          otherTracks
        });
      } else if (isClaudeConfigured()) {
        result = await generateMIDI({
          prompt,
          beatCount: beats,
          tempo,
          timeSignature,
          otherTracks
        });
      } else {
        result = localMidiResult(prompt, beats, timeSignature.numerator || 4);
      }
    } catch {
      result = localMidiResult(prompt, beats, timeSignature.numerator || 4);
    }

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
