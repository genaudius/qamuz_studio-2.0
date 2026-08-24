/**
 * User settings, stored as one JSON file in the app config directory.
 *
 * A single reactive object backs the whole app so a change in one panel is
 * visible everywhere, and every write merges into the file rather than replacing
 * it, which keeps two features from clobbering each other's keys.
 */

import { isTauri, readSettings, writeSettings } from './tauri';

export interface RecentProject {
  path: string;
  name: string;
  openedAt: string;
}

export interface AppSettings {
  recentProjects: RecentProject[];
  lastDirectory?: string;
  /** Supabase project URL, e.g. https://abc.supabase.co */
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /** Local fallbacks. Prefer the edge proxies so keys never leave the machine. */
  anthropicKey?: string;
  elevenLabsKey?: string;
  /** GenAudius / Modal runtime that Maestro calls. */
  maestroBaseUrl?: string;
  modalGenerateUrl?: string;
  modalApiToken?: string;
}

const DEFAULTS: AppSettings = { recentProjects: [] };
const BROWSER_KEY = 'qamuz.settings';

export const settings = $state<AppSettings>({ ...DEFAULTS });

let loaded = false;

export async function loadSettings(): Promise<void> {
  if (loaded) return;
  loaded = true;

  try {
    const json = isTauri() ? await readSettings() : (localStorage.getItem(BROWSER_KEY) ?? '{}');
    Object.assign(settings, DEFAULTS, JSON.parse(json) as Partial<AppSettings>);
  } catch {
    // A corrupt settings file should never stop the app from opening.
  }
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<void> {
  Object.assign(settings, patch);
  const json = JSON.stringify($state.snapshot(settings), null, 2);

  try {
    if (isTauri()) await writeSettings(json);
    else localStorage.setItem(BROWSER_KEY, json);
  } catch {
    // Settings are a convenience, never a reason to fail the action that
    // triggered the write.
  }
}
