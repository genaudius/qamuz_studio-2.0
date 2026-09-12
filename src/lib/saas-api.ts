/**
 * Studio APIs: same-origin BFF on qamuz.studio, or postMessage through
 * the SaaS iframe parent. Desktop without BFF falls back to IndexedDB.
 */

import { isEmbedded } from './saas';

async function fetchSameOrigin(options: {
  path: string;
  method?: string;
  json?: unknown;
  file?: SaasFilePart;
  fields?: Record<string, string>;
  bytes?: ArrayBuffer;
  contentType?: string;
}): Promise<SaasApiResult> {
  try {
    const method = options.method ?? 'GET';
    let body: BodyInit | undefined;
    const headers = new Headers();
    if (options.file) {
      const form = new FormData();
      form.append('file', new Blob([options.file.bytes], { type: options.file.type }), options.file.name);
      for (const [key, value] of Object.entries(options.fields || {})) form.append(key, value);
      body = form;
    } else if (options.bytes) {
      headers.set('Content-Type', options.contentType || 'application/octet-stream');
      body = options.bytes;
    } else if (options.json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.json);
    }
    const response = await fetch(options.path, {
      method,
      headers,
      body,
      credentials: 'include',
    });
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return { status: response.status, json: await response.json(), contentType };
    }
    const bytes = await response.arrayBuffer();
    return { status: response.status, bytes, contentType };
  } catch (error) {
    return { status: 0, error: error instanceof Error ? error.message : 'network' };
  }
}

export interface SaasApiResult {
  status: number;
  json?: unknown;
  bytes?: ArrayBuffer;
  contentType?: string;
  error?: string;
}

export interface SaasFilePart {
  bytes: ArrayBuffer;
  name: string;
  type: string;
}

interface Pending {
  resolve: (value: SaasApiResult) => void;
  reject: (error: Error) => void;
}

const pending = new Map<string, Pending>();
let listening = false;

function ensureListener() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== 'qamuz-studio:api-result' || typeof data.id !== 'string') return;
    console.log(`[Studio2.0 saasApi] Received result for ${data.id}: HTTP ${data.status}`, data.error || (data.bytes ? `${data.bytes.byteLength} bytes` : 'JSON'));
    const waiter = pending.get(data.id);
    if (!waiter) return;
    pending.delete(data.id);
    waiter.resolve({
      status: Number(data.status ?? 0),
      json: data.json,
      bytes: data.bytes,
      contentType: data.contentType,
      error: data.error
    });
  });
}

export async function saasApi(options: {
  path: string;
  method?: string;
  json?: unknown;
  file?: SaasFilePart;
  fields?: Record<string, string>;
  bytes?: ArrayBuffer;
  contentType?: string;
}): Promise<SaasApiResult> {
  if (!isEmbedded()) {
    return fetchSameOrigin(options);
  }

  ensureListener();
  const id = crypto.randomUUID();
  console.log(`[Studio2.0 saasApi] PostMessage request: ${options.method ?? 'GET'} ${options.path} (id: ${id})`);
  const result = new Promise<SaasApiResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    window.setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      console.warn(`[Studio2.0 saasApi] Request ${id} timed out after 180s`);
      resolve({ status: 0, error: 'timeout' });
    }, 180000);
  });

  window.parent.postMessage(
    {
      type: 'qamuz-studio:api',
      id,
      method: options.method ?? 'GET',
      path: options.path,
      json: options.json,
      fields: options.fields,
      file: options.file
        ? { name: options.file.name, type: options.file.type, bytes: options.file.bytes }
        : undefined
    },
    '*'
  );

  return result;
}

const IDB_NAME = 'qamuz-master-pro';
const IDB_STORE = 'jobs';

export interface LocalMasterJob {
  id: string;
  title: string;
  sourceName: string;
  sourceKind: string;
  style: string;
  peakDb: number | null;
  lufs: number | null;
  durationSec: number | null;
  fileSize: number;
  createdAt: string;
  wav?: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function localPutJob(job: LocalMasterJob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(job, job.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function localListJobs(): Promise<LocalMasterJob[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const request = tx.objectStore(IDB_STORE).getAll();
      request.onsuccess = () => {
        const rows = (request.result as LocalMasterJob[]) ?? [];
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        resolve(rows.map(({ wav: _wav, ...meta }) => meta as LocalMasterJob));
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function localGetJob(id: string): Promise<LocalMasterJob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const request = tx.objectStore(IDB_STORE).get(id);
    request.onsuccess = () => resolve((request.result as LocalMasterJob) ?? null);
    request.onerror = () => reject(request.error);
  });
}
