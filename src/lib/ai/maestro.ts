/**
 * Maestro: GenAudius planner + render. Talks to the local QAMUZ runtime
 * (42003) or a Modal `/v1` endpoint through the same helpers.
 */

import { AIServiceError } from './types';
import { patchSettings, settings } from '$lib/persistence/settings.svelte';

export interface MaestroPlan {
  genre?: string;
  style?: string;
  bpm?: number;
  key?: string;
  title?: string;
  structure?: string;
  instruments?: string[];
  musicBrief?: string;
  [key: string]: unknown;
}

export interface MaestroPreview {
  plan: MaestroPlan;
  masterPrompt?: string;
}

export interface MaestroGenerateRequest {
  songDescription: string;
  genre?: string;
  style?: string;
  title?: string;
  instrumental?: boolean;
  duration?: number;
  bpm?: number;
  vocalType?: 'male' | 'female' | 'duet';
}

const LOCAL_DEFAULT = '/genaudius-api';

export function maestroBaseUrl(): string {
  const stored = (settings.maestroBaseUrl ?? '').replace(/\/+$/, '');
  if (stored) return stored;
  return LOCAL_DEFAULT;
}

export async function saveMaestroBaseUrl(url: string): Promise<void> {
  await patchSettings({ maestroBaseUrl: url.trim().replace(/\/+$/, '') });
}

async function maestroFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = maestroBaseUrl();
  const headers = new Headers(init?.headers);
  try {
    const auth = await fetch(`${base}/api/auth/auto`);
    if (auth.ok) {
      const body = (await auth.json()) as { token?: string };
      if (body.token) headers.set('Authorization', `Bearer ${body.token}`);
    }
  } catch {
    // Modal and some local builds have no /api/auth/auto.
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${base}${path}`, { ...init, headers });
}

export async function maestroHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${maestroBaseUrl()}/health`, { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    try {
      const response = await fetch(`${maestroBaseUrl()}/v1/health`, { signal: AbortSignal.timeout(2500) });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export async function interpretIdea(request: MaestroGenerateRequest): Promise<MaestroPreview> {
  const response = await maestroFetch('/api/prompt/preview', {
    method: 'POST',
    body: JSON.stringify({
      songDescription: request.songDescription,
      genre: request.genre,
      style: request.style,
      title: request.title,
      instrumental: request.instrumental ?? false,
      duration: request.duration ?? 180,
      bpm: request.bpm,
      vocalType: request.vocalType ?? 'male'
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AIServiceError(
      `Maestro no pudo interpretar la idea (${response.status}). ${detail.slice(0, 180)}`
    );
  }
  return (await response.json()) as MaestroPreview;
}

export async function generateWithMaestro(request: MaestroGenerateRequest): Promise<ArrayBuffer> {
  const modal = maestroBaseUrl().includes('/v1') || Boolean(settings.modalGenerateUrl);
  if (modal && settings.modalGenerateUrl) {
    return generateOnModal(request);
  }

  const submitted = await maestroFetch('/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      songDescription: request.songDescription,
      genre: request.genre,
      style: request.style,
      title: request.title,
      instrumental: request.instrumental ?? false,
      duration: Math.max(10, Math.min(240, request.duration ?? 180)),
      bpm: request.bpm,
      vocalType: request.vocalType ?? 'male',
      audioFormat: 'wav'
    })
  });
  if (!submitted.ok) {
    const detail = await submitted.text().catch(() => '');
    throw new AIServiceError(`No se pudo iniciar el render (${submitted.status}). ${detail.slice(0, 180)}`);
  }
  const { jobId } = (await submitted.json()) as { jobId: string };
  return pollGeneration(jobId);
}

async function pollGeneration(jobId: string): Promise<ArrayBuffer> {
  const started = Date.now();
  while (Date.now() - started < 15 * 60_000) {
    const response = await maestroFetch(`/api/generate/status/${jobId}`);
    if (!response.ok) throw new AIServiceError('Se perdió el trabajo de generación');
    const job = (await response.json()) as {
      status: string;
      error?: string;
      result?: { audioUrls?: string[] };
    };
    if (job.status === 'failed') throw new AIServiceError(job.error || 'El render falló');
    if (job.status === 'success') {
      const audioPath = job.result?.audioUrls?.[0];
      if (!audioPath) throw new AIServiceError('El render no devolvió audio');
      const audio = await maestroFetch(audioPath.startsWith('/') ? audioPath : `/${audioPath}`);
      if (!audio.ok) throw new AIServiceError('No se pudo descargar el audio generado');
      return audio.arrayBuffer();
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new AIServiceError('El render tardó demasiado');
}

async function generateOnModal(request: MaestroGenerateRequest): Promise<ArrayBuffer> {
  const url = (settings.modalGenerateUrl ?? `${maestroBaseUrl()}/v1/generate`).replace(/\/+$/, '');
  const token = settings.modalApiToken ?? '';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      genre: request.genre ?? 'latin',
      style: request.style ?? 'tropical',
      text: request.songDescription,
      seconds: request.duration ?? 30
    })
  });
  if (!response.ok) {
    throw new AIServiceError(`Modal no pudo generar (${response.status})`);
  }
  const body = (await response.json()) as { audio_base64?: string };
  if (!body.audio_base64) throw new AIServiceError('Modal no devolvió audio');
  const binary = atob(body.audio_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function formatPlan(plan: MaestroPlan): string {
  const lines = [
    plan.title ? `Título: ${plan.title}` : null,
    plan.genre ? `Género: ${plan.genre}` : null,
    plan.style ? `Estilo: ${plan.style}` : null,
    plan.bpm ? `BPM: ${plan.bpm}` : null,
    plan.key ? `Tonalidad: ${plan.key}` : null,
    plan.structure ? `Estructura: ${plan.structure}` : null,
    Array.isArray(plan.instruments) && plan.instruments.length
      ? `Instrumentos: ${plan.instruments.join(', ')}`
      : null,
    plan.musicBrief ? `\n${plan.musicBrief}` : null
  ].filter(Boolean);
  return lines.join('\n') || 'Plan listo.';
}
