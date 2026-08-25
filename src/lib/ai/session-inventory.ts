/**
 * What is actually on the arrange: lanes can exist and still be silent.
 */

import { isNoteEvent } from '$lib/core/midi';
import type { Clip } from '$lib/core/clip';
import type { Track } from '$lib/core/track';
import { projectStore } from '$lib/stores';

export type TrackFill = {
  id: string;
  name: string;
  type: Track['type'];
  empty: boolean;
  clips: number;
  notes: number;
};

export type SessionInventory = {
  tracks: TrackFill[];
  empty: TrackFill[];
  filled: TrackFill[];
  allEmpty: boolean;
  selected: TrackFill | null;
};

export function clipHasSound(clip: Clip): boolean {
  if (clip.content.kind === 'empty') return false;
  if (clip.content.kind === 'audio') return clip.content.audio.sourceLengthSamples > 0;
  return clip.content.midi.events.some(isNoteEvent);
}

export function trackIsEmpty(track: Track): boolean {
  if (track.type === 'master' || track.type === 'bus') return true;
  return !track.clips.some(clipHasSound);
}

export function inspectTracks(tracks: Track[], selectedId: string | null = null): SessionInventory {
  const usable = tracks.filter((track) => track.type !== 'master' && track.type !== 'bus');
  const listed: TrackFill[] = usable.map((track) => ({
    id: track.id,
    name: track.name,
    type: track.type,
    empty: trackIsEmpty(track),
    clips: track.clips.length,
    notes: track.clips.reduce((count, clip) => {
      if (clip.content.kind !== 'midi') return count;
      return count + clip.content.midi.events.filter(isNoteEvent).length;
    }, 0)
  }));
  const empty = listed.filter((track) => track.empty);
  const filled = listed.filter((track) => !track.empty);
  return {
    tracks: listed,
    empty,
    filled,
    allEmpty: listed.length === 0 || filled.length === 0,
    selected: listed.find((track) => track.id === selectedId) ?? null
  };
}

export function sessionInventory(): SessionInventory {
  return inspectTracks(projectStore.project.tracks, projectStore.selectedTrackID);
}

export function arrangeHasAudio(): boolean {
  return projectStore.project.tracks.some((track) =>
    track.clips.some((clip) => clip.content.kind === 'audio' && clip.content.audio.sourceLengthSamples > 0)
  );
}

export function describeInventory(inventory = sessionInventory()): string {
  if (!inventory.tracks.length) {
    return 'El arrange no tiene pistas. Puedo crear una y ponerle un instrumento.';
  }
  if (inventory.allEmpty) {
    const names = inventory.empty.map((track) => track.name).join(', ');
    return `Todos los tracks están vacíos (${names}). No hay audio ni MIDI todavía.`;
  }
  const filled = inventory.filled.map((track) => track.name).join(', ');
  const empty = inventory.empty.map((track) => track.name).join(', ');
  if (empty) {
    return `Con material: ${filled}. Vacíos: ${empty}.`;
  }
  return `Hay material en: ${filled}.`;
}
