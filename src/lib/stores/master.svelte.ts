/**
 * QAMUZ MASTER PRO session: the source the plugin hears, plus song/history lists.
 */

import { bounceMix, applyMastering, DEFAULT_RECIPE, downloadWav, logSpectrum, measureLoudness, type LoudnessReport, type MasterRecipe, type MasterStyle } from '$lib/audio/mastering';
import { decodeAudioBytes, encodeWav } from '$lib/audio/import';
import { localGetJob, localListJobs, localPutJob, saasApi, type LocalMasterJob } from '$lib/saas-api';
import { engine, projectStore } from '$lib/stores';
import { newUUID } from '$lib/core/uuid';

export interface LibraryTrack {
  id: string;
  title: string;
  kind: 'music' | 'publication' | 'local' | 'arrange';
  durationMs?: number | null;
  createdAt?: string | Date;
  fetchPath?: string | null;
  audioUrl?: string | null;
}

export interface HistoryJob {
  id: string;
  title: string;
  sourceName: string;
  sourceKind: string;
  style: string;
  peakDb: number | null;
  lufs: number | null;
  durationSec: number | null;
  createdAt: string;
  downloadPath?: string;
  local: boolean;
}

export class MasterSession {
  recipe = $state<MasterRecipe>({ ...DEFAULT_RECIPE });
  sourceName = $state('Ningún audio');
  sourceKind = $state<'none' | 'upload' | 'library' | 'arrange'>('none');
  sourceMusicId = $state<string | null>(null);
  dry = $state<AudioBuffer | null>(null);
  wet = $state<AudioBuffer | null>(null);
  dryReport = $state<LoudnessReport | null>(null);
  wetReport = $state<LoudnessReport | null>(null);
  drySpec = $state<Float32Array | null>(null);
  wetSpec = $state<Float32Array | null>(null);
  busy = $state(false);
  error = $state<string | null>(null);
  library = $state<LibraryTrack[]>([]);
  history = $state<HistoryJob[]>([]);
  lastSavedId = $state<string | null>(null);

  readonly hasSource = $derived(this.dry !== null);

  async refreshLists(): Promise<void> {
    const local = await localListJobs();
    const localJobs: HistoryJob[] = local.map((job) => ({
      id: job.id,
      title: job.title,
      sourceName: job.sourceName,
      sourceKind: job.sourceKind,
      style: job.style,
      peakDb: job.peakDb,
      lufs: job.lufs,
      durationSec: job.durationSec,
      createdAt: job.createdAt,
      local: true
    }));

    const remote = await saasApi({ path: '/api/studio/master-jobs' });
    const remoteJobs: HistoryJob[] = Array.isArray((remote.json as { jobs?: HistoryJob[] })?.jobs)
      ? (remote.json as { jobs: HistoryJob[] }).jobs.map((job) => ({ ...job, local: false }))
      : [];

    const seen = new Set(remoteJobs.map((job) => job.id));
    this.history = [...remoteJobs, ...localJobs.filter((job) => !seen.has(job.id))];

    const lib = await saasApi({ path: '/api/studio/library' });
    const tracks = (lib.json as { tracks?: LibraryTrack[] })?.tracks;
    this.library = Array.isArray(tracks) ? tracks : [];
  }

  async loadBytes(bytes: ArrayBuffer, name: string, kind: MasterSession['sourceKind'], musicId?: string) {
    this.busy = true;
    this.error = null;
    try {
      const buffer = await decodeAudioBytes(bytes);
      this.dry = buffer;
      this.wet = null;
      this.sourceName = name;
      this.sourceKind = kind;
      this.sourceMusicId = musicId ?? null;
      this.dryReport = measureLoudness(buffer);
      this.drySpec = logSpectrum(buffer);
      this.wetReport = null;
      this.wetSpec = null;

      if (kind === 'upload' || kind === 'library') {
        const exists = this.library.some((item) => item.id === (musicId ?? '') || item.title === name);
        if (!exists) {
          this.library = [
            {
              id: musicId ?? newUUID(),
              title: name,
              kind: kind === 'library' ? 'music' : 'local',
              durationMs: Math.round(buffer.duration * 1000),
              createdAt: new Date().toISOString()
            },
            ...this.library
          ];
        }
      }
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
    }
  }

  async loadFile(file: File) {
    await this.loadBytes(await file.arrayBuffer(), file.name, 'upload');
  }

  async loadLibraryTrack(track: LibraryTrack) {
    this.busy = true;
    this.error = null;
    try {
      const path = track.fetchPath || track.audioUrl;
      if (!path) {
        if (this.sourceName === track.title && this.dry) return;
        throw new Error('Vuelve a importar ese archivo para recargarlo.');
      }
      const result = path.startsWith('http')
        ? { status: 200, bytes: await (await fetch(path)).arrayBuffer() }
        : await saasApi({ path });
      if (!result.bytes) throw new Error(result.error || 'No se pudo abrir el audio.');
      await this.loadBytes(result.bytes, track.title, 'library', track.id);
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
    }
  }

  async loadArrangeMix() {
    this.busy = true;
    this.error = null;
    try {
      const buffer = await bounceMix();
      this.dry = buffer;
      this.wet = null;
      this.sourceName = `${projectStore.project.name || 'Arrange'} · mix`;
      this.sourceKind = 'arrange';
      this.sourceMusicId = null;
      this.dryReport = measureLoudness(buffer);
      this.drySpec = logSpectrum(buffer);
      this.wetReport = null;
      this.wetSpec = null;
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
    }
  }

  reprocess() {
    if (!this.dry) return;
    this.wet = applyMastering(this.dry, this.recipe);
    this.wetReport = measureLoudness(this.wet);
    this.wetSpec = logSpectrum(this.wet);
  }

  async master() {
    if (!this.dry) {
      this.error = 'Importa un audio o el mix del arrange antes de masterizar.';
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      this.reprocess();
      await this.persistMaster();
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
    }
  }

  setStyle(style: MasterStyle) {
    this.recipe = { ...this.recipe, style };
    this.reprocess();
  }

  async persistMaster() {
    if (!this.wet) return;
    const wav = encodeWav(this.wet);
    const bytes = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
    const title = `${this.sourceName.replace(/\.[^.]+$/, '')} · MASTER PRO`;
    const local: LocalMasterJob = {
      id: newUUID(),
      title,
      sourceName: this.sourceName,
      sourceKind: this.sourceKind,
      style: this.recipe.style,
      peakDb: this.wetReport?.peakDb ?? null,
      lufs: this.wetReport?.lufs ?? null,
      durationSec: this.wetReport?.durationSec ?? null,
      fileSize: wav.byteLength,
      createdAt: new Date().toISOString(),
      wav: bytes
    };
    await localPutJob(local);
    this.lastSavedId = local.id;

    const remote = await saasApi({
      path: '/api/studio/master-jobs',
      method: 'POST',
      file: { bytes, name: `${title}.wav`, type: 'audio/wav' },
      fields: {
        title,
        sourceName: this.sourceName,
        sourceKind: this.sourceKind,
        sourceMusicId: this.sourceMusicId ?? '',
        style: this.recipe.style,
        recipe: JSON.stringify(this.recipe),
        peakDb: String(this.wetReport?.peakDb ?? ''),
        lufs: String(this.wetReport?.lufs ?? ''),
        durationSec: String(this.wetReport?.durationSec ?? '')
      }
    });
    const saved = (remote.json as { job?: HistoryJob })?.job;
    if (saved?.id) this.lastSavedId = saved.id;
    await this.refreshLists();
  }

  downloadCurrent() {
    if (!this.wet) return;
    downloadWav(encodeWav(this.wet), `${this.sourceName || 'QAMUZ'}-MASTER-PRO.wav`);
  }

  async downloadHistory(job: HistoryJob) {
    if (job.local) {
      const full = await localGetJob(job.id);
      if (!full?.wav) return;
      downloadWav(new Uint8Array(full.wav), `${job.title}.wav`);
      return;
    }
    const result = await saasApi({ path: job.downloadPath || `/api/studio/master-jobs/${job.id}` });
    if (result.bytes) {
      downloadWav(new Uint8Array(result.bytes), `${job.title}.wav`);
      return;
    }
    throw new Error(result.error || 'No se pudo descargar el master.');
  }

  async placeOnTimeline() {
    if (!this.wet) return;
    const { importAudioBytes } = await import('$lib/audio/import');
    let track = projectStore.project.tracks.find((t) => t.name === 'QAMUZ Master');
    if (!track) {
      track = projectStore.addTrack('audio');
      projectStore.renameTrack(track.id, 'QAMUZ Master');
    }
    const wav = encodeWav(this.wet);
    const bytes = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
    await importAudioBytes(bytes, track.id, 0, 'QAMUZ Master');
    engine.rebuildSchedule();
  }
}

export const masterSession = new MasterSession();
