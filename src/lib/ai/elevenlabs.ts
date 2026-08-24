/**
 * ElevenLabs (and MiniMax) audio generation through the existing
 * `elevenlabs-proxy` edge function. Port of DAWCore/AI/ElevenLabsService.swift.
 */

import {
  elevenLabsProxyURL,
  isElevenLabsConfigured,
  isSupabaseConfigured,
  minimaxProxyURL,
  readAIConfig
} from './config';
import { AIServiceError, type AIAudioModel } from './types';

export interface ElevenLabsCredits {
  remainingCharacters: number;
  characterLimit: number;
}

export function creditsLabel(info: ElevenLabsCredits): string {
  const n = info.remainingCharacters;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

async function elevenLabsFetch(
  endpoint: 'sound-generation' | 'music' | 'subscription',
  init?: RequestInit
): Promise<Response> {
  if (!isElevenLabsConfigured()) {
    throw new AIServiceError(
      'ElevenLabs is not configured. Add a Supabase URL in the AI panel, or a local API key.'
    );
  }

  const { supabaseAnonKey, elevenLabsKey } = readAIConfig();
  const proxy = elevenLabsProxyURL(endpoint);

  const headers = new Headers(init?.headers);
  if (isSupabaseConfigured() && proxy) {
    headers.set('Authorization', `Bearer ${supabaseAnonKey}`);
    if (!headers.has('Content-Type') && init?.body) headers.set('Content-Type', 'application/json');
    return fetch(proxy, { ...init, headers });
  }

  const direct =
    endpoint === 'subscription'
      ? 'https://api.elevenlabs.io/v1/user/subscription'
      : endpoint === 'music'
        ? 'https://api.elevenlabs.io/v1/music'
        : 'https://api.elevenlabs.io/v1/sound-generation';

  headers.set('xi-api-key', elevenLabsKey);
  if (!headers.has('Content-Type') && init?.body) headers.set('Content-Type', 'application/json');
  return fetch(direct, { ...init, headers });
}

export async function getElevenLabsCredits(): Promise<ElevenLabsCredits | null> {
  try {
    const response = await elevenLabsFetch('subscription', { method: 'GET' });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      character_count?: number;
      character_limit?: number;
    };
    return {
      remainingCharacters: Math.max(0, (json.character_limit ?? 0) - (json.character_count ?? 0)),
      characterLimit: json.character_limit ?? 0
    };
  } catch {
    return null;
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function readAudioBody(response: Response): Promise<ArrayBuffer> {
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const json = (await response.json()) as { error?: string; message?: string; audio?: string };
    if (json.audio) return base64ToArrayBuffer(json.audio);
    throw new AIServiceError(json.error ?? json.message ?? 'Audio generation failed');
  }
  if (!response.ok) {
    const text = await response.text();
    throw new AIServiceError(text || `HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

export async function generateAIAudio(options: {
  prompt: string;
  model: AIAudioModel;
  durationSeconds: number;
}): Promise<ArrayBuffer> {
  const seconds = Math.max(0.5, options.durationSeconds);

  if (options.model === 'minimax_music') {
    const proxy = minimaxProxyURL();
    if (!proxy || !isSupabaseConfigured()) {
      throw new AIServiceError(
        'MiniMax needs a Supabase minimax-proxy function. Use ElevenLabs Music until that is deployed.'
      );
    }
    const { supabaseAnonKey } = readAIConfig();
    const response = await fetch(proxy, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({ prompt: options.prompt, duration: seconds })
    });
    return readAudioBody(response);
  }

  if (options.model === 'elevenlabs_music') {
    const response = await elevenLabsFetch('music', {
      method: 'POST',
      body: JSON.stringify({
        prompt: options.prompt,
        music_length_ms: Math.round(seconds * 1000)
      })
    });
    return readAudioBody(response);
  }

  const response = await elevenLabsFetch('sound-generation', {
    method: 'POST',
    body: JSON.stringify({
      text: options.prompt,
      duration_seconds: Math.min(22, seconds)
    })
  });
  return readAudioBody(response);
}
