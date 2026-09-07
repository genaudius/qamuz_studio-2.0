/**
 * Detect sessions already exported to the DAW so we don't duplicate stems/mixes.
 */

import { fingerprintsMatch } from '$lib/audio/audio-fingerprint';
import {
  findSessionByFingerprint,
  findSessionByMusicId,
  findSessionByTitle,
  loadSessions,
  type StudioSession,
  upsertSession
} from '$lib/persistence/sessions.svelte';
import { projectStore, workspace } from '$lib/stores';

export type DuplicateHit = {
  session: StudioSession;
  reason: 'musicId' | 'fingerprint' | 'title';
};

export function findExportedSong(opts: {
  musicId?: string | null;
  fingerprint?: string | null;
  title?: string | null;
  existing?: StudioSession[];
}): DuplicateHit | null {
  const existing = opts.existing ?? loadSessions();
  if (opts.musicId) {
    const byId = findSessionByMusicId(opts.musicId, existing);
    if (byId) return { session: byId, reason: 'musicId' };
  }
  if (opts.fingerprint) {
    const byFp = findSessionByFingerprint(opts.fingerprint, existing);
    if (byFp) return { session: byFp, reason: 'fingerprint' };
  }
  if (opts.title) {
    const byTitle = findSessionByTitle(opts.title, existing);
    if (byTitle?.musicId || byTitle?.audioFingerprint) {
      return { session: byTitle, reason: 'title' };
    }
  }
  return null;
}

function reasonLabel(reason: DuplicateHit['reason']): string {
  if (reason === 'musicId') return 'esta canción ya está exportada al DAW editor';
  if (reason === 'fingerprint') return 'este audio ya está en el historial del DAW (misma huella)';
  return 'ya hay una sesión con ese título en el historial del DAW';
}

/**
 * Ask whether to reopen the existing session instead of duplicating.
 */
export async function confirmReuseExportedSession(
  hit: DuplicateHit,
  actionLabel = 'extraer de nuevo'
): Promise<'reopened' | 'force' | 'cancel'> {
  const name = hit.session.title || hit.session.name;
  const openExisting = window.confirm(
    `“${name}” ${reasonLabel(hit.reason)}.\n\n` +
      `Aceptar = abrir la sesión existente (recomendado).\n` +
      `Cancelar = otras opciones.`
  );
  if (!openExisting) {
    const force = window.confirm(
      `¿${actionLabel.charAt(0).toUpperCase()}${actionLabel.slice(1)} creando una copia de “${name}”?`
    );
    return force ? 'force' : 'cancel';
  }

  const { restoreStoredSession, documentStatus } = await import('$lib/persistence/documents.svelte');
  const restored = await restoreStoredSession(hit.session.name);
  upsertSession(hit.session);
  workspace.open('arrange');
  projectStore.showAI = false;
  documentStatus.message = restored
    ? `Abrí “${name}” desde el historial (ya estaba en el DAW).`
    : `“${name}” ya estaba en el historial. Ábrela desde Sesiones si faltan stems.`;
  documentStatus.tone = 'success';
  return 'reopened';
}

/** Soft title-only warning when renaming (does not block unless user cancels). */
export function confirmRenameDespiteDuplicate(title: string, exceptName?: string): boolean {
  const existing = loadSessions().find((item) => {
    if (exceptName && item.name.toLocaleLowerCase('es') === exceptName.toLocaleLowerCase('es')) {
      return false;
    }
    const key = title.trim().toLocaleLowerCase('es');
    return (
      item.name.toLocaleLowerCase('es') === key ||
      (item.title || '').toLocaleLowerCase('es') === key
    );
  });
  if (!existing) return true;
  return window.confirm(
    `Ya existe una sesión llamada “${existing.title || existing.name}”.\n\n` +
      `¿Usar este título de todas formas? (puede confundir el historial)`
  );
}

export function matchFingerprintInHistory(
  fingerprint: string,
  existing = loadSessions()
): StudioSession | null {
  return (
    existing.find((item) => fingerprintsMatch(item.audioFingerprint, fingerprint)) ?? null
  );
}
