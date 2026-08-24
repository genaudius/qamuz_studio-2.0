/**
 * Thin wrapper over Tauri's IPC.
 *
 * The app also runs in a plain browser tab during development, where `invoke`
 * does not exist. Each helper here either works or throws a message a human can
 * act on, so callers never have to test for the environment themselves.
 */

export interface PlatformInfo {
  os: string;
  arch: string;
  version: string;
}

/** True inside a Tauri window. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error('This action is only available in the desktop app');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export async function platformInfo(): Promise<PlatformInfo | null> {
  if (!isTauri()) return null;
  try {
    return await tauriInvoke<PlatformInfo>('platform_info');
  } catch {
    return null;
  }
}

export async function readAudioFile(path: string): Promise<Uint8Array> {
  const bytes = await tauriInvoke<number[]>('read_audio_file', { path });
  return new Uint8Array(bytes);
}

export async function readSettings(): Promise<string> {
  if (!isTauri()) return '{}';
  return tauriInvoke<string>('read_settings');
}

export async function writeSettings(json: string): Promise<void> {
  if (!isTauri()) return;
  await tauriInvoke<void>('write_settings', { json });
}

export async function importAudioIntoPackage(
  packagePath: string,
  sourcePath: string,
  fileID: string
): Promise<string> {
  return tauriInvoke<string>('import_audio_into_package', {
    packagePath,
    sourcePath,
    fileId: fileID
  });
}

export async function writeAudioIntoPackage(
  packagePath: string,
  fileName: string,
  bytes: Uint8Array
): Promise<string> {
  return tauriInvoke<string>('write_audio_into_package', {
    packagePath,
    fileName,
    bytes: Array.from(bytes)
  });
}
