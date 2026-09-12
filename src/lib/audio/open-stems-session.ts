/**
 * Load a Create Music song into a new DAW session: title becomes the session
 * name, the mix is split into instrument stems, one audio track each.
 * Does not mix or play — Maestro waits for the user.
 */

import { decodeAudioBytes, importDecodedBuffer } from '$lib/audio/import';
import { fingerprintAudioBuffer } from '$lib/audio/audio-fingerprint';
import { resolveSessionTempo } from '$lib/audio/detect-tempo';
import { songSessionTitle, splitMixBuffer, type StemLabelInput } from '$lib/audio/stem-split';
import { inferInstrument, roleTrackColor, uniqueTrackName } from '$lib/audio/stems';
import { maestroWallet } from '$lib/ai/maestro-wallet.svelte';
import { persistFullSession } from '$lib/persistence/daw-db';
import { documentStatus } from '$lib/persistence/documents.svelte';
import {
  confirmReuseExportedSession,
  findExportedSong
} from '$lib/persistence/session-duplicates';
import {
  appendWorkEvent,
  availableName,
  loadSessions,
  patchCurrentSession,
  sessionGate,
  upsertSession
} from '$lib/persistence/sessions.svelte';
import { saasApi } from '$lib/saas-api';
import { engine, projectStore, transport, workspace } from '$lib/stores';
import { workProgress } from '$lib/stores/work-progress.svelte';
import { wait } from '$lib/core/wait';

export interface StemSessionLaunch {
  musicId: string;
  session?: string;
  idea?: string;
  genre?: string;
  instrumental?: boolean;
  bpm?: number | null;
  imageUrl?: string;
  /** Skip duplicate dialog (user already chose "crear copia"). */
  forceNew?: boolean;
  /** Re-load stems into the same session name after a failed local restore. */
  recover?: boolean;
}

interface RemoteStem {
  index: number;
  name: string;
}

/** Studio 1.0: propose instrument name from stem label, keep unique track titles. */
function recognizeStem(raw: string, taken: string[]) {
  const stem = inferInstrument(raw);
  const trackName = uniqueTrackName(stem.name, taken);
  return { stem, trackName };
}

function bufferIsAudible(buffer: AudioBuffer): boolean {
  let peak = 0;
  let energy = 0;
  const channels = Math.min(buffer.numberOfChannels, 2);
  const length = buffer.length;
  for (let c = 0; c < channels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      const sample = Math.abs(data[i]);
      if (sample > peak) peak = sample;
      energy += sample * sample;
    }
  }
  const rms = Math.sqrt(energy / Math.max(1, length * channels));
  return peak > 0.01 && rms > 0.0015;
}

async function requestKieStems(musicId: string): Promise<{ jobId: string; stems: RemoteStem[] } | null> {
  const submitted = await saasApi({
    path: '/api/music-tools/stems',
    method: 'POST',
    json: { musicId, type: 'split_stem' }
  });
  if (submitted.status === 409) return null;
  const submitBody = submitted.json as { jobId?: string; error?: string } | undefined;
  if (submitted.status !== 202 || !submitBody?.jobId) {
    throw new Error(submitBody?.error || submitted.error || `Kie stems: HTTP ${submitted.status}`);
  }

  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await wait(6000);
    const checked = await saasApi({ path: `/api/music-tools/stems?jobId=${encodeURIComponent(submitBody.jobId)}` });
    const body = checked.json as { status?: string; error?: string; stems?: RemoteStem[] } | undefined;
    if (checked.status !== 200) throw new Error(body?.error || checked.error || `Kie stems: HTTP ${checked.status}`);
    if (body?.status === 'failed') throw new Error(body.error || 'Kie no pudo separar los stems');
    if (body?.status === 'completed' && body.stems?.length) {
      return { jobId: submitBody.jobId, stems: body.stems };
    }
  }
  throw new Error('La separación de stems superó 10 minutos');
}

async function fetchKieStem(jobId: string, stem: RemoteStem): Promise<AudioBuffer> {
  const response = await saasApi({
    path: `/api/music-tools/stems?jobId=${encodeURIComponent(jobId)}&stem=${stem.index}`
  });
  if (!response.bytes || response.status !== 200) {
    const body = response.json as { error?: string } | undefined;
    throw new Error(body?.error || response.error || `No pude descargar ${stem.name}`);
  }
  return decodeAudioBytes(response.bytes);
}

function setStatus(message: string, tone: 'idle' | 'error' | 'success' = 'idle') {
  documentStatus.message = message;
  documentStatus.tone = tone;
}

async function fetchMixBytes(musicId: string): Promise<ArrayBuffer> {
  const remote = await saasApi({ path: `/api/music/${musicId}`, method: 'GET' });
  if (remote.bytes && remote.bytes.byteLength > 64) return remote.bytes;

  if (remote.error || (remote.status && remote.status !== 200)) {
    const errorBody = remote.json as { message?: string; error?: string } | undefined;
    const msg = errorBody?.message || errorBody?.error || remote.error || `HTTP ${remote.status}`;
    throw new Error(`No pude leer la canción: ${msg}`);
  }

  const response = await fetch(`/api/music/${musicId}`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(remote.error || `No pude leer la canción (${remote.status || response.status})`);
  }
  return response.arrayBuffer();
}

async function resolveCoverUrl(launch: StemSessionLaunch): Promise<string | undefined> {
  if (launch.imageUrl?.trim()) return launch.imageUrl.trim();
  try {
    const info = await saasApi({ path: `/api/music/${launch.musicId}/info`, method: 'GET' });
    const body = info.json as { imageUrl?: string } | undefined;
    if (typeof body?.imageUrl === 'string' && body.imageUrl) return body.imageUrl;
  } catch {
    // Cover is optional for the badge.
  }
  return undefined;
}

/** Returns true when the caller should abort (reopened or cancelled). */
async function guardAgainstDuplicate(
  launch: StemSessionLaunch,
  title: string,
  fingerprint: string | undefined,
  actionLabel: string
): Promise<boolean> {
  if (launch.forceNew || launch.recover) return false;
  const hit = findExportedSong({
    musicId: launch.musicId,
    fingerprint,
    title
  });
  if (!hit) return false;
  const decision = await confirmReuseExportedSession(hit, actionLabel);
  if (decision === 'force') {
    launch.forceNew = true;
    return false;
  }
  workProgress.stop();
  return true;
}

function sessionTitleForLaunch(launch: StemSessionLaunch, preferred: string): string {
  if (launch.recover) return preferred;
  if (launch.forceNew) {
    return availableName(preferred, launch.idea || preferred, loadSessions());
  }
  return preferred;
}

async function saveSessionToHistory(): Promise<void> {
  const saved = await persistFullSession();
  setStatus(
    `Guardé “${saved.name}” en el historial (${saved.audioFiles} audio${saved.audioFiles === 1 ? '' : 's'}).`,
    'success'
  );
}

/** Load the Create Music mix onto one audio track. Maestro stays idle. */
export async function openMixSessionFromSong(launch: StemSessionLaunch): Promise<void> {
  const preferred = songSessionTitle({ title: launch.session, prompt: launch.idea });
  workProgress.start('Abriendo en Studio', ['Leyendo la mezcla', 'Colocando la pista'], `Abriendo “${preferred}”…`);
  setStatus(`Abriendo “${preferred}” en Studio…`);

  try {
    if (await guardAgainstDuplicate(launch, preferred, undefined, 'abrir de nuevo')) return;

    workProgress.advance(0, 'Traigo el audio de la canción…');
    const [bytes, cover] = await Promise.all([fetchMixBytes(launch.musicId), resolveCoverUrl(launch)]);
    const mix = await decodeAudioBytes(bytes);
    const fingerprint = fingerprintAudioBuffer(mix).hash;

    if (await guardAgainstDuplicate(launch, preferred, fingerprint, 'abrir de nuevo')) return;

    const title = sessionTitleForLaunch(launch, preferred);
    const bpm = resolveSessionTempo({
      hinted: launch.bpm,
      prompt: launch.idea,
      buffer: mix
    });
    transport.setTempo(bpm);
    projectStore.setTempo(bpm);

    for (const track of [...projectStore.project.tracks]) {
      projectStore.deleteTrack(track.id);
    }

    projectStore.rename(title);
    upsertSession({
      name: title,
      title,
      idea: launch.idea || title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stage: 'imported',
      audioUrl: `/api/music/${launch.musicId}`,
      tempo: bpm,
      musicId: launch.musicId,
      imageUrl: cover,
      audioFingerprint: fingerprint,
      duration: mix.duration
    });
    sessionGate.close();
    workspace.open('arrange');
    projectStore.showAI = false;

    workProgress.advance(1, 'Coloco la mezcla en el arrange…');
    const track = projectStore.addTrack('audio', title);
    const placed = await importDecodedBuffer(mix, track.id, 0, title);
    if (!placed.clipID) {
      projectStore.deleteTrack(track.id);
      throw new Error(placed.error ?? 'No pude colocar la mezcla en el arrange');
    }

    const { snapImportedSessionToBar } = await import('./conductor-snap');
    const snap = snapImportedSessionToBar({
      bpm,
      prompt: launch.idea,
      buffer: mix
    });
    try {
      await saveSessionToHistory();
    } catch (error) {
      setStatus(
        `Mezcla lista, pero no se guardó en el historial: ${(error as Error).message}`,
        'error'
      );
      workProgress.stop();
      return;
    }
    setStatus(
      snap
        ? `Sesión “${title}” · ${snap.bpm} BPM · ${snap.entryPosition} @ ${snap.entrySeconds.toFixed(3)} s`
        : `Sesión “${title}” · ${bpm} BPM`,
      'success'
    );
    workProgress.stop();
  } catch (error) {
    workProgress.fail((error as Error).message);
    throw error;
  }
}

function bufferFromStem(
  context: AudioContext,
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): AudioBuffer {
  const buffer = context.createBuffer(2, left.length, sampleRate);
  buffer.getChannelData(0).set(left);
  buffer.getChannelData(1).set(right);
  return buffer;
}

export async function openStemSessionFromSong(launch: StemSessionLaunch): Promise<void> {
  const preferred = songSessionTitle({ title: launch.session, prompt: launch.idea });
  sessionGate.close();
  workspace.open('arrange');
  projectStore.showAI = false;

  if (await guardAgainstDuplicate(launch, preferred, undefined, 'extraer stems de nuevo')) return;

  await maestroWallet.refresh();
  const canSpend = maestroWallet.canAfford('stems');

  workProgress.start(
    'Extrayendo stems',
    ['Leyendo la mezcla', 'Detectando el tempo', 'Separando stems', 'Colocando pistas en el arrange'],
    `Preparando “${preferred}”…`
  );
  setStatus(`Extrayendo stems de “${preferred}”…`);

  try {
    workProgress.advance(0, 'Traigo el audio de la canción…');
    const [bytes, cover] = await Promise.all([fetchMixBytes(launch.musicId), resolveCoverUrl(launch)]);
    await wait(280);

    const mix = await decodeAudioBytes(bytes);
    const fingerprint = fingerprintAudioBuffer(mix).hash;
    if (await guardAgainstDuplicate(launch, preferred, fingerprint, 'extraer stems de nuevo')) return;

    const title = sessionTitleForLaunch(launch, preferred);
    workProgress.advance(1, 'Mido el tempo de la mezcla para alinear la grilla…');
    const bpm = resolveSessionTempo({
      hinted: launch.bpm,
      prompt: launch.idea,
      buffer: mix
    });
    transport.setTempo(bpm);
    projectStore.setTempo(bpm);
    await wait(180);

    workProgress.advance(
      2,
      canSpend
        ? 'Solicito voz, coros, batería, bajo e instrumentos…'
        : 'Separación local (saldo insuficiente para Kie)…'
    );
    const labels: StemLabelInput = {
      prompt: launch.idea,
      genre: launch.genre,
      instrumental: launch.instrumental
    };

    let remote: { jobId: string; stems: RemoteStem[] } | null = null;
    if (canSpend) {
      try {
        remote = await requestKieStems(launch.musicId);
      } catch (kieError) {
        console.warn('Kie stems failed, using local split', kieError);
        remote = null;
      }
    }

    const localStems = remote?.stems.length ? [] : splitMixBuffer(mix, labels);
    if (!remote?.stems.length && !localStems.length) {
      throw new Error('No pude separar instrumentos de esta mezcla');
    }
    await wait(320);

    const context = engine.backend.audioContext;
    if (!context) throw new Error('El motor de audio aún no está listo');

    workProgress.advance(3, 'Armo una pista por instrumento con su audio real…');
    for (const track of [...projectStore.project.tracks]) {
      projectStore.deleteTrack(track.id);
    }

    projectStore.rename(title);
    upsertSession({
      name: title,
      title,
      idea: launch.idea || `Stems de ${title}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stage: 'imported',
      audioUrl: `/api/music/${launch.musicId}`,
      tempo: bpm,
      musicId: launch.musicId,
      imageUrl: cover,
      audioFingerprint: fingerprint,
      duration: mix.duration
    });
    sessionGate.close();
    workspace.open('arrange');
    projectStore.showAI = false;

    const imported: string[] = [];
    const takenNames: string[] = [];
    const stemEntries = remote?.stems.length
      ? remote.stems
      : localStems.map((stem, index) => ({ index, name: stem.name }));
    const usedRemote = Boolean(remote?.stems.length);

    for (const stem of stemEntries) {
      const recognized = recognizeStem(stem.name, takenNames);
      workProgress.setDetail(`Colocando ${recognized.trackName}…`);
      const track = projectStore.addTrack('audio', recognized.trackName);
      const localStem = usedRemote ? undefined : localStems[stem.index];
      projectStore.setTrackColor(
        track.id,
        localStem?.color || roleTrackColor(recognized.stem.role)
      );

      let buffer: AudioBuffer;
      try {
        if (usedRemote && remote) {
          buffer = await fetchKieStem(remote.jobId, stem);
        } else {
          if (!localStem) {
            projectStore.deleteTrack(track.id);
            continue;
          }
          buffer = bufferFromStem(context, localStem.left, localStem.right, mix.sampleRate);
        }
      } catch (downloadError) {
        console.warn(`Stem ${stem.name} download failed`, downloadError);
        projectStore.deleteTrack(track.id);
        continue;
      }

      if (!bufferIsAudible(buffer)) {
        projectStore.deleteTrack(track.id);
        continue;
      }

      const placed = await importDecodedBuffer(buffer, track.id, 0, recognized.trackName);
      if (placed.clipID) {
        imported.push(recognized.trackName);
        takenNames.push(recognized.trackName);
        const found = projectStore.findClip(placed.clipID);
        if (found && found.clip.name !== recognized.trackName) {
          projectStore.renameClip(placed.clipID, recognized.trackName);
        }
      } else {
        projectStore.deleteTrack(track.id);
      }
      await wait(120);
    }

    if (!imported.length) throw new Error('Los stems no se pudieron colocar en el arrange');

    engine.rebuildSchedule();

    const { snapImportedSessionToBar } = await import('./conductor-snap');
    const snap = snapImportedSessionToBar({
      bpm,
      prompt: launch.idea,
      buffer: mix
    });

    if (usedRemote && canSpend) {
      const gate = await maestroWallet.spend('stems');
      appendWorkEvent(
        'stems',
        `Extraí ${imported.join(', ')} de “${title}” a ${bpm} BPM.`,
        gate.ok && !gate.unlimited ? gate.cost : undefined
      );
    } else {
      appendWorkEvent('stems', `Separación local de “${title}”: ${imported.join(', ')} a ${bpm} BPM.`);
    }

    patchCurrentSession({ audioFingerprint: fingerprint, musicId: launch.musicId, imageUrl: cover });
    try {
      await saveSessionToHistory();
    } catch (error) {
      setStatus(
        `Stems listos en el editor, pero no se guardaron: ${(error as Error).message}`,
        'error'
      );
      workProgress.stop();
      window.dispatchEvent(
        new CustomEvent('qamuz:stems-imported', {
          detail: {
            folderName: title,
            summary: `Sesión “${title}”: stems en el arrange, pero falló el guardado del historial.`,
            autoMix: false,
            tempo: bpm
          }
        })
      );
      return;
    }
    window.dispatchEvent(
      new CustomEvent('qamuz:stems-imported', {
        detail: {
          folderName: title,
          summary: `Sesión “${title}”: importé ${imported.join(', ')} con audio real por instrumento, alineados desde 0:00 a ${bpm} BPM.`,
          autoMix: false,
          tempo: bpm
        }
      })
    );
    setStatus(
      snap
        ? `Sesión “${title}” · ${snap.bpm} BPM · ${snap.entryPosition} @ ${snap.entrySeconds.toFixed(3)} s · ${imported.join(', ')}`
        : `Sesión “${title}” · ${bpm} BPM · ${imported.join(', ')}`,
      'success'
    );
    workProgress.stop();
  } catch (error) {
    workProgress.fail((error as Error).message);
    throw error;
  }
}
