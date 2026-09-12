/**
 * Way back to the QAMUZ AI SaaS from Studio.
 *
 * In Vite/Tauri dev, Home opens the local SaaS at http://localhost:5173/.
 * Production builds open https://qamuz.ai/. When Studio is embedded in the
 * SaaS iframe (the same pattern as 1.0), Home navigates the parent to `/`.
 */

import { isTauri } from '$lib/persistence/tauri';
import { projectStore } from '$lib/stores';
import { studioNotice } from '$lib/ui/studio-notice.svelte';

export const QAMUZ_SAAS_HOME = 'https://qamuz.ai/';
export const QAMUZ_SAAS_DEV_HOME = 'http://localhost:5173/';

function defaultSaasHome(): string {
  return import.meta.env.DEV ? QAMUZ_SAAS_DEV_HOME : QAMUZ_SAAS_HOME;
}

export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('embedded') === '1') return true;
  try {
    return window.self !== window.top || window.parent !== window;
  } catch {
    return true;
  }
}

/** Studio hosted on its own origin (qamuz.studio) with a same-origin BFF. */
export function isStandaloneStudio(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.VITE_STUDIO_STANDALONE === '1') return true;
  const host = window.location.hostname;
  return (
    host === 'qamuz.studio' ||
    host === 'www.qamuz.studio' ||
    host.endsWith('.qamuz.studio')
  );
}

export function canUseCloudApis(): boolean {
  return isEmbedded() || isStandaloneStudio() || import.meta.env.DEV;
}

function isTrustedSaasOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    if (hostname === 'qamuz.ai' || hostname.endsWith('.qamuz.ai')) return true;
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function tryTrustedUrl(value: string): string | null {
  try {
    const url = new URL(value, typeof window === 'undefined' ? defaultSaasHome() : window.location.origin);
    if (!isTrustedSaasOrigin(url.origin)) return null;
    return url.pathname && url.pathname !== '/' ? url.href : `${url.origin}/`;
  } catch {
    return null;
  }
}

/** Home URL: query/env override, then the embedding origin, then local SaaS in dev. */
export function saasHomeUrl(): string {
  if (typeof window === 'undefined') return defaultSaasHome();

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('home') ?? params.get('returnUrl');
  if (fromQuery) {
    const resolved = tryTrustedUrl(fromQuery);
    if (resolved) return resolved;
  }

  const fromEnv = import.meta.env.VITE_QAMUZ_SAAS_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    const resolved = tryTrustedUrl(fromEnv.trim());
    if (resolved) return resolved;
  }

  // Only the parent of an embed is the SaaS. Standalone Studio on localhost
  // must not treat its own origin as Home.
  if (isEmbedded()) {
    try {
      const parentOrigin = window.parent.location.origin;
      if (isTrustedSaasOrigin(parentOrigin)) return `${parentOrigin}/`;
    } catch {
      // Cross-origin parent: fall through to the referrer, then the default.
    }

    try {
      if (document.referrer) {
        const referrer = new URL(document.referrer);
        if (isTrustedSaasOrigin(referrer.origin)) return `${referrer.origin}/`;
      }
    } catch {
      // Referrer can be opaque.
    }
  }

  return defaultSaasHome();
}

/** Leave Studio and open the QAMUZ AI home. */
export async function goHome(): Promise<void> {
  if (projectStore.isDirty) {
    const proceed = await studioNotice.confirm({
      title: 'Hay cambios sin guardar',
      description: 'Si sales ahora, puedes perder edits recientes. ¿Volver a QAMUZ AI de todas formas?',
      tone: 'warning',
      confirmLabel: 'Salir',
      cancelLabel: 'Seguir aquí'
    });
    if (!proceed) return;
  }

  const url = saasHomeUrl();

  if (isEmbedded()) {
    try {
      window.parent.postMessage({ type: 'qamuz-studio:home', url }, '*');
    } catch {
      // Parent may be cross-origin; opening the URL still works below.
    }
    try {
      if (window.top) {
        window.top.location.href = url;
        return;
      }
    } catch {
      // Cross-origin iframe: the parent handles the postMessage.
    }
  }

  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }

  window.location.assign(url);
}

export function saasPathUrl(path: string): string {
  const home = saasHomeUrl().replace(/\/$/, '');
  const clean = path.replace(/^\//, '');
  return `${home}/${clean}`;
}

/** Sign out of QAMUZ AI. Inside the iframe the parent runs the real auth client. */
export async function signOutOfSaas(): Promise<void> {
  if (isEmbedded()) {
    try {
      window.parent.postMessage({ type: 'qamuz-studio:sign-out' }, '*');
    } catch {
      // Parent may be cross-origin.
    }
    return;
  }
  if (isStandaloneStudio() || import.meta.env.DEV) {
    try {
      await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    } catch {
      // Cookie may already be gone.
    }
    window.location.assign('/api/auth/login');
    return;
  }
  await goToSaasPath('login');
}

export function studioLoginUrl(): string {
  return '/api/auth/login';
}

/** Open a SaaS route such as /pricing from Studio. */
export async function goToSaasPath(path: string): Promise<void> {
  const url = saasPathUrl(path);
  const route = `/${path.replace(/^\//, '')}`;

  if (isEmbedded()) {
    try {
      window.parent.postMessage({ type: 'qamuz-studio:navigate', path: route, url }, '*');
    } catch {
      // Parent may be cross-origin.
    }
    try {
      if (window.top) {
        window.top.location.href = url;
        return;
      }
    } catch {
      // Cross-origin iframe: the parent handles the postMessage.
    }
  }

  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }

  window.location.assign(url);
}
