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

/** Last successful GenAudius mix URL, so the session registry can restore it. */
export let lastRenderAudioUrl: string | null = null;

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
      if (body.token) {
        headers.set('Authorization', `Bearer ${body.token}`);
        try {
          localStorage.setItem('trovamuz_token', body.token);
        } catch {
          // Browser storage can be blocked.
        }
      }
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
  let response: Response;
  try {
    response = await maestroFetch('/api/prompt/preview', {
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
  } catch {
    throw new AIServiceError(
      'GenAudius no está en línea (puerto 42003). Mezclar la sesión del DAW no necesita el modelo: escribe “mezclar”.'
    );
  }
  if (!response.ok) {
    if (response.status >= 500) {
      throw new AIServiceError(
        'GenAudius no respondió. Si querías mezclar, escribe “mezclar”: el mixer del DAW mueve faders aquí, sin el modelo.'
      );
    }
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
      const path = audioPath.startsWith('/') ? audioPath : `/${audioPath}`;
      lastRenderAudioUrl = path.startsWith('http') ? path : `${maestroBaseUrl()}${path}`;
      const audio = await maestroFetch(path);
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

function formatValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.summary === 'string') return record.summary;
    if (typeof record.text === 'string') return record.text;
    if (typeof record.label === 'string') return record.label;
    return Object.values(record).map((item) => formatValue(item)).filter(Boolean).join(' · ');
  }
  return '';
}

export function formatPlan(plan: MaestroPlan): string {
  const lines = [
    plan.title ? `Título: ${formatValue(plan.title)}` : null,
    plan.genre ? `Género: ${formatValue(plan.genre)}` : null,
    plan.style ? `Estilo: ${formatValue(plan.style)}` : null,
    plan.bpm ? `BPM: ${formatValue(plan.bpm)}` : null,
    plan.key ? `Tonalidad: ${formatValue(plan.key)}` : null,
    plan.structure ? `Estructura: ${formatValue(plan.structure)}` : null,
    plan.instruments ? `Instrumentos: ${formatValue(plan.instruments)}` : null,
    plan.musicBrief ? `\n${formatValue(plan.musicBrief)}` : null
  ].filter(Boolean);
  return lines.join('\n') || 'Plan listo.';
}
