/**
 * Where the AI calls go.
 *
 * Keys never live in the repo. The 1.0 build stored them in UserDefaults; here
 * they live in the same settings.json as recent projects. Prefer the Supabase
 * edge proxies (`claude-proxy`, `elevenlabs-proxy`) so the key stays on the
 * server. Direct Anthropic / ElevenLabs keys are a local fallback.
 */

import { patchSettings, settings } from '$lib/persistence/settings.svelte';

export interface AIConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  anthropicKey: string;
  elevenLabsKey: string;
}

export function readAIConfig(): AIConfig {
  return {
    supabaseUrl: (settings.supabaseUrl ?? '').replace(/\/+$/, ''),
    supabaseAnonKey: settings.supabaseAnonKey ?? '',
    anthropicKey: settings.anthropicKey ?? '',
    elevenLabsKey: settings.elevenLabsKey ?? ''
  };
}

export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseAnonKey } = readAIConfig();
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}

export function isClaudeConfigured(): boolean {
  return isSupabaseConfigured() || readAIConfig().anthropicKey.length > 0;
}

export function isElevenLabsConfigured(): boolean {
  return isSupabaseConfigured() || readAIConfig().elevenLabsKey.length > 0;
}

export async function saveAIConfig(patch: Partial<AIConfig>): Promise<void> {
  await patchSettings(patch);
}

export function claudeProxyURL(): string | null {
  const { supabaseUrl } = readAIConfig();
  return supabaseUrl ? `${supabaseUrl}/functions/v1/claude-proxy` : null;
}

export function elevenLabsProxyURL(endpoint: string): string | null {
  const { supabaseUrl } = readAIConfig();
  return supabaseUrl ? `${supabaseUrl}/functions/v1/elevenlabs-proxy?endpoint=${endpoint}` : null;
}

export function minimaxProxyURL(): string | null {
  const { supabaseUrl } = readAIConfig();
  return supabaseUrl ? `${supabaseUrl}/functions/v1/minimax-proxy` : null;
}
