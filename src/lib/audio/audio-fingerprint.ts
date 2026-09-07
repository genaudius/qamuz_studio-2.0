/**
 * Compact audio fingerprint for duplicate detection in Studio.
 * Not Chromaprint-grade; good enough to catch the same mix/stems re-imported.
 */

export type AudioFingerprint = {
  /** Stable hex digest for storage / compare. */
  hash: string;
  durationSec: number;
  sampleRate: number;
};

const SLICES = 48;

function hashHex(values: number[]): string {
  // FNV-1a 32-bit over quantized features.
  let hash = 0x811c9dc5;
  for (const value of values) {
    const q = Math.max(0, Math.min(255, Math.round(value * 255)));
    hash ^= q;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function featuresFromBuffer(buffer: AudioBuffer): number[] {
  const channels = Math.min(2, buffer.numberOfChannels);
  const total = buffer.length;
  const sliceLen = Math.max(1, Math.floor(total / SLICES));
  const rmsEnv: number[] = [];
  const zcrEnv: number[] = [];
  let peakRms = 0;

  for (let slice = 0; slice < SLICES; slice += 1) {
    const start = slice * sliceLen;
    const end = Math.min(total, start + sliceLen);
    let energy = 0;
    let count = 0;
    let crossings = 0;
    let prev = 0;
    for (let i = start; i < end; i += 8) {
      let sample = 0;
      for (let c = 0; c < channels; c += 1) sample += buffer.getChannelData(c)[i] ?? 0;
      sample /= channels;
      energy += sample * sample;
      count += 1;
      if (count > 1 && ((prev >= 0 && sample < 0) || (prev < 0 && sample >= 0))) {
        crossings += 1;
      }
      prev = sample;
    }
    const rms = count ? Math.sqrt(energy / count) : 0;
    const zcr = count > 1 ? crossings / (count - 1) : 0;
    rmsEnv.push(rms);
    zcrEnv.push(zcr);
    if (rms > peakRms) peakRms = rms;
  }

  if (peakRms > 1e-8) {
    for (let i = 0; i < rmsEnv.length; i += 1) rmsEnv[i] /= peakRms;
  }
  return [...rmsEnv, ...zcrEnv];
}

/** Build a short energy + ZCR fingerprint from a decoded buffer. */
export function fingerprintAudioBuffer(buffer: AudioBuffer): AudioFingerprint {
  const durationSec = buffer.duration;
  const sampleRate = buffer.sampleRate;
  const features = featuresFromBuffer(buffer);
  const durationKey = Math.round(durationSec * 100);
  const rateKey = Math.round(sampleRate / 100);
  const hash = `${hashHex(features)}-${durationKey}-${rateKey}`;
  return { hash, durationSec, sampleRate };
}

/** Compare two fingerprints: true when same recording / near-identical mix. */
export function fingerprintsMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [hashA, durA, rateA] = a.split('-');
  const [hashB, durB, rateB] = b.split('-');
  if (!hashA || !hashB) return false;
  if (hashA === hashB && durA === durB) return true;
  // Soft match only when duration+rate align and most of the digest matches.
  if (durA === durB && rateA === rateB && hashA.length >= 6 && hashB.length >= 6) {
    let same = 0;
    const n = Math.min(hashA.length, hashB.length);
    for (let i = 0; i < n; i += 1) if (hashA[i] === hashB[i]) same += 1;
    return same / n >= 0.85;
  }
  return false;
}

export async function fingerprintArrayBuffer(
  bytes: ArrayBuffer,
  context: AudioContext
): Promise<AudioFingerprint> {
  const buffer = await context.decodeAudioData(bytes.slice(0));
  return fingerprintAudioBuffer(buffer);
}
