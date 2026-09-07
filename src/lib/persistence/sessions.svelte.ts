/**
 * Maestro session registry. Same localStorage key as the old SaaS / 1.0 shell
 * so existing songs carry over into Studio 2.0.
 */

import { fingerprintsMatch } from '$lib/audio/audio-fingerprint';

export type StudioTrackSnapshot = {
  name: string;
  type: string;
  layout: string;
  channels: number;
  volume: number;
  pan: number;
  muted: boolean;
  clips: number;
  role: string;
};

export type WorkEvent = {
  id: string;
  at: string;
  kind: 'mix' | 'stems' | 'import' | 'plan' | 'render' | 'edit' | 'note';
  summary: string;
  credits?: number;
};

export type StudioSession = {
  name: string;
  idea: string;
  createdAt: string;
  updatedAt: string;
  stage?: string;
  audioUrl?: string;
  duration?: number;
  title?: string;
  mixNotes?: string;
  tracks?: StudioTrackSnapshot[];
  workLog?: WorkEvent[];
  tempo?: number;
  /** Linked Create Music track — badge + history identity. */
  musicId?: string;
  imageUrl?: string;
  /** Compact audio fingerprint to avoid re-importing the same mix. */
  audioFingerprint?: string;
};

export type GateView = 'home' | 'list' | 'idea' | 'name' | 'open' | 'songs';

const registryKey = 'qamuz.studio.sessions.v1';
const currentKey = 'qamuz.studio.current';

export class SessionGateStore {
  visible = $state(false);
  view = $state<GateView>('home');
  items = $state<StudioSession[]>([]);

  constructor() {
    this.items = loadSessions();
  }

  open(view?: GateView): void {
    this.items = loadSessions();
    this.view = view ?? (this.items.length ? 'home' : 'idea');
    this.visible = true;
  }

  close(): void {
    this.visible = false;
  }
}

export const sessionGate = new SessionGateStore();

export function loadSessions(): StudioSession[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(registryKey) || '[]') as StudioSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(next: StudioSession[]): void {
  sessionGate.items = next;
  localStorage.setItem(registryKey, JSON.stringify(next));
}

export function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('es').replace(/[\s_-]+/g, ' ');
}

export function makeBaseName(text: string): string {
  const words = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 4)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
  return `QAMUZ-${words.join('-') || 'Nueva-Cancion'}`;
}

export function availableName(requested: string, musicIdea: string, existing = loadSessions()): string {
  const base = requested.trim() || makeBaseName(musicIdea);
  if (!existing.some((item) => normalized(item.name) === normalized(base) || normalized(item.title || '') === normalized(base))) {
    return base;
  }
  const genre = /merengue/i.test(musicIdea)
    ? 'merengue'
    : /salsa/i.test(musicIdea)
      ? 'salsa'
      : /bachata/i.test(musicIdea)
        ? 'bachata'
        : 'new';
  let proposal = `${base}-${genre}`;
  let index = 2;
  while (
    existing.some(
      (item) =>
        normalized(item.name) === normalized(proposal) ||
        normalized(item.title || '') === normalized(proposal)
    )
  ) {
    proposal = `${base}-${genre}-${index++}`;
  }
  return proposal;
}

/** True when another session already uses this title/name (excluding one id/name). */
export function isDuplicateSessionTitle(
  title: string,
  exceptName?: string,
  existing = loadSessions()
): boolean {
  const key = normalized(title);
  if (!key) return false;
  return existing.some((item) => {
    if (exceptName && normalized(item.name) === normalized(exceptName)) return false;
    return normalized(item.name) === key || normalized(item.title || '') === key;
  });
}

export function findSessionByMusicId(musicId: string, existing = loadSessions()): StudioSession | null {
  if (!musicId) return null;
  return existing.find((item) => item.musicId === musicId) ?? null;
}

export function findSessionByFingerprint(
  fingerprint: string,
  existing = loadSessions()
): StudioSession | null {
  if (!fingerprint) return null;
  return (
    existing.find((item) => fingerprintsMatch(item.audioFingerprint, fingerprint)) ?? null
  );
}

export function findSessionByTitle(title: string, existing = loadSessions()): StudioSession | null {
  const key = normalized(title);
  if (!key) return null;
  return (
    existing.find(
      (item) => normalized(item.name) === key || normalized(item.title || '') === key
    ) ?? null
  );
}

export class CurrentSessionStore {
  record = $state<StudioSession | null>(readCurrentSession());
}

export const currentStudioSession = new CurrentSessionStore();

function readCurrentSession(): StudioSession | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(currentKey) || 'null') as StudioSession | null;
    return parsed && parsed.name ? parsed : null;
  } catch {
    return null;
  }
}

export function setCurrentSession(record: StudioSession | null): void {
  currentStudioSession.record = record;
  if (record) sessionStorage.setItem(currentKey, JSON.stringify(record));
  else sessionStorage.removeItem(currentKey);
}

export function upsertSession(record: StudioSession): StudioSession {
  const now = new Date().toISOString();
  const saved = { ...record, updatedAt: now };
  const next = [saved, ...loadSessions().filter((item) => normalized(item.name) !== normalized(saved.name))];
  saveSessions(next);
  setCurrentSession(saved);
  syncSessionsToParent(next);
  return saved;
}

export function patchCurrentSession(changes: Partial<StudioSession>): StudioSession | null {
  const current = currentStudioSession.record;
  if (!current) return null;
  return upsertSession({ ...current, ...changes });
}

export function renameCurrentSession(name: string): StudioSession | null {
  const trimmed = name.trim();
  if (!trimmed) return currentStudioSession.record;
  const current = currentStudioSession.record;
  const now = new Date().toISOString();
  if (!current) {
    return upsertSession({
      name: trimmed,
      title: trimmed,
      idea: 'Sesión importada',
      createdAt: now,
      updatedAt: now,
      stage: 'imported'
    });
  }
  // Keep a unique registry key when the display title collides; store the user's title.
  const registryName = isDuplicateSessionTitle(trimmed, current.name)
    ? availableName(trimmed, current.idea || trimmed)
    : trimmed;
  const saved: StudioSession = {
    ...current,
    name: registryName,
    title: trimmed,
    updatedAt: now
  };
  const next = [
    saved,
    ...loadSessions().filter(
      (item) =>
        normalized(item.name) !== normalized(current.name) &&
        normalized(item.name) !== normalized(registryName)
    )
  ];
  saveSessions(next);
  setCurrentSession(saved);
  syncSessionsToParent(next);
  return saved;
}

export function mergeIncomingSessions(incoming: StudioSession[]): StudioSession[] {
  if (!Array.isArray(incoming) || incoming.length === 0) return loadSessions();
  const byName = new Map<string, StudioSession>();
  for (const item of [...loadSessions(), ...incoming]) {
    if (!item?.name) continue;
    const key = normalized(item.name);
    const prev = byName.get(key);
    if (!prev || String(item.updatedAt || '') > String(prev.updatedAt || '')) {
      byName.set(key, item);
    }
  }
  const next = [...byName.values()].sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );
  saveSessions(next);
  return next;
}

function syncSessionsToParent(sessions: StudioSession[]): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ type: 'qamuz-studio:sessions-write', sessions }, '*');
}

export function requestParentSessions(): Promise<StudioSession[]> {
  if (typeof window === 'undefined' || window.parent === window) {
    return Promise.resolve(loadSessions());
  }
  return new Promise((resolve) => {
    const finish = (items: StudioSession[]) => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(items);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'qamuz-studio:sessions' || !Array.isArray(event.data.sessions)) return;
      finish(mergeIncomingSessions(event.data.sessions as StudioSession[]));
    };
    const timer = window.setTimeout(() => finish(loadSessions()), 400);
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'qamuz-studio:ready' }, '*');
  });
}

export type MaestroSeed = {
  idea: string;
  autoPlan: boolean;
  isNew: boolean;
  sessionName: string;
  audioUrl?: string;
};

export function seedMaestro(seed: MaestroSeed): void {
  sessionStorage.setItem('qamuz.maestro.launch', JSON.stringify(seed));
  if (seed.idea.trim()) {
    sessionStorage.setItem('qamuz.maestro.seed', seed.idea.trim());
    sessionStorage.setItem('qamuz.maestro.autoPlan', seed.autoPlan ? '1' : '0');
  }
  window.dispatchEvent(new CustomEvent('qamuz:maestro-seed', { detail: seed }));
}

export function maestroHistoryKey(sessionName: string): string {
  return `qamuz.maestro.session.v2.${sessionName}`;
}

export function appendWorkEvent(
  kind: WorkEvent['kind'],
  summary: string,
  credits?: number
): WorkEvent | null {
  const event: WorkEvent = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind,
    summary,
    credits
  };
  const current = currentStudioSession.record;
  if (!current) return event;
  const workLog = [...(current.workLog ?? []), event].slice(-80);
  patchCurrentSession({ workLog });
  return event;
}

/** Makes sure Guardar always has a session key in the local store. */
export function ensureStudioSession(name?: string): StudioSession {
  const current = currentStudioSession.record;
  if (current?.name) return current;
  const now = new Date().toISOString();
  return upsertSession({
    name: name?.trim() || 'Untitled Project',
    idea: '',
    createdAt: now,
    updatedAt: now,
    stage: 'edit'
  });
}
