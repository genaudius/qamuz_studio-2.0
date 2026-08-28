/**
 * Estimate a song's BPM from audio or from the prompt.
 * Used when extracting stems so clips land on the grid of the original mix.
 */

export function bpmFromText(text: string | undefined): number | null {
  if (!text) return null;
  const match =
    text.match(/(\d{2,3})\s*bpm\b/i) ||
    text.match(/\btempo[:\s]+(\d{2,3})\b/i);
  if (!match) return null;
  const bpm = Number(match[1]);
  if (bpm < 60 || bpm > 200) return null;
  return bpm;
}

function envelope(channel: Float32Array, sampleRate: number): { flux: Float32Array; envSr: number } {
  const hop = Math.max(1, Math.floor(sampleRate / 200));
  const count = Math.floor(channel.length / hop);
  const flux = new Float32Array(count);
  let prev = 0;
  for (let i = 0; i < count; i++) {
    const start = i * hop;
    let energy = 0;
    for (let j = 0; j < hop; j++) {
      const s = channel[start + j];
      energy += s * s;
    }
    const rms = Math.sqrt(energy / hop);
    flux[i] = Math.max(0, rms - prev);
    prev = rms;
  }
  return { flux, envSr: sampleRate / hop };
}

function foldBpm(raw: number): number {
  let bpm = raw;
  while (bpm < 75) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(Math.max(70, Math.min(180, bpm)));
}

export function estimateTempoBpm(buffer: AudioBuffer): number | null {
  const channel = buffer.getChannelData(0);
  if (channel.length < buffer.sampleRate) return null;
  const { flux, envSr } = envelope(channel, buffer.sampleRate);
  if (flux.length < 32) return null;

  let bestCorr = -1;
  let bestLag = 0;
  for (let bpm = 70; bpm <= 180; bpm += 1) {
    const lag = Math.round((60 / bpm) * envSr);
    if (lag < 2 || lag >= flux.length - 2) continue;
    let corr = 0;
    for (let i = 0; i + lag < flux.length; i++) corr += flux[i] * flux[i + lag];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag < 2) return null;
  return foldBpm((60 * envSr) / bestLag);
}

export function resolveSessionTempo(options: {
  hinted?: number | null;
  prompt?: string;
  buffer?: AudioBuffer | null;
}): number {
  const hinted = Number(options.hinted);
  if (Number.isFinite(hinted) && hinted >= 60 && hinted <= 200) return Math.round(hinted);
  const fromPrompt = bpmFromText(options.prompt);
  if (fromPrompt) return fromPrompt;
  if (options.buffer) {
    const detected = estimateTempoBpm(options.buffer);
    if (detected) return detected;
  }
  return 120;
}

export interface BarAnchors {
  firstAudibleSeconds: number;
  firstStrongBeatSeconds: number;
}

function rmsEnvelope(channel: Float32Array, sampleRate: number): { rms: Float32Array; hop: number } {
  const hop = Math.max(1, Math.floor(sampleRate / 200));
  const count = Math.floor(channel.length / hop);
  const rms = new Float32Array(Math.max(1, count));
  for (let i = 0; i < count; i++) {
    const start = i * hop;
    let energy = 0;
    for (let j = 0; j < hop && start + j < channel.length; j++) {
      const s = channel[start + j];
      energy += s * s;
    }
    rms[i] = Math.sqrt(energy / hop);
  }
  return { rms, hop };
}

/**
 * First audible onset and the first later ensemble-strength hit.
 * Used so 1|1 can sit on the musical entry without editing the WAV.
 */
export function findBarAnchors(buffer: AudioBuffer): BarAnchors | null {
  const channel = buffer.getChannelData(0);
  if (channel.length < buffer.sampleRate * 0.05) return null;
  const { rms, hop } = rmsEnvelope(channel, buffer.sampleRate);
  if (rms.length < 8) return null;

  const ranked = Array.from(rms).sort((a, b) => a - b);
  const noise = ranked[Math.floor(ranked.length * 0.12)] || 1e-6;
  const audible = Math.max(noise * 10, 0.003);

  let first = -1;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] >= audible) {
      first = i;
      break;
    }
  }
  if (first < 0) return null;

  const flux = new Float32Array(rms.length);
  for (let i = 1; i < rms.length; i++) flux[i] = Math.max(0, rms[i] - rms[i - 1]);

  const searchEnd = Math.min(rms.length - 2, first + Math.floor((8 * buffer.sampleRate) / hop));
  let fluxMean = 0;
  let fluxCount = 0;
  for (let i = first; i < searchEnd; i++) {
    fluxMean += flux[i];
    fluxCount += 1;
  }
  fluxMean = fluxMean / Math.max(1, fluxCount);

  let strong = first;
  for (let i = first + 2; i < searchEnd; i++) {
    const peak = flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1];
    if (!peak) continue;
    if (flux[i] >= flux[first] * 2.1 && flux[i] >= fluxMean * 3.5) {
      strong = i;
      break;
    }
  }

  return {
    firstAudibleSeconds: (first * hop) / buffer.sampleRate,
    firstStrongBeatSeconds: (strong * hop) / buffer.sampleRate
  };
}
