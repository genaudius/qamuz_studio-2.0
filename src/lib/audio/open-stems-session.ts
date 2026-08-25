/**
 * Load a Create Music song into a new DAW session: title becomes the session
 * name, the mix is split into instrument stems, one audio track each.
 * Does not mix or play — Maestro waits for the user.
 */

import { decodeAudioBytes, importDecodedBuffer } from '$lib/audio/import';
import { resolveSessionTempo } from '$lib/audio/detect-tempo';
import { songSessionTitle, splitMixBuffer, type StemLabelInput } from '$lib/audio/stem-split';
import { maestroWallet } from '$lib/ai/maestro-wallet.svelte';
import { persistDawSession } from '$lib/persistence/daw-db';
import { documentStatus } from '$lib/persistence/documents.svelte';
import { appendWorkEvent, sessionGate, upsertSession } from '$lib/persistence/sessions.svelte';
import { saasApi } from '$lib/saas-api';
import { engine, projectStore, transport, workspace } from '$lib/stores';
import { workProgress } from '$lib/stores/work-progress.svelte';
import { wait } from '$lib/core/wait';
import type { TrackColor } from '$lib/core/track';

export interface StemSessionLaunch {
  musicId: string;
  session?: string;
  idea?: string;
  genre?: string;
  instrumental?: boolean;
  bpm?: number | null;
}

function setStatus(message: string, tone: 'idle' | 'error' | 'success' = 'idle') {
  documentStatus.message = message;
  documentStatus.tone = tone;
}

async function fetchMixBytes(musicId: string): Promise<ArrayBuffer> {
  const remote = await saasApi({ path: `/api/music/${musicId}`, method: 'GET' });
  if (remote.bytes && remote.bytes.byteLength > 64) return remote.bytes;
  const response = await fetch(`/api/music/${musicId}`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(remote.error || `No pude leer la canción (${remote.status || response.status})`);
  }
  return response.arrayBuffer();
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
  const title = songSessionTitle({ title: launch.session, prompt: launch.idea });
  await maestroWallet.refresh();
  if (!maestroWallet.canAfford('stems')) {
    const cost = maestroWallet.costOf('stems');
    const message = `No hay saldo suficiente. Extraer stems cuesta ${cost} crédito${cost === 1 ? '' : 's'} y tienes ${maestroWallet.balance}.`;
    workProgress.start('Extraer stems', ['Saldo'], message);
    workProgress.fail(message);
    throw new Error(message);
  }

  workProgress.start('Extrayendo stems', [
    'Leyendo la mezcla',
    'Detectando el tempo',
    'Separando instrumentos',
    'Colocando pistas en el arrange'
  ], `Preparando “${title}”…`);
  setStatus(`Extrayendo stems de “${title}”…`);

  try {
    workProgress.advance(0, 'Traigo el audio de la canción…');
    const bytes = await fetchMixBytes(launch.musicId);
    await wait(280);

    const mix = await decodeAudioBytes(bytes);
    workProgress.advance(1, 'Mido el tempo de la mezcla para alinear la grilla…');
    const bpm = resolveSessionTempo({
      hinted: launch.bpm,
      prompt: launch.idea,
      buffer: mix
    });
    transport.setTempo(bpm);
    projectStore.setTempo(bpm);
    await wait(180);

    workProgress.advance(2, 'Separo voz, bajo, batería y el resto…');
    const labels: StemLabelInput = {
      prompt: launch.idea,
      genre: launch.genre,
      instrumental: launch.instrumental
    };
    const stems = splitMixBuffer(mix, labels);
    if (!stems.length) throw new Error('No pude separar instrumentos de esta mezcla');
    await wait(320);

    const context = engine.backend.audioContext;
    if (!context) throw new Error('El motor de audio aún no está listo');

    workProgress.advance(3, 'Armo una pista por instrumento…');
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
      tempo: bpm
    });
    sessionGate.close();
    workspace.open('arrange');
    projectStore.showAI = true;

    const imported: string[] = [];
    for (const stem of stems) {
      workProgress.setDetail(`Colocando ${stem.name}…`);
      const track = projectStore.addTrack('audio', stem.name);
      projectStore.setTrackColor(track.id, stem.color as TrackColor);
      const buffer = bufferFromStem(context, stem.left, stem.right, mix.sampleRate);
      const placed = await importDecodedBuffer(buffer, track.id, 0, stem.name);
      if (placed.clipID) imported.push(stem.name);
      else projectStore.deleteTrack(track.id);
      await wait(120);
    }

    if (!imported.length) throw new Error('Los stems no se pudieron colocar en el arrange');

    const gate = await maestroWallet.spend('stems');
    appendWorkEvent(
      'stems',
      `Extraí ${imported.join(', ')} de “${title}” a ${bpm} BPM.`,
      gate.ok && !gate.unlimited ? gate.cost : undefined
    );
    void persistDawSession();
    window.dispatchEvent(
      new CustomEvent('qamuz:stems-imported', {
        detail: {
          folderName: title,
          summary: `Sesión “${title}”: extraí ${imported.join(', ')} y dejé el proyecto a ${bpm} BPM. Las pistas están en el arrange sin mezclar ni reproducir. Dime cómo las quieres y lo hago.`,
          autoMix: false,
          tempo: bpm
        }
      })
    );
    setStatus(`Sesión “${title}” · ${bpm} BPM · ${imported.join(', ')}`, 'success');
    workProgress.stop();
  } catch (error) {
    workProgress.fail((error as Error).message);
    throw error;
  }
}
