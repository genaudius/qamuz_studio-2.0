/**
 * Bringing audio files into a project.
 *
 * Two paths reach here. Inside a Tauri window the drop event carries absolute
 * file paths, so the bytes are read through Rust and the file is copied into the
 * `.dawproj` package. In a plain browser tab there is only a `File`, which is
 * still enough to decode, play and draw; it just cannot be copied into a package
 * until the project is saved.
 */

import { cachePeaks } from './waveform';
import type { AudioFileReference } from '$lib/core/clip';
import { newUUID } from '$lib/core/uuid';
import { importAudioIntoPackage, isTauri, readAudioFile, writeAudioIntoPackage } from '$lib/persistence/tauri';
import { engine, projectStore } from '$lib/stores';

export interface ImportResult {
  clipID: string | null;
  error?: string;
}

const AUDIO_EXTENSIONS = ['wav', 'aiff', 'aif', 'mp3', 'm4a', 'flac', 'ogg', 'aac', 'caf'];

export function isAudioPath(path: string): boolean {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXTENSIONS.includes(extension);
}

function referenceFor(
  name: string,
  originalPath: string,
  buffer: AudioBuffer,
  bitDepth = 32
): AudioFileReference {
  const fileID = newUUID();
  const extension = name.split('.').pop()?.toLowerCase() ?? 'wav';

  return {
    fileID,
    originalPath,
    relativePath: `Audio Files/${fileID}.${extension}`,
    sampleRate: buffer.sampleRate,
    channelCount: buffer.numberOfChannels,
    lengthInSamples: buffer.length,
    bitDepth
  };
}

async function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const context = engine.backend.audioContext;
  if (!context) throw new Error('The audio engine is not running yet');

  // decodeAudioData detaches the buffer, so hand it a copy.
  return context.decodeAudioData(bytes.slice(0));
}

async function place(
  reference: AudioFileReference,
  buffer: AudioBuffer,
  trackID: string,
  startBeat: number
): Promise<string | null> {
  engine.backend.registerAudioBuffer(reference.fileID, buffer);
  cachePeaks(reference.fileID, buffer);

  const clip = projectStore.addImportedAudio(trackID, reference, startBeat);
  if (!clip) return null;

  engine.rebuildSchedule();
  return clip.id;
}

/** Import from an absolute path, the Tauri drop and dialog case. */
export async function importAudioPath(
  path: string,
  trackID: string,
  startBeat: number
): Promise<ImportResult> {
  try {
    const bytes = await readAudioFile(path);
    const buffer = await decode(bytes.buffer as ArrayBuffer);
    const name = path.replace(/^.*[\\/]/, '');
    const reference = referenceFor(name, path, buffer);

    const clipID = await place(reference, buffer, trackID, startBeat);

    // Copy into the package straight away when the project has one, so the file
    // survives the original being moved.
    const packagePath = projectStore.packagePath;
    if (packagePath) {
      try {
        const relative = await importAudioIntoPackage(packagePath, path, reference.fileID);
        projectStore.setAudioFileRelativePath(reference.fileID, relative);
      } catch (error) {
        return { clipID, error: `Imported, but not copied into the project: ${(error as Error).message}` };
      }
    }

    return { clipID };
  } catch (error) {
    return { clipID: null, error: (error as Error).message };
  }
}

/** Encode a decoded buffer as 16-bit stereo WAV, for AI clips that arrive as PCM. */
export function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = Math.min(2, buffer.numberOfChannels);
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = length * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : left;
  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    const l = Math.max(-1, Math.min(1, left[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    offset += 2;
    if (channels > 1) {
      const r = Math.max(-1, Math.min(1, right[i]));
      view.setInt16(offset, r < 0 ? r * 0x8000 : r * 0x7fff, true);
      offset += 2;
    }
  }

  return new Uint8Array(out);
}

/** Place generated (or recorded) audio bytes on a track. */
export async function importAudioBytes(
  bytes: ArrayBuffer,
  trackID: string,
  startBeat: number,
  name: string
): Promise<ImportResult> {
  try {
    const buffer = await decode(bytes);
    const reference = referenceFor(`${name}.wav`, name, buffer);
    const clipID = await place(reference, buffer, trackID, startBeat);

    const packagePath = projectStore.packagePath;
    if (packagePath && clipID) {
      try {
        const wav = encodeWav(buffer);
        const relative = await writeAudioIntoPackage(
          packagePath,
          `${reference.fileID}.wav`,
          wav
        );
        projectStore.setAudioFileRelativePath(reference.fileID, relative);
      } catch (error) {
        return {
          clipID,
          error: `Imported, but not copied into the project: ${(error as Error).message}`
        };
      }
    }

    return { clipID };
  } catch (error) {
    return { clipID: null, error: (error as Error).message };
  }
}

/** Import from a dropped or picked `File`, the browser case. */
export async function importAudioFile(
  file: File,
  trackID: string,
  startBeat: number
): Promise<ImportResult> {
  try {
    const bytes = await file.arrayBuffer();
    const buffer = await decode(bytes);
    const reference = referenceFor(file.name, file.name, buffer);

    return { clipID: await place(reference, buffer, trackID, startBeat) };
  } catch (error) {
    return { clipID: null, error: (error as Error).message };
  }
}

/** Opens a file picker and imports the selection. */
export async function chooseAudioFiles(trackID: string, startBeat: number): Promise<ImportResult[]> {
  if (!isTauri()) {
    return [{ clipID: null, error: 'Use drag and drop in the browser build' }];
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    multiple: true,
    title: 'Import audio',
    filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }]
  });

  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];

  const results: ImportResult[] = [];
  let beat = startBeat;

  for (const path of paths) {
    const result = await importAudioPath(path, trackID, beat);
    results.push(result);

    // Lay multiple files end to end rather than stacking them.
    if (result.clipID) {
      const found = projectStore.findClip(result.clipID);
      if (found) {
        const bpm = projectStore.project.tempo.bpm;
        beat +=
          (found.clip.timeRange.duration.samples / projectStore.project.sampleRate / 60) * bpm;
      }
    }
  }

  return results;
}
