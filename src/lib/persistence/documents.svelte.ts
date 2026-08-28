/**
 * Opening and saving `.dawproj` packages.
 *
 * The heavy lifting lives in Rust (see `src-tauri/src/project_fs.rs`); this file
 * owns the dialogs, the JSON round trip, the recent-projects list and autosave.
 * Everything degrades to a no-op with a readable message when the app runs in a
 * plain browser during development, where Tauri's APIs are absent.
 */

import { cachePeaks } from '$lib/audio/waveform';
import { decodeProjectFile, encodeProjectFile, ProjectFormatError } from '$lib/core/serialize';
import { engine, projectStore, transport } from '$lib/stores';
import { requestParentSessions, sessionGate } from './sessions.svelte';
import { loadSettings, patchSettings, settings, type RecentProject } from './settings.svelte';
import { importAudioIntoPackage, isTauri, readAudioFile, tauriInvoke } from './tauri';
import { hydrateDawSessionsFromCloud, loadFullSession, persistFullSession, restoreSessionAudio } from './daw-db';
import {
  buildSessionPackage,
  safeSessionName,
  SESSION_EXTENSION,
  type SessionFile
} from './session-package';
import { isZipBytes, unzipStore, zipStore } from './zip';

const MAX_RECENTS = 10;

/** Last message from an open/save attempt, surfaced by the status bar. */
export const documentStatus = $state({ message: '', tone: 'idle' as 'idle' | 'error' | 'success' });
export const saveDialog = $state({ open: false });

export const recentProjects = {
  get items(): RecentProject[] {
    return settings.recentProjects;
  }
};

function report(message: string, tone: 'idle' | 'error' | 'success' = 'idle'): void {
  documentStatus.message = message;
  documentStatus.tone = tone;
}

export async function refreshRecentProjects(): Promise<void> {
  await loadSettings();
}

async function rememberProject(path: string, name: string): Promise<void> {
  const entry: RecentProject = { path, name, openedAt: new Date().toISOString() };
  const rest = settings.recentProjects.filter((r) => r.path !== path);

  await patchSettings({
    recentProjects: [entry, ...rest].slice(0, MAX_RECENTS),
    lastDirectory: path.replace(/[\\/][^\\/]*$/, '')
  });
}

// --- audio ---

/**
 * Decodes every audio file referenced by the project so clips can play and draw
 * waveforms. Failures are per-file: one missing sample should not block opening.
 */
export async function loadPackageAudio(packagePath: string): Promise<void> {
  const files = projectStore.project.audioFiles;
  if (files.length === 0) return;

  const context = engine.backend.audioContext;
  if (!context) return;

  for (const file of files) {
    if (engine.backend.hasAudioBuffer(file.fileID)) continue;

    const separator = packagePath.includes('\\') ? '\\' : '/';
    const absolute = `${packagePath}${separator}${file.relativePath.replace(/\//g, separator)}`;

    try {
      const bytes = await readAudioFile(absolute);
      const buffer = await context.decodeAudioData(bytes.buffer.slice(0) as ArrayBuffer);
      engine.backend.registerAudioBuffer(file.fileID, buffer);
      cachePeaks(file.fileID, buffer);
    } catch (error) {
      report(`Could not load ${file.relativePath}: ${(error as Error).message}`, 'error');
    }
  }

  engine.rebuildSchedule();
}

// --- open ---

export async function applyOpenedProject(projectJson: string, packagePath = ''): Promise<boolean> {
  try {
    const envelope = decodeProjectFile(projectJson);
    projectStore.load(envelope.project, packagePath || null);
    transport.bpm = envelope.project.tempo.bpm;
    transport.timeSignature = { ...envelope.project.timeSignature };
    transport.syncBarOneFromSeconds(
      envelope.project.timelineOriginSeconds,
      envelope.project.tempo.bpm
    );
    transport.setPlayheadBeats(envelope.project.dawState.playheadPosition || 0);
    projectStore.pixelsPerBeat = Math.max(8, (envelope.project.dawState.zoomLevel || 1) * 40);
    if (packagePath) {
      await rememberProject(packagePath, envelope.project.name);
      if (!packagePath.startsWith('qamuz://')) await loadPackageAudio(packagePath);
    }
    sessionGate.close();
    report(`Opened ${envelope.project.name}`, 'success');
    return true;
  } catch (error) {
    const reason =
      error instanceof ProjectFormatError
        ? `That project file is not readable: ${error.message}`
        : (error as Error).message;
    report(reason, 'error');
    return false;
  }
}

export async function openProjectAtPath(path: string): Promise<boolean> {
  try {
    const pkg = await tauriInvoke<{ projectJson: string; packagePath: string }>(
      'read_project_package',
      { path }
    );
    return applyOpenedProject(pkg.projectJson, pkg.packagePath);
  } catch (error) {
    report((error as Error).message, 'error');
    return false;
  }
}

async function openProjectFromBrowserFiles(): Promise<boolean> {
  const picker = window as Window & {
    showDirectoryPicker?: () => Promise<DirHandle>;
  };
  if (typeof picker.showDirectoryPicker === 'function') {
    try {
      const dir = await picker.showDirectoryPicker();
      const files = await collectDirectoryFiles(dir);
      const projectBytes = findNamedFile(files, 'project.json');
      if (!projectBytes) {
        report('Esa carpeta no tiene project.json. Elige la carpeta de la sesión o un .qamuzsess.', 'error');
        return false;
      }
      const ok = await applyOpenedProject(new TextDecoder().decode(projectBytes));
      if (ok) await loadAudioFromMap(files);
      return ok;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return false;
      report((error as Error).message, 'error');
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `.json,.dawproj,.${SESSION_EXTENSION},application/json,application/zip`;
    const finish = (ok: boolean) => {
      input.remove();
      resolve(ok);
    };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        finish(false);
        return;
      }
      finish(await openBrowserFile(file));
    };
    input.addEventListener('cancel', () => finish(false));
    input.click();
  });
}

/** Search Maestro sessions, cloud/IndexedDB, recents, then disk. */
export async function openSessionFinder(): Promise<void> {
  sessionGate.open('open');
  await loadSettings();
  await requestParentSessions();
  await hydrateDawSessionsFromCloud();
}

/** Unified Open: desktop package, browser project.json, or the session list. */
export async function openProject(): Promise<void> {
  await loadSettings();
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Abrir sesión QAMUZ (.qamuzsess / .dawproj)',
      defaultPath: settings.lastDirectory
    });
    if (typeof selected === 'string') {
      await openProjectAtPath(selected);
      return;
    }
  } else {
    const opened = await openProjectFromBrowserFiles();
    if (opened) return;
  }
  sessionGate.open('open');
}

function fileMapKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function lookupInMap(files: Map<string, Uint8Array>, relativePath: string): Uint8Array | undefined {
  const key = fileMapKey(relativePath);
  const direct = files.get(key);
  if (direct) return direct;
  const suffix = `/${key}`;
  for (const [name, data] of files) {
    if (name.endsWith(suffix)) return data;
  }
  return undefined;
}

function findNamedFile(files: Map<string, Uint8Array>, fileName: string): Uint8Array | undefined {
  return lookupInMap(files, fileName);
}

async function loadAudioFromMap(files: Map<string, Uint8Array>): Promise<void> {
  const context = engine.backend.audioContext;
  if (!context) return;
  for (const file of projectStore.project.audioFiles) {
    if (engine.backend.hasAudioBuffer(file.fileID)) continue;
    const bytes = lookupInMap(files, file.relativePath);
    if (!bytes) continue;
    try {
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const buffer = await context.decodeAudioData(copy);
      engine.backend.registerAudioBuffer(file.fileID, buffer);
      cachePeaks(file.fileID, buffer);
    } catch {
      report(`No pude decodificar ${file.relativePath}`, 'error');
    }
  }
  engine.rebuildSchedule();
}

async function openSessionArchive(bytes: Uint8Array, label: string): Promise<boolean> {
  const entries = unzipStore(bytes);
  const files = new Map(entries.map((entry) => [fileMapKey(entry.name), entry.data]));
  const projectBytes = files.get('project.json');
  if (!projectBytes) {
    report('Esa sesión no tiene project.json', 'error');
    return false;
  }
  const json = new TextDecoder().decode(projectBytes);
  const ok = await applyOpenedProject(json, label);
  if (!ok) return false;
  await loadAudioFromMap(files);
  return true;
}

async function openBrowserFile(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isZipBytes(bytes)) return openSessionArchive(bytes, file.name);
  if (file.name.toLowerCase().endsWith(`.${SESSION_EXTENSION}`)) {
    report('Ese archivo maestro apunta a una carpeta. Elige el ZIP .qamuzsess o la carpeta de la sesión.', 'error');
    return false;
  }
  return applyOpenedProject(await file.text());
}

export async function restoreStoredSession(name: string): Promise<boolean> {
  const stored = await loadFullSession(name);
  if (!stored) return false;
  const ok = await applyOpenedProject(stored.projectJson, `qamuz://session/${name}`);
  if (!ok) return false;
  await restoreSessionAudio(stored.audio);
  projectStore.markSaved(`qamuz://session/${name}`);
  report(`Abrí “${name}” desde QAMUZ`, 'success');
  return true;
}

// --- save ---

/**
 * Copies any audio imported before the project had a package into it, so a
 * "Save As" on a fresh project produces a self-contained folder.
 */
async function syncPackageAudio(packagePath: string): Promise<string[]> {
  const problems: string[] = [];

  for (const file of projectStore.project.audioFiles) {
    const source = file.originalPath;
    const looksAbsolute = /^([a-zA-Z]:[\\/]|\/)/.test(source);
    if (!looksAbsolute) {
      problems.push(`${source} was dropped from the browser and cannot be copied`);
      continue;
    }

    try {
      const relative = await importAudioIntoPackage(packagePath, source, file.fileID);
      projectStore.setAudioFileRelativePath(file.fileID, relative);
    } catch {
      // Already inside the package, or the original has moved. Either way the
      // manifest entry stays as it is and playback keeps using the loaded buffer.
    }
  }

  return problems;
}

async function writePackage(path: string): Promise<boolean> {
  try {
    const normalized = path.toLowerCase().endsWith('.dawproj') ? path : `${path}.dawproj`;
    const problems = await syncPackageAudio(normalized);

    projectStore.captureUIState(transport.playheadBeats);
    const json = encodeProjectFile(projectStore.snapshot());

    const written = await tauriInvoke<string>('write_project_package', {
      path: normalized,
      projectJson: json
    });

    projectStore.markSaved(written);
    await rememberProject(written, projectStore.project.name);

    report(
      problems.length > 0
        ? `Saved, but ${problems.length} audio file${problems.length === 1 ? '' : 's'} were not copied in`
        : `Saved ${projectStore.project.name}`,
      problems.length > 0 ? 'error' : 'success'
    );
    return true;
  } catch (error) {
    report(`Save failed: ${(error as Error).message}`, 'error');
    return false;
  }
}

async function downloadSessionZip(): Promise<boolean> {
  try {
    projectStore.captureUIState(transport.playheadBeats);
    const pack = buildSessionPackage(projectStore.snapshot());
    const zip = zipStore(pack.files.map((file) => ({ name: file.path, data: file.data })));
    const name = `${safeSessionName(projectStore.project.name)}.${SESSION_EXTENSION}`;
    const blob = new Blob([zip], { type: 'application/octet-stream' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = name;
    link.click();
    URL.revokeObjectURL(href);
    report(
      pack.warnings.length
        ? `Descargué ${name}. ${pack.warnings.length} audio(s) no estaban en memoria.`
        : `Descargué ${name}. Ábrelo en QAMUZ, o importa Audio Files en Pro Tools / Logic.`,
      pack.warnings.length ? 'error' : 'success'
    );
    return true;
  } catch (error) {
    report(`No pude empaquetar la sesión: ${(error as Error).message}`, 'error');
    return false;
  }
}

type DirHandle = {
  kind?: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncIterable<DirHandle & { name: string; kind: string }>;
  entries?: () => AsyncIterable<[string, DirHandle]>;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<DirHandle>;
  getFileHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<{
    getFile?: () => Promise<File>;
    createWritable: () => Promise<{ write: (data: BufferSource) => Promise<void>; close: () => Promise<void> }>;
  }>;
};

async function collectDirectoryFiles(dir: DirHandle, prefix = ''): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  if (typeof dir.entries !== 'function') return files;
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'file' && typeof handle.getFile === 'function') {
      const file = await handle.getFile();
      files.set(fileMapKey(path), new Uint8Array(await file.arrayBuffer()));
      continue;
    }
    if (handle.kind === 'directory') {
      const nested = await collectDirectoryFiles(handle, path);
      nested.forEach((data, key) => files.set(key, data));
    }
  }
  return files;
}

async function writeNestedFile(root: DirHandle, path: string, data: Uint8Array): Promise<void> {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return;
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function writeSessionToPickedFolder(files: SessionFile[]): Promise<boolean> {
  const picker = window as Window & {
    showDirectoryPicker?: (options?: { mode?: string }) => Promise<DirHandle>;
  };
  if (typeof picker.showDirectoryPicker !== 'function') return false;
  try {
    const parent = await picker.showDirectoryPicker({ mode: 'readwrite' });
    const folder = await parent.getDirectoryHandle(safeSessionName(projectStore.project.name), {
      create: true
    });
    for (const file of files) await writeNestedFile(folder, file.path, file.data);
    return true;
  } catch (error) {
    if ((error as Error).name === 'AbortError') return false;
    throw error;
  }
}

async function writeSessionToTauriFolder(files: SessionFile[]): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const parent = await open({
    directory: true,
    multiple: false,
    title: 'Carpeta para la sesión QAMUZ (tipo Pro Tools)',
    defaultPath: settings.lastDirectory
  });
  if (typeof parent !== 'string') return null;
  const folder = `${parent.replace(/[\\/]$/, '')}${parent.includes('\\') ? '\\' : '/'}${safeSessionName(projectStore.project.name)}`;
  for (const file of files) {
    await tauriInvoke<string>('write_session_file', {
      folder,
      relativePath: file.path,
      bytes: Array.from(file.data)
    });
  }
  return folder;
}

export async function saveToSystem(): Promise<boolean> {
  try {
    const saved = await persistFullSession();
    projectStore.markSaved(`qamuz://session/${saved.name}`);
    await patchSettings({ lastSaveTarget: 'system' });
    report(
      `Guardé “${saved.name}” en QAMUZ (${saved.audioFiles} audio${saved.audioFiles === 1 ? '' : 's'} + captions de entrenamiento). Ábrela desde Abrir.`,
      'success'
    );
    return true;
  } catch (error) {
    report(`No pude guardar en QAMUZ: ${(error as Error).message}`, 'error');
    return false;
  }
}

export async function saveToComputer(): Promise<boolean> {
  const systemOk = await saveToSystem();
  projectStore.captureUIState(transport.playheadBeats);
  const pack = buildSessionPackage(projectStore.snapshot());

  if (isTauri()) {
    try {
      const folder = await writeSessionToTauriFolder(pack.files);
      if (folder) {
        projectStore.markSaved(folder);
        await rememberProject(folder, projectStore.project.name);
        await patchSettings({ lastSaveTarget: 'computer' });
        report(
          pack.warnings.length
            ? `Carpeta lista. ${pack.warnings.length} audio(s) faltaban en memoria.`
            : `Carpeta tipo Pro Tools lista (.${SESSION_EXTENSION} + Audio Files + MIDI Files).`,
          pack.warnings.length ? 'error' : 'success'
        );
        return true;
      }
    } catch (error) {
      report(`No pude escribir la carpeta: ${(error as Error).message}`, 'error');
    }
    const zipped = await downloadSessionZip();
    await patchSettings({ lastSaveTarget: 'computer' });
    return zipped && systemOk;
  }

  try {
    const folder = await writeSessionToPickedFolder(pack.files);
    if (folder) {
      await patchSettings({ lastSaveTarget: 'computer' });
      report(
        pack.warnings.length
          ? `Carpeta lista. ${pack.warnings.length} audio(s) faltaban en memoria.`
          : `Carpeta tipo Pro Tools lista (.${SESSION_EXTENSION} + Audio Files + MIDI Files).`,
        pack.warnings.length ? 'error' : 'success'
      );
      return true;
    }
  } catch (error) {
    report(`No pude escribir la carpeta: ${(error as Error).message}`, 'error');
  }

  const zipped = await downloadSessionZip();
  await patchSettings({ lastSaveTarget: 'computer' });
  return zipped && systemOk;
}

export function requestSave(): void {
  saveDialog.open = true;
}

export async function saveProject(): Promise<boolean> {
  requestSave();
  return true;
}

export async function saveProjectAs(): Promise<boolean> {
  saveDialog.open = true;
  return true;
}

export function newProject(options?: { force?: boolean }): void {
  if (!options?.force && projectStore.isDirty && !confirm('Discard unsaved changes?')) return;

  transport.stop();
  projectStore.newProject();
  transport.bpm = projectStore.project.tempo.bpm;
  transport.timeSignature = { ...projectStore.project.timeSignature };
  transport.syncBarOneFromSeconds(0, transport.bpm);
  transport.setPlayheadBeats(0);
  report('New project', 'idle');
}

// --- autosave ---

/** Saves in place every `intervalMs` while the project is dirty and has a path. */
export function startAutosave(intervalMs = 120_000): () => void {
  const timer = window.setInterval(() => {
    if (!projectStore.isDirty) return;
    if (transport.isRecording) return;
    void persistFullSession().then(() => {
      projectStore.markSaved(projectStore.packagePath || `qamuz://session/${projectStore.project.name}`);
    });
    if (isTauri() && projectStore.packagePath && !projectStore.packagePath.startsWith('qamuz://')) {
      void writePackage(projectStore.packagePath);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
