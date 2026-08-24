/**
 * UUIDs are the identity currency of the project format, so keep one source.
 *
 * Swift writes `UUID().uuidString` uppercase, so uppercase is the canonical form
 * in memory too. Otherwise a save/load cycle would silently rewrite every id.
 */

export function newUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().toUpperCase();
  }

  // Fallback for contexts without randomUUID (older WebViews).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toUpperCase();
}

/** Canonical form for both storage and comparison. */
export function normalizeUUID(id: string): string {
  return id.toUpperCase();
}

export { normalizeUUID as uuidForFile };
