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
import { loadSettings, patchSettings, settings, type RecentProject } from './settings.svelte';
import { importAudioIntoPackage, isTauri, readAudioFile, tauriInvoke } from './tauri';

const MAX_RECENTS = 10;

/** Last message from an open/save attempt, surfaced by the status bar. */
export const documentStatus = $state({ message: '', tone: 'idle' as 'idle' | 'error' | 'success' });

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

export async function openProjectAtPath(path: string): Promise<boolean> {
  try {
    const pkg = await tauriInvoke<{ projectJson: string; packagePath: string }>(
      'read_project_package',
      { path }
    );

    const envelope = decodeProjectFile(pkg.projectJson);

    projectStore.load(envelope.project, pkg.packagePath);
    transport.bpm = envelope.project.tempo.bpm;
    transport.timeSignature = { ...envelope.project.timeSignature };
    transport.setPlayheadBeats(envelope.project.dawState.playheadPosition || 0);
    projectStore.pixelsPerBeat = Math.max(8, (envelope.project.dawState.zoomLevel || 1) * 40);

    await rememberProject(pkg.packagePath, envelope.project.name);
    await loadPackageAudio(pkg.packagePath);

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

export async function openProject(): Promise<void> {
  if (!isTauri()) {
    report('Opening files needs the desktop app', 'error');
    return;
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  await loadSettings();

  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Open Qamuz project',
    defaultPath: settings.lastDirectory
  });

  if (typeof selected !== 'string') return;
  await openProjectAtPath(selected);
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

export async function saveProject(): Promise<boolean> {
  if (!isTauri()) {
    report('Saving needs the desktop app', 'error');
    return false;
  }

  const existing = projectStore.packagePath;
  if (existing) return writePackage(existing);
  return saveProjectAs();
}

export async function saveProjectAs(): Promise<boolean> {
  if (!isTauri()) {
    report('Saving needs the desktop app', 'error');
    return false;
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  await loadSettings();

  const target = await save({
    title: 'Save Qamuz project',
    defaultPath: settings.lastDirectory
      ? `${settings.lastDirectory}/${projectStore.project.name}.dawproj`
      : `${projectStore.project.name}.dawproj`,
    filters: [{ name: 'Qamuz project', extensions: ['dawproj'] }]
  });

  if (!target) return false;
  return writePackage(target);
}

export function newProject(): void {
  if (projectStore.isDirty && !confirm('Discard unsaved changes?')) return;

  transport.stop();
  projectStore.newProject();
  transport.bpm = projectStore.project.tempo.bpm;
  transport.timeSignature = { ...projectStore.project.timeSignature };
  transport.setPlayheadBeats(0);
  report('New project', 'idle');
}

// --- autosave ---

/** Saves in place every `intervalMs` while the project is dirty and has a path. */
export function startAutosave(intervalMs = 120_000): () => void {
  const timer = window.setInterval(() => {
    if (!projectStore.isDirty || !projectStore.packagePath) return;
    if (transport.isRecording) return;
    void writePackage(projectStore.packagePath);
  }, intervalMs);

  return () => clearInterval(timer);
}
