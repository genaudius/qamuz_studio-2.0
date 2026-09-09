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
import { studioNotice } from '$lib/ui/studio-notice.svelte';

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
  const openExisting = await studioNotice.confirm({
    title: `“${name}” ya está en el DAW`,
    description: `${reasonLabel(hit.reason)}. ¿Abrir la sesión existente?`,
    tone: 'warning',
    confirmLabel: 'Abrir existente',
    cancelLabel: 'Otras opciones'
  });
  if (!openExisting) {
    const force = await studioNotice.confirm({
      title: '¿Crear una copia?',
      description: `Puedes ${actionLabel} creando una copia de “${name}”.`,
      tone: 'info',
      confirmLabel: 'Crear copia',
      cancelLabel: 'Cancelar'
    });
    return force ? 'force' : 'cancel';
  }

  const { restoreStoredSession, documentStatus } = await import('$lib/persistence/documents.svelte');
  const restored = await restoreStoredSession(hit.session.name);
  if (restored) {
    upsertSession(hit.session);
    workspace.open('arrange');
    projectStore.showAI = false;
    documentStatus.message = `Abrí “${name}” desde el historial (ya estaba en el DAW).`;
    documentStatus.tone = 'success';
    return 'reopened';
  }

  if (hit.session.musicId) {
    const recover = await studioNotice.confirm({
      title: 'No encontré los stems guardados',
      description: `“${name}” está en el historial pero sin audio. ¿Volver a cargarlos desde la biblioteca?`,
      tone: 'warning',
      confirmLabel: 'Recargar stems',
      cancelLabel: 'Cancelar'
    });
    if (recover) {
      const { openStemSessionFromSong } = await import('$lib/audio/open-stems-session');
      await openStemSessionFromSong({
        musicId: hit.session.musicId,
        session: hit.session.title || hit.session.name,
        idea: hit.session.idea,
        bpm: hit.session.tempo,
        imageUrl: hit.session.imageUrl,
        recover: true
      });
      return 'reopened';
    }
  }

  documentStatus.message = `No pude abrir los stems de “${name}”. Prueba extraer de nuevo.`;
  documentStatus.tone = 'error';
  return 'cancel';
}

/** Soft title-only warning when renaming (does not block unless user cancels). */
export async function confirmRenameDespiteDuplicate(
  title: string,
  exceptName?: string
): Promise<boolean> {
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
  return studioNotice.confirm({
    title: 'Título duplicado',
    description: `Ya existe una sesión llamada “${existing.title || existing.name}”. ¿Usar este título de todas formas?`,
    tone: 'warning',
    confirmLabel: 'Usar de todas formas',
    cancelLabel: 'Cancelar'
  });
}

export function matchFingerprintInHistory(
  fingerprint: string,
  existing = loadSessions()
): StudioSession | null {
  return (
    existing.find((item) => fingerprintsMatch(item.audioFingerprint, fingerprint)) ?? null
  );
}
