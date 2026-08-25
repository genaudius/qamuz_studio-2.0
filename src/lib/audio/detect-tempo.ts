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
