/**
 * Cloud/local persistence for DAW session metadata (tracks, mix, idea).
 * Audio stays in the project / browser buffers; Postgres stores what Maestro
 * needs to remember the session across the SaaS account.
 */

import { saasApi } from '$lib/saas-api';
import { encodeWav } from '$lib/audio/import';
import { cachePeaks } from '$lib/audio/waveform';
import { encodeProjectFile } from '$lib/core/serialize';
import { sessionTrainingManifest } from './session-package';
import { engine, projectStore, transport } from '$lib/stores';
import {
  currentStudioSession,
  ensureStudioSession,
  mergeIncomingSessions,
  type StudioSession,
  type StudioTrackSnapshot
} from './sessions.svelte';
import { inferInstrument, trackChannelCount, trackLayoutLabel } from '$lib/audio/stems';

export interface DawSessionRecord {
  id?: string;
  name: string;
  idea?: string;
  stage?: string;
  title?: string;
  audioUrl?: string;
  mixNotes?: string;
  musicId?: string;
  imageUrl?: string;
  audioFingerprint?: string;
  snapshot: {
    tempo: number;
    tracks: Array<{
      name: string;
      type: string;
      layout: string;
      channels: number;
      volume: number;
      pan: number;
      muted: boolean;
      clips: number;
      role: string;
    }>;
    workLog?: StudioSession['workLog'];
    musicId?: string;
    imageUrl?: string;
    audioFingerprint?: string;
  };
  updatedAt: string;
}

const IDB_NAME = 'qamuz-daw';
const IDB_STORE = 'sessions';
const PROJECT_STORE = 'projects';
const AUDIO_STORE = 'audio';
const IDB_VERSION = 2;

function snapshotFromProject(): DawSessionRecord['snapshot'] {
  const current = currentStudioSession.record;
  return {
    tempo: transport.bpm,
    tracks: projectStore.project.tracks.map((track) => {
      const stem = inferInstrument(track.name);
      return {
        name: track.name,
        type: track.type,
        layout: trackLayoutLabel(track),
        channels: trackChannelCount(track),
        volume: track.volume,
        pan: track.pan,
        muted: track.isMuted,
        clips: track.clips.length,
        role: stem.role
      };
    }),
    workLog: current?.workLog,
    musicId: current?.musicId,
    imageUrl: current?.imageUrl,
    audioFingerprint: current?.audioFingerprint
  };
}

function recordFromCurrent(): DawSessionRecord | null {
  const current = ensureStudioSession(projectStore.project.name);
  return {
    name: current.name,
    idea: current.idea,
    stage: current.stage,
    title: current.title,
    audioUrl: current.audioUrl,
    mixNotes: current.mixNotes,
    musicId: current.musicId,
    imageUrl: current.imageUrl,
    audioFingerprint: current.audioFingerprint,
    snapshot: snapshotFromProject(),
    updatedAt: new Date().toISOString()
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE);
      if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putLocal(record: DawSessionRecord): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(record, record.name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function persistDawSession(session?: StudioSession | null): Promise<void> {
  const record = recordFromCurrent();
  if (!record) return;
  if (session) {
    record.idea = session.idea ?? record.idea;
    record.stage = session.stage ?? record.stage;
    record.title = session.title ?? record.title;
    record.audioUrl = session.audioUrl ?? record.audioUrl;
    record.mixNotes = session.mixNotes ?? record.mixNotes;
    record.musicId = session.musicId ?? record.musicId;
    record.imageUrl = session.imageUrl ?? record.imageUrl;
    record.audioFingerprint = session.audioFingerprint ?? record.audioFingerprint;
    if (record.snapshot) {
      record.snapshot.musicId = record.musicId;
      record.snapshot.imageUrl = record.imageUrl;
      record.snapshot.audioFingerprint = record.audioFingerprint;
    }
  }

  await putLocal(record);

  const remote = await saasApi({
    path: '/api/studio/daw-sessions',
    method: 'POST',
    json: record
  });
  if (remote.status && remote.status >= 400) {
    console.warn('daw-session cloud save', remote.error ?? remote.status);
  }
}

async function listLocalSessions(): Promise<DawSessionRecord[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const request = tx.objectStore(IDB_STORE).getAll();
      request.onsuccess = () => {
        const rows = (request.result as DawSessionRecord[]) ?? [];
        resolve(rows);
      };
      request.onerror = () => reject(tx.error);
    });
  } catch {
    return [];
  }
}

function mergeSessionRows(rows: DawSessionRecord[]): DawSessionRecord[] {
  const byName = new Map<string, DawSessionRecord>();
  for (const row of rows) {
    if (!row?.name) continue;
    const prev = byName.get(row.name);
    if (!prev || String(row.updatedAt || '') > String(prev.updatedAt || '')) {
      byName.set(row.name, row);
    }
  }
  return [...byName.values()].sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );
}

export async function listDawSessions(): Promise<DawSessionRecord[]> {
  const local = await listLocalSessions();
  let remote: DawSessionRecord[] = [];
  const result = await saasApi({ path: '/api/studio/daw-sessions', method: 'GET' });
  if (result.status === 200 && result.json && typeof result.json === 'object') {
    const rows = (result.json as { sessions?: DawSessionRecord[] }).sessions;
    if (Array.isArray(rows)) remote = rows;
  }
  return mergeSessionRows([...local, ...remote]);
}

export async function hydrateDawSessionsFromCloud(): Promise<void> {
  const rows = await listDawSessions();
  if (!rows.length) return;
  const incoming: StudioSession[] = rows.map((row) => {
    const tracks = row.snapshot?.tracks as StudioTrackSnapshot[] | undefined;
    const workLog = row.snapshot?.workLog as StudioSession['workLog'] | undefined;
    const snapMusicId =
      typeof row.snapshot?.musicId === 'string' ? row.snapshot.musicId : row.musicId;
    const snapImage =
      typeof row.snapshot?.imageUrl === 'string' ? row.snapshot.imageUrl : row.imageUrl;
    const snapFp =
      typeof row.snapshot?.audioFingerprint === 'string'
        ? row.snapshot.audioFingerprint
        : row.audioFingerprint;
    return {
      name: row.name,
      idea: row.idea ?? '',
      createdAt: row.updatedAt,
      updatedAt: row.updatedAt,
      stage: row.stage,
      title: row.title,
      audioUrl: row.audioUrl,
      mixNotes: row.mixNotes,
      tracks: Array.isArray(tracks) ? tracks : undefined,
      workLog: Array.isArray(workLog) ? workLog : undefined,
      tempo: typeof row.snapshot?.tempo === 'number' ? row.snapshot.tempo : undefined,
      musicId: snapMusicId,
      imageUrl: snapImage,
      audioFingerprint: snapFp
    };
  });
  mergeIncomingSessions(incoming);
}

function audioKey(sessionName: string, fileID: string): string {
  return `${sessionName}::${fileID}`;
}

export async function persistFullSession(): Promise<{ name: string; audioFiles: number }> {
  const session = ensureStudioSession(projectStore.project.name);
  await persistDawSession(session);

  projectStore.captureUIState(transport.playheadBeats);
  const projectJson = encodeProjectFile(projectStore.snapshot());
  const trainingJson = sessionTrainingManifest(projectStore.project);
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PROJECT_STORE, AUDIO_STORE], 'readwrite');
    tx.objectStore(PROJECT_STORE).put(
      { name: session.name, projectJson, trainingJson, updatedAt: new Date().toISOString() },
      session.name
    );
    for (const file of projectStore.project.audioFiles) {
      const buffer = engine.backend.audioBuffer(file.fileID);
      if (!buffer) continue;
      tx.objectStore(AUDIO_STORE).put(encodeWav(buffer), audioKey(session.name, file.fileID));
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return {
    name: session.name,
    audioFiles: projectStore.project.audioFiles.filter((file) => engine.backend.hasAudioBuffer(file.fileID))
      .length
  };
}

export async function loadFullSession(name: string): Promise<{
  projectJson: string;
  audio: Array<{ fileID: string; bytes: ArrayBuffer }>;
} | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  const row = await new Promise<{ projectJson: string } | undefined>((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readonly');
    const request = tx.objectStore(PROJECT_STORE).get(name);
    request.onsuccess = () => resolve(request.result as { projectJson: string } | undefined);
    request.onerror = () => reject(request.error);
  });
  if (!row?.projectJson) return null;

  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readonly');
    const request = tx.objectStore(AUDIO_STORE).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const prefix = `${name}::`;
  const audio: Array<{ fileID: string; bytes: ArrayBuffer }> = [];
  for (const key of keys) {
    const label = String(key);
    if (!label.startsWith(prefix)) continue;
    const bytes = await new Promise<ArrayBuffer | Uint8Array | undefined>((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const request = tx.objectStore(AUDIO_STORE).get(key);
      request.onsuccess = () => resolve(request.result as ArrayBuffer | Uint8Array | undefined);
      request.onerror = () => reject(request.error);
    });
    if (!bytes) continue;
    const buffer = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
    audio.push({ fileID: label.slice(prefix.length), bytes: buffer });
  }

  return { projectJson: row.projectJson, audio };
}

export async function restoreSessionAudio(
  audio: Array<{ fileID: string; bytes: ArrayBuffer }>
): Promise<void> {
  const context = engine.backend.audioContext;
  if (!context) return;
  for (const item of audio) {
    if (engine.backend.hasAudioBuffer(item.fileID)) continue;
    try {
      const buffer = await context.decodeAudioData(item.bytes.slice(0));
      engine.backend.registerAudioBuffer(item.fileID, buffer);
      cachePeaks(item.fileID, buffer);
    } catch {
      // One missing stem should not block the rest of the session.
    }
  }
  engine.rebuildSchedule();
}
