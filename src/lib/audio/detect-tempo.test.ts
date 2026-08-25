import { describe, expect, it } from 'vitest';

import { bpmFromText, resolveSessionTempo } from './detect-tempo';

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
