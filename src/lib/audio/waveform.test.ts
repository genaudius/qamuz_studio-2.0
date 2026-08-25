import { describe, expect, it } from 'vitest';

import {
  MAX_WAVEFORM_COLUMNS,
  computePeaks,
  resamplePeaks,
  waveformColumns
} from './waveform';

function fakeBuffer(samples: Float32Array, sampleRate = 44100): AudioBuffer {
  return {
    duration: samples.length / sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => samples
  } as unknown as AudioBuffer;
}

describe('waveformColumns', () => {
  it('caps long clips so the canvas stays under the browser limit', () => {
    expect(waveformColumns(48000)).toBe(MAX_WAVEFORM_COLUMNS);
    expect(waveformColumns(80)).toBe(80);
    expect(waveformColumns(0)).toBe(2);
  });
});

describe('computePeaks', () => {
  it('records min and max of a sine-like burst', () => {
    const samples = new Float32Array(400);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = i < 200 ? 0.8 : -0.5;
    }
    const peaks = computePeaks(fakeBuffer(samples, 400), 4);
    const max = Math.max(...peaks.filter((_, i) => i % 2 === 1));
    const min = Math.min(...peaks.filter((_, i) => i % 2 === 0));
    expect(max).toBeGreaterThan(0.7);
    expect(min).toBeLessThan(-0.4);
  });
});

describe('resamplePeaks', () => {
  it('keeps extrema when reducing columns', () => {
    const peaks = new Float32Array([-0.9, 0.4, -0.1, 0.95, 0, 0.1, -0.2, 0.2]);
    const out = resamplePeaks(peaks, 400, 0, 400, 1);
    expect(out[0]).toBeLessThan(-0.8);
    expect(out[1]).toBeGreaterThan(0.9);
  });
});
