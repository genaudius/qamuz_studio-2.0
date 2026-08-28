import { describe, expect, it } from 'vitest';

import { bpmFromText, findBarAnchors, resolveSessionTempo } from './detect-tempo';

function fakeBuffer(samples: Float32Array, sampleRate = 8000): AudioBuffer {
  return {
    duration: samples.length / sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => samples
  } as unknown as AudioBuffer;
}

function burst(samples: Float32Array, sampleRate: number, seconds: number, amplitude: number, width = 0.02) {
  const start = Math.floor(seconds * sampleRate);
  const count = Math.floor(width * sampleRate);
  for (let i = 0; i < count && start + i < samples.length; i++) samples[start + i] = amplitude;
}

describe('bpmFromText', () => {
  it('reads a BPM written in the prompt', () => {
    expect(bpmFromText('bachata romántica 128 bpm con requinto')).toBe(128);
    expect(bpmFromText('tempo 94 merengue')).toBe(94);
    expect(bpmFromText('sin tempo')).toBeNull();
  });
});

describe('resolveSessionTempo', () => {
  it('prefers an explicit hint, then the prompt', () => {
    expect(resolveSessionTempo({ hinted: 94, prompt: '120 bpm' })).toBe(94);
    expect(resolveSessionTempo({ prompt: 'merengue 150 BPM' })).toBe(150);
    expect(resolveSessionTempo({})).toBe(120);
  });
});

describe('findBarAnchors', () => {
  it('puts 1|1 on the first hit when that is the strong entry', () => {
    const samples = new Float32Array(8000 * 2);
    burst(samples, 8000, 0.173, 0.9);
    const found = findBarAnchors(fakeBuffer(samples));
    expect(found).not.toBeNull();
    expect(found!.firstAudibleSeconds).toBeCloseTo(0.173, 1);
    expect(found!.firstStrongBeatSeconds).toBeCloseTo(0.173, 1);
  });

  it('keeps a quiet pickup and a later ensemble hit as 1|1', () => {
    const samples = new Float32Array(8000 * 4);
    burst(samples, 8000, 0.156, 0.08, 0.03);
    burst(samples, 8000, 2.243, 0.95, 0.04);
    const found = findBarAnchors(fakeBuffer(samples));
    expect(found).not.toBeNull();
    expect(found!.firstAudibleSeconds).toBeLessThan(0.4);
    expect(found!.firstStrongBeatSeconds).toBeGreaterThan(1.8);
    expect(found!.firstStrongBeatSeconds).toBeCloseTo(2.243, 1);
  });
});
