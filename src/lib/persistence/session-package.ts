/**
 * Pro Tools-style session package: a master `.qamuzsess` plus Audio Files,
 * MIDI Files and Interchange. QAMUZ opens the master file. Other DAWs import
 * the WAV/MIDI folders (Pro Tools, Logic, Ableton, Reaper).
 *
 * We do not write a proprietary `.ptx` or `.logicx` — those formats are closed.
 */

import { encodeWav } from '$lib/audio/import';
import { inferInstrument } from '$lib/audio/stems';
import { STYLE_CARDS } from '$lib/ai/style-cards';
import { isNoteEvent } from '$lib/core/midi';
import { encodeProjectFile } from '$lib/core/serialize';
import { toBeats } from '$lib/core/time';
import type { Project } from '$lib/core/project';
import { encodeMidiFile } from '$lib/midi/midi-file';
import { engine } from '$lib/stores';
import type { ZipEntry } from './zip';

export const SESSION_EXTENSION = 'qamuzsess';
export const AUDIO_DIR = 'Audio Files';
export const MIDI_DIR = 'MIDI Files';
export const INTERCHANGE_DIR = 'Interchange';

export type SessionFile = {
  path: string;
  data: Uint8Array;
};

export function safeSessionName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'QAMUZ-Session';
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function beatsToTimecode(beats: number, bpm: number): string {
  const seconds = (beats * 60) / Math.max(1, bpm);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}:${pad(frames)}`;
}

export function masterSessionDocument(name: string): string {
  return JSON.stringify(
    {
      format: 'qamuz-session',
      version: 1,
      extension: `.${SESSION_EXTENSION}`,
      name,
      project: 'project.json',
      folders: {
        audio: AUDIO_DIR,
        midi: MIDI_DIR,
        interchange: INTERCHANGE_DIR
      }
    },
    null,
    2
  );
}

function interchangeXml(project: Project, files: { track: string; kind: 'audio' | 'midi'; file: string; startBeats: number }[]): string {
  const bpm = project.tempo.bpm;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<QamuzSession version="1" name="${xmlEscape(project.name)}" tempo="${bpm}" sampleRate="${project.sampleRate}" timeSignature="${project.timeSignature.numerator}/${project.timeSignature.denominator}" ppq="${project.ppq}" originSeconds="${project.timelineOriginSeconds}">`,
    `  <Folders audio="${AUDIO_DIR}" midi="${MIDI_DIR}" interchange="${INTERCHANGE_DIR}"/>`
  ];
  for (const file of files) {
    lines.push(
      `  <Clip track="${xmlEscape(file.track)}" kind="${file.kind}" startBeats="${file.startBeats.toFixed(3)}" startTimecode="${beatsToTimecode(file.startBeats, bpm)}" file="${xmlEscape(file.file)}"/>`
    );
  }
  lines.push('</QamuzSession>', '');
  return lines.join('\n');
}

function interchangeReadme(name: string): string {
  return `QAMUZ Studio session: ${name}

This folder is laid out like a Pro Tools session:

  ${name}.${SESSION_EXTENSION}   master file — open this in QAMUZ Studio
  project.json                   QAMUZ / Studio 1.0 document
  ${AUDIO_DIR}/                  WAV stems (any DAW)
  ${MIDI_DIR}/                   Standard MIDI Files (any DAW)
  ${INTERCHANGE_DIR}/            SESSION.xml + training captions

Open in QAMUZ Studio
  Abrir → elige el archivo .${SESSION_EXTENSION} (o la carpeta).

Open in Pro Tools
  Create a new session, then File → Import → Audio and select ${AUDIO_DIR}.
  File → Import → MIDI for ${MIDI_DIR}. Clip start times are in Interchange/SESSION.xml.

Open in Logic Pro
  File → Import → Audio Files (${AUDIO_DIR}).
  File → Import → MIDI File (${MIDI_DIR}).

Ableton / Reaper / Cubase / Studio One
  Drag the WAV and MIDI files onto tracks. SESSION.xml lists start times.

QAMUZ cannot write a native .ptx or .logicx (those formats are proprietary).
The WAV + MIDI + XML package is the interchange those programs actually import.
`;
}

export function sessionTrainingManifest(project: Project): string {
  const tracks = project.tracks.map((track) => {
    const stem = inferInstrument(track.name);
    const card = STYLE_CARDS.find(
      (item) => item.instrument === stem.role || item.label.toLowerCase().includes(track.name.toLowerCase())
    );
    return {
      name: track.name,
      type: track.type,
      role: stem.role,
      caption: card?.caption ?? `qamuz, ${stem.role || 'track'}, ${track.name}`
    };
  });
  return JSON.stringify(
    {
      name: project.name,
      tempo: project.tempo.bpm,
      sampleRate: project.sampleRate,
      tracks,
      captions: tracks.map((track) => track.caption)
    },
    null,
    2
  );
}

export function buildSessionPackage(project: Project): { files: SessionFile[]; warnings: string[] } {
  const snapshot = structuredClone(project) as Project;
  const files: SessionFile[] = [];
  const warnings: string[] = [];
  const clips: { track: string; kind: 'audio' | 'midi'; file: string; startBeats: number }[] = [];
  const bpm = snapshot.tempo.bpm;
  const used = new Set<string>();

  const unique = (base: string, ext: string) => {
    let name = `${base}.${ext}`;
    let index = 2;
    while (used.has(name.toLowerCase())) {
      name = `${base} ${index}.${ext}`;
      index += 1;
    }
    used.add(name.toLowerCase());
    return name;
  };

  for (const track of snapshot.tracks) {
    const base = safeSessionName(track.name);
    for (const clip of track.clips) {
      const startBeats = toBeats(clip.timeRange.start, bpm);
      if (clip.content.kind === 'audio') {
        const fileID = clip.content.audio.fileReference.fileID;
        const buffer = engine.backend.audioBuffer(fileID);
        if (!buffer) {
          warnings.push(`Sin buffer en memoria para “${clip.name}”`);
          continue;
        }
        const filename = unique(base, 'wav');
        const relative = `${AUDIO_DIR}/${filename}`;
        files.push({ path: relative, data: encodeWav(buffer) });
        clip.content.audio.fileReference.relativePath = relative;
        const manifest = snapshot.audioFiles.find((file) => file.fileID === fileID);
        if (manifest) manifest.relativePath = relative;
        clips.push({ track: track.name, kind: 'audio', file: relative, startBeats });
      } else if (clip.content.kind === 'midi') {
        const notes = clip.content.midi.events.filter(isNoteEvent).map((event) => ({
          beat: event.beatPosition + startBeats,
          pitch: event.type.note.pitch,
          duration: event.type.note.duration,
          velocity: event.type.note.velocity,
          channel: event.channel
        }));
        if (!notes.length) continue;
        const filename = unique(base, 'mid');
        const relative = `${MIDI_DIR}/${filename}`;
        files.push({
          path: relative,
          data: encodeMidiFile(track.name, bpm, notes)
        });
        clips.push({ track: track.name, kind: 'midi', file: relative, startBeats });
      }
    }
  }

  const name = safeSessionName(snapshot.name);
  files.push({
    path: `${name}.${SESSION_EXTENSION}`,
    data: new TextEncoder().encode(masterSessionDocument(snapshot.name))
  });
  files.push({
    path: 'project.json',
    data: new TextEncoder().encode(encodeProjectFile(snapshot))
  });
  files.push({
    path: `${INTERCHANGE_DIR}/SESSION.xml`,
    data: new TextEncoder().encode(interchangeXml(snapshot, clips))
  });
  files.push({
    path: `${INTERCHANGE_DIR}/README.txt`,
    data: new TextEncoder().encode(interchangeReadme(snapshot.name))
  });
  files.push({
    path: `${INTERCHANGE_DIR}/training.json`,
    data: new TextEncoder().encode(sessionTrainingManifest(snapshot))
  });

  return { files, warnings };
}

export function sessionFilesToZipEntries(files: SessionFile[]): ZipEntry[] {
  return files.map((file) => ({ name: file.path, data: file.data }));
}
