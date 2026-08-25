/**
 * Min/max peak extraction for waveform drawing, the equivalent of the peak
 * cache in AudioWaveformView.swift.
 *
 * Peaks are computed once per file at a fixed resolution and cached, then
 * resampled when drawn at a given width. Scanning the whole buffer on every
 * repaint would stall the UI on long files.
 */

/** Interleaved min/max pairs: `[min0, max0, min1, max1, ...]`. */
export type PeakData = Float32Array;

/** Peaks per second of audio in the cache. Fine enough to zoom in a long way. */
const CACHE_RESOLUTION = 400;

/**
 * Cap waveform bitmap columns. A 3–5 min stem at zoom can be tens of thousands
 * of CSS pixels; Chrome blanks canvases past ~32767, which is why imported
 * clips played but showed no waveform. Stretch a short bitmap instead, like
 * AudioWaveformView.swift (~500 columns).
 */
export const MAX_WAVEFORM_COLUMNS = 1024;

const cache = new Map<string, PeakData>();
let cacheGeneration = 0;
const cacheListeners = new Set<() => void>();

export function waveformColumns(cssWidth: number): number {
  return Math.min(MAX_WAVEFORM_COLUMNS, Math.max(2, Math.floor(cssWidth)));
}

/** ClipView subscribes so a late cachePeaks() retriggers the canvas. */
export function subscribeWaveformCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

export function waveformCacheGeneration(): number {
  return cacheGeneration;
}

function bumpCache(): void {
  cacheGeneration += 1;
  for (const listener of cacheListeners) listener();
}

/** Mono mixdown min/max pairs at the cache resolution. */
export function computePeaks(buffer: AudioBuffer, resolution = CACHE_RESOLUTION): PeakData {
  const bucketCount = Math.max(1, Math.ceil(buffer.duration * resolution));
  const samplesPerBucket = Math.max(1, Math.floor(buffer.length / bucketCount));
  const peaks = new Float32Array(bucketCount * 2);

  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    channels.push(buffer.getChannelData(c));
  }
  const scale = 1 / channels.length;

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const from = bucket * samplesPerBucket;
    const to = Math.min(buffer.length, from + samplesPerBucket);

    let min = 0;
    let max = 0;

    for (let i = from; i < to; i += 1) {
      let sum = 0;
      for (const channel of channels) sum += channel[i];
      const value = sum * scale;

      if (value < min) min = value;
      if (value > max) max = value;
    }

    peaks[bucket * 2] = min;
    peaks[bucket * 2 + 1] = max;
  }

  return peaks;
}

export function cachePeaks(fileID: string, buffer: AudioBuffer): PeakData {
  const existing = cache.get(fileID);
  if (existing) return existing;

  const peaks = computePeaks(buffer);
  cache.set(fileID, peaks);
  bumpCache();
  return peaks;
}

export function peaksFor(fileID: string): PeakData | undefined {
  return cache.get(fileID);
}

export function forgetPeaks(fileID: string): void {
  if (!cache.delete(fileID)) return;
  bumpCache();
}

/**
 * Reduces cached peaks down to `columns` min/max pairs covering the sample
 * window `[startSample, startSample + lengthSamples)`.
 */
export function resamplePeaks(
  peaks: PeakData,
  totalSamples: number,
  startSample: number,
  lengthSamples: number,
  columns: number
): PeakData {
  const out = new Float32Array(Math.max(1, columns) * 2);
  if (totalSamples <= 0 || lengthSamples <= 0) return out;

  const bucketCount = peaks.length / 2;
  const samplesPerPeak = totalSamples / bucketCount;

  for (let column = 0; column < columns; column += 1) {
    const fromSample = startSample + (lengthSamples * column) / columns;
    const toSample = startSample + (lengthSamples * (column + 1)) / columns;

    const fromBucket = Math.max(0, Math.floor(fromSample / samplesPerPeak));
    const toBucket = Math.min(bucketCount, Math.max(fromBucket + 1, Math.ceil(toSample / samplesPerPeak)));

    let min = 0;
    let max = 0;

    for (let bucket = fromBucket; bucket < toBucket; bucket += 1) {
      const bucketMin = peaks[bucket * 2];
      const bucketMax = peaks[bucket * 2 + 1];
      if (bucketMin < min) min = bucketMin;
      if (bucketMax > max) max = bucketMax;
    }

    out[column * 2] = min;
    out[column * 2 + 1] = max;
  }

  return out;
}
