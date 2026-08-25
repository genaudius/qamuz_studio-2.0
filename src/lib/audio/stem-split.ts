/**
 * Split a stereo mix into named instrument stems so Create Music → Extract
 * Stems can land in the DAW as real tracks. This is signal processing (bass
 * low-pass, center vocals, drum transients, residual), not a copy of the mix
 * onto fake channels.
 */

export interface StemLabelInput {
  prompt?: string;
  genre?: string;
  instrumental?: boolean;
}

export interface NamedSplitStem {
  name: string;
  role: string;
  color: 'purple' | 'orange' | 'green' | 'cyan' | 'blue';
  left: Float32Array;
  right: Float32Array;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function songSessionTitle(input: { title?: string; prompt?: string }): string {
  const title = (input.title ?? '').trim();
  if (title && !/^generated track$/i.test(title)) return title.slice(0, 80);
  const prompt = (input.prompt ?? '').trim();
  const first = prompt.split(/[\n.!?]/)[0]?.trim() ?? '';
  return (first || title || 'Canción QAMUZ').slice(0, 80);
}

export function otherStemName(input: StemLabelInput): string {
  const text = fold(`${input.genre ?? ''} ${input.prompt ?? ''}`);
  if (/\b(requinto|lead guitar)\b/.test(text)) return 'Requinto';
  if (/\b(guitarra|guitar|bachata|salsa|merengue|cumbia|bolero|rock|country|pop)\b/.test(text)) {
    return 'Guitarra';
  }
  if (/\b(piano|keys|teclado|ballad)\b/.test(text)) return 'Piano';
  if (/\b(pad|cuerdas|strings|violin|orquesta)\b/.test(text)) return 'Cuerdas';
  if (/\b(synth|house|techno|edm|electronic|trance)\b/.test(text)) return 'Synth';
  if (/\b(brass|metales|trompeta|sax)\b/.test(text)) return 'Metales';
  return 'Instrumentos';
}

function peak(samples: Float32Array): number {
  let max = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.abs(samples[i]);
    if (value > max) max = value;
  }
  return max;
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

function onePoleLowpass(input: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const out = new Float32Array(input.length);
  const coeff = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  let previous = 0;
  for (let i = 0; i < input.length; i += 1) {
    previous = (1 - coeff) * input[i] + coeff * previous;
    out[i] = previous;
  }
  return out;
}

function onePoleHighpass(input: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const low = onePoleLowpass(input, sampleRate, cutoff);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = input[i] - low[i];
  return out;
}

function bandpass(input: Float32Array, sampleRate: number, low: number, high: number): Float32Array {
  return onePoleLowpass(onePoleHighpass(input, sampleRate, low), sampleRate, high);
}

function transients(input: Float32Array, sampleRate: number): Float32Array {
  return onePoleHighpass(input, sampleRate, 180);
}

function subtract(source: Float32Array, ...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    let value = source[i];
    for (const part of parts) value -= part[i] ?? 0;
    out[i] = value;
  }
  return out;
}

function scaleChannels(left: Float32Array, right: Float32Array, gain: number): { left: Float32Array; right: Float32Array } {
  const nextL = new Float32Array(left.length);
  const nextR = new Float32Array(right.length);
  for (let i = 0; i < left.length; i += 1) {
    nextL[i] = left[i] * gain;
    nextR[i] = right[i] * gain;
  }
  return { left: nextL, right: nextR };
}

/** Keep the summed stems below the mix peak so the DAW does not clip on playback. */
export function normalizeStemSum(stems: NamedSplitStem[], targetPeak = 0.5): NamedSplitStem[] {
  if (!stems.length) return stems;
  const length = stems[0].left.length;
  let sumPeak = 0;
  for (let i = 0; i < length; i += 1) {
    let left = 0;
    let right = 0;
    for (const stem of stems) {
      left += stem.left[i] ?? 0;
      right += stem.right[i] ?? 0;
    }
    sumPeak = Math.max(sumPeak, Math.abs(left), Math.abs(right));
  }
  const gain = sumPeak > 1e-6 ? Math.min(1, targetPeak / sumPeak) : 1;
  if (gain >= 0.999) return stems;
  return stems.map((stem) => ({ ...stem, ...scaleChannels(stem.left, stem.right, gain) }));
}

function audible(channels: Float32Array[], mixPeak: number): boolean {
  const local = Math.max(...channels.map(peak));
  return local > Math.max(0.012, mixPeak * 0.04);
}

export function splitMixChannels(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  labels: StemLabelInput = {}
): NamedSplitStem[] {
  const mixPeak = Math.max(peak(left), peak(right), 0.0001);
  const bassL = onePoleLowpass(left, sampleRate, 140);
  const bassR = onePoleLowpass(right, sampleRate, 140);
  const mid = new Float32Array(left.length);
  for (let i = 0; i < left.length; i += 1) mid[i] = 0.5 * (left[i] + right[i]);
  const vocal = labels.instrumental ? new Float32Array(left.length) : bandpass(mid, sampleRate, 180, 4200);
  const drumL = transients(onePoleHighpass(left, sampleRate, 160), sampleRate);
  const drumR = transients(onePoleHighpass(right, sampleRate, 160), sampleRate);
  const otherL = subtract(left, bassL, vocal, drumL);
  const otherR = subtract(right, bassR, vocal, drumR);

  const stems: NamedSplitStem[] = [];
  if (!labels.instrumental && audible([vocal], mixPeak) && rms(vocal) > 0.008) {
    stems.push({ name: 'Voz', role: 'lead_vocal', color: 'purple', left: vocal, right: vocal });
  }
  if (audible([bassL, bassR], mixPeak)) {
    stems.push({ name: 'Bajo', role: 'bass', color: 'orange', left: bassL, right: bassR });
  }
  if (audible([drumL, drumR], mixPeak)) {
    stems.push({ name: 'Batería', role: 'drums', color: 'green', left: drumL, right: drumR });
  }
  if (audible([otherL, otherR], mixPeak)) {
    stems.push({
      name: otherStemName(labels),
      role: 'rhythm_guitar',
      color: 'cyan',
      left: otherL,
      right: otherR
    });
  }
  return normalizeStemSum(stems, 0.5);
}

export function splitMixBuffer(buffer: AudioBuffer, labels: StemLabelInput = {}): NamedSplitStem[] {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  return splitMixChannels(left, right, buffer.sampleRate, labels);
}
