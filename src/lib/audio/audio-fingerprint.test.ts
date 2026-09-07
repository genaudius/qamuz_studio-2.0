import { describe, expect, it } from 'vitest';
import { fingerprintAudioBuffer, fingerprintsMatch } from './audio-fingerprint';

function makeBuffer(durationSec: number, sampleRate = 44100, seed = 1): AudioBuffer {
  const length = Math.floor(durationSec * sampleRate);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.sin((i / sampleRate) * (220 + seed) * Math.PI * 2) * (0.2 + (seed % 5) * 0.05);
  }
  return {
    duration: durationSec,
    sampleRate,
    length,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyFromChannel: () => undefined,
    copyToChannel: () => undefined
  } as unknown as AudioBuffer;
}

describe('audio-fingerprint', () => {
  it('matches the same buffer', () => {
    const a = fingerprintAudioBuffer(makeBuffer(4, 44100, 3));
    const b = fingerprintAudioBuffer(makeBuffer(4, 44100, 3));
    expect(fingerprintsMatch(a.hash, b.hash)).toBe(true);
  });

  it('differs for different content', () => {
    const a = fingerprintAudioBuffer(makeBuffer(4, 44100, 3));
    const b = fingerprintAudioBuffer(makeBuffer(4, 44100, 9));
    expect(fingerprintsMatch(a.hash, b.hash)).toBe(false);
  });
});
