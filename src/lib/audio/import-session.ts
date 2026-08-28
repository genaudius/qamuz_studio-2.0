/**
 * One-file-per-track session import: folder or multi-file drop of WAV/MP3/MIDI
 * and virtual-instrument shells. Names come from the filename; stereo stays stereo.
 */

import {
  AUDIO_EXTENSIONS,
  classifyStemFile,
  inferInstrument,
  layoutLabel,
  uniqueTrackName,
  channelLayout,
  instrumentForStem,
  type StemKind
} from './stems';
import { importAudioFile, importAudioPath, isAudioPath, type ImportResult } from './import';
import { parseMidiFile } from '$lib/midi/midi-file';
import { isTauri, readAudioFile } from '$lib/persistence/tauri';
import { persistDawSession } from '$lib/persistence/daw-db';
import {
  currentStudioSession,
  patchCurrentSession,
  sessionGate,
  upsertSession
} from '$lib/persistence/sessions.svelte';
import { engine, projectStore, transport, workspace } from '$lib/stores';

export interface SessionImportItem {
  name: string;
  kind: StemKind;
  layout?: string;
  trackId?: string;
  error?: string;
}

export interface SessionImportReport {
  items: SessionImportItem[];
  folderName?: string;
  summary: string;
}

function takenNames(): string[] {
  return projectStore.project.tracks.map((track) => track.name);
}

function namedTrack(kind: 'audio' | 'midi' | 'instrument', filename: string) {
  const stem = inferInstrument(filename);
  const type = kind === 'audio' ? 'audio' : kind === 'instrument' ? 'instrument' : 'midi';
  const name = uniqueTrackName(stem.name, takenNames());
  const track = projectStore.addTrack(type, name);
  if (type !== 'audio') {
    projectStore.setTrackInstrument(track.id, instrumentForStem(stem));
  }
  return { track, stem };
}

async function importAudioOntoNewTrack(
  source: { path?: string; file?: File },
  startBeat: number
): Promise<SessionImportItem> {
  const label = source.path ?? source.file?.name ?? 'audio';
  const { track, stem } = namedTrack('audio', label);
  const placed: ImportResult = source.path
    ? await importAudioPath(source.path, track.id, startBeat)
    : source.file
      ? await importAudioFile(source.file, track.id, startBeat)
      : { clipID: null, error: 'Sin archivo' };

  if (!placed.clipID) {
    projectStore.deleteTrack(track.id);
    return { name: stem.name, kind: 'audio', error: placed.error ?? `No pude leer ${label}` };
  }

  const found = projectStore.findClip(placed.clipID);
  const channels =
    found?.clip.content.kind === 'audio' ? found.clip.content.audio.fileReference.channelCount : 1;
  return {
    name: track.name,
    kind: 'audio',
    layout: layoutLabel(channelLayout(channels), channels),
    trackId: track.id,
    error: placed.error
  };
}

async function importMidiBytes(bytes: ArrayBuffer, filename: string): Promise<SessionImportItem> {
  try {
    const parsed = parseMidiFile(bytes);
    if (parsed.tempoBpm >= 40 && parsed.tempoBpm <= 240 && projectStore.project.tracks.every((t) => t.clips.length === 0)) {
      transport.setTempo(parsed.tempoBpm);
      projectStore.setTempo(transport.bpm);
    }
    const parts = parsed.tracks.length ? parsed.tracks : [];
    if (!parts.length) return { name: filename, kind: 'midi', error: 'MIDI sin notas' };

    const created: string[] = [];
    for (const part of parts) {
      const { track } = namedTrack('midi', part.name || filename);
      const endBeat = Math.max(4, part.endBeat);
      projectStore.insertGeneratedMIDI(
        track.id,
        0,
        endBeat,
        part.notes
          .filter((event) => event.type.kind === 'note')
          .map((event) => ({
            beat: event.beatPosition,
            pitch: event.type.kind === 'note' ? event.type.note.pitch : 60,
            duration: event.type.kind === 'note' ? event.type.note.duration : 0.25,
            velocity: event.type.kind === 'note' ? event.type.note.velocity : 100
          })),
        track.name,
        false
      );
      created.push(track.name);
    }
    engine.rebuildSchedule();
    return {
      name: created.join(', '),
      kind: 'midi',
      layout: 'MIDI',
      trackId: projectStore.selectedTrackID ?? undefined
    };
  } catch (error) {
    return { name: filename, kind: 'midi', error: (error as Error).message };
  }
}

function importInstrumentShell(filename: string): SessionImportItem {
  const { track, stem } = namedTrack('instrument', filename);
  return {
    name: track.name,
    kind: 'instrument',
    layout: `Instrumento virtual (${stem.instrument ?? 'piano'})`,
    trackId: track.id
  };
}

export async function importSessionSources(
  sources: Array<{ path?: string; file?: File; name: string }>,
  startBeat = 0
): Promise<SessionImportReport> {
  const items: SessionImportItem[] = [];
  let folderName: string | undefined;

  for (const source of sources) {
    const name = source.name;
    if (!folderName && source.file?.webkitRelativePath) {
      folderName = source.file.webkitRelativePath.split(/[\\/]/)[0];
    }
    const kind = classifyStemFile(name);
    if (!kind) continue;
    if (kind === 'audio') {
      items.push(await importAudioOntoNewTrack(source, startBeat));
    } else if (kind === 'midi') {
      try {
        const bytes = source.file
          ? await source.file.arrayBuffer()
          : source.path
            ? ((await readAudioFile(source.path)).buffer as ArrayBuffer)
            : null;
        if (!bytes) {
          items.push({ name, kind: 'midi', error: 'No pude leer el MIDI' });
          continue;
        }
        items.push(await importMidiBytes(bytes, name));
      } catch (error) {
        items.push({ name, kind: 'midi', error: (error as Error).message });
      }
    } else {
      items.push(importInstrumentShell(name));
    }
  }

  const ok = items.filter((item) => !item.error);
  const failed = items.filter((item) => item.error);
  const importedName = folderName || ok[0]?.name || 'Stems importados';
  if (!currentStudioSession.record) {
    upsertSession({
      name: importedName,
      idea: `Sesión importada${folderName ? ` desde ${folderName}` : ''}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stage: 'imported',
      title: importedName
    });
    if (/untitled|sin título/i.test(projectStore.project.name)) {
      projectStore.rename(importedName);
    }
  } else if (folderName && /sin título|untitled|QAMUZ-Nueva/i.test(currentStudioSession.record.name)) {
    patchCurrentSession({ title: folderName, name: folderName });
    projectStore.rename(folderName);
  }

  patchCurrentSession({ stage: ok.length ? 'imported' : currentStudioSession.record?.stage });
  sessionGate.close();
  workspace.open('arrange');

  let snapNote = '';
  if (ok.length) {
    const { snapImportedSessionToBar } = await import('./conductor-snap');
    const snap = snapImportedSessionToBar({});
    if (snap) snapNote = ` ${snap.message}`;
  }

  void persistDawSession();
  engine.rebuildSchedule();

  const summary = [
    ok.length
      ? `Importé ${ok.length} canal${ok.length === 1 ? '' : 'es'}: ${ok.map((item) => `${item.name}${item.layout ? ` (${item.layout})` : ''}`).join(', ')}.`
      : 'No importé archivos de audio, MIDI o instrumentos.',
    failed.length ? `No pude leer: ${failed.map((item) => `${item.name} (${item.error})`).join('; ')}.` : '',
    ok.length
      ? `Play arranca en 1|1.${snapNote} El título se cambia con doble clic arriba.`
      : ''
  ]
    .filter(Boolean)
    .join(' ');

  window.dispatchEvent(
    new CustomEvent('qamuz:stems-imported', {
      detail: { items, folderName, summary, autoMix: false }
    })
  );

  return { items, folderName, summary };
}

export async function importSessionFiles(files: File[], startBeat = 0): Promise<SessionImportReport> {
  const sources = [...files]
    .filter((file) => classifyStemFile(file.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return importSessionSources(
    sources.map((file) => ({ file, name: file.name })),
    startBeat
  );
}

export async function importSessionPaths(paths: string[], startBeat = 0): Promise<SessionImportReport> {
  const sources = paths
    .filter((path) => classifyStemFile(path))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((path) => ({ path, name: path.replace(/^.*[\\/]/, '') }));
  return importSessionSources(sources, startBeat);
}

async function listFolderFiles(root: string): Promise<string[]> {
  const { readDir } = await import('@tauri-apps/plugin-fs');
  const found: string[] = [];

  async function walk(dir: string) {
    const entries = await readDir(dir);
    for (const entry of entries) {
      const path = `${dir.replace(/[\\/]$/, '')}/${entry.name}`;
      if (entry.isDirectory) {
        await walk(path);
      } else if (classifyStemFile(entry.name ?? '')) {
        found.push(path);
      }
    }
  }

  await walk(root);
  return found;
}

const AUDIO_ACCEPT = AUDIO_EXTENSIONS.map((ext) => `.${ext}`).concat('.mid', '.midi').join(',');

/** Pick WAV/MP3/MIDI files (visible in the dialog), one track per file. */
export async function chooseSessionFiles(): Promise<SessionImportReport> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: true,
      directory: false,
      title: 'Importar stems',
      filters: [{ name: 'Audio y MIDI', extensions: [...AUDIO_EXTENSIONS, 'mid', 'midi'] }]
    });
    if (!selected) return { items: [], summary: 'Importación cancelada.' };
    const paths = (Array.isArray(selected) ? selected : [selected]).filter((path) =>
      Boolean(classifyStemFile(path))
    );
    if (!paths.length) {
      return { items: [], summary: 'No elegiste WAV, MP3 o MIDI.' };
    }
    return importSessionPaths(paths);
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = AUDIO_ACCEPT;
    const finish = (files: File[]) => {
      if (!files.length) {
        resolve({ items: [], summary: 'Importación cancelada.' });
        return;
      }
      void importSessionFiles(files).then(resolve);
    };
    input.addEventListener('cancel', () => finish([]));
    input.onchange = () => finish(input.files ? [...input.files] : []);
    input.click();
  });
}

export async function chooseSessionFolder(): Promise<SessionImportReport> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Importar carpeta de sesión'
    });
    if (!selected || Array.isArray(selected)) {
      return { items: [], summary: 'Importación cancelada.' };
    }
    const paths = await listFolderFiles(selected);
    if (!paths.length) return { items: [], folderName: selected.replace(/^.*[\\/]/, ''), summary: 'La carpeta no tiene WAV, MP3, MIDI ni instrumentos.' };
    return importSessionPaths(paths);
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.accept = '.wav,.mp3,.flac,.aiff,.aif,.m4a,.ogg,.mid,.midi,.sf2,.sfz,.nki,.vst3,.aupreset';
    const finish = (files: File[]) => {
      if (!files.length) {
        resolve({ items: [], summary: 'Importación cancelada.' });
        return;
      }
      void importSessionFiles(files).then(resolve);
    };
    input.addEventListener('cancel', () => finish([]));
    input.onchange = () => finish(input.files ? [...input.files] : []);
    input.click();
  });
}

export function isSessionImportablePath(path: string): boolean {
  return Boolean(classifyStemFile(path)) || isAudioPath(path);
}

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (ok: (file: File) => void, err?: (error: Error) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: FsEntry[]) => void) => void };
};

/** Files from a browser drop, including a dropped folder of stems. */
export async function filesFromDataTransfer(data: DataTransfer): Promise<File[]> {
  const items = [...data.items];
  const entries = items
    .map((item) => (item as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.())
    .filter((entry): entry is FsEntry => Boolean(entry));

  if (entries.length) {
    const walked: File[] = [];
    for (const entry of entries) await walkFsEntry(entry, walked);
    if (walked.length) return walked;
  }

  return [...data.files];
}

async function walkFsEntry(entry: FsEntry, out: File[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File | null>((resolve) => {
      entry.file?.(resolve, () => resolve(null));
    });
    if (file) out.push(file);
    return;
  }

  if (!entry.isDirectory || !entry.createReader) return;
  const reader = entry.createReader();
  const children: FsEntry[] = [];
  for (;;) {
    const batch = await new Promise<FsEntry[]>((resolve) => reader.readEntries(resolve));
    if (!batch.length) break;
    children.push(...batch);
  }
  for (const child of children) await walkFsEntry(child, out);
}
