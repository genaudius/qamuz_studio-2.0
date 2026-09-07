import { describe, expect, it } from 'vitest';

import { mixStyleFromPrompt } from './mix-agent';

describe('mix style parsing', () => {
  it('uses an airy intelligent mix by default', () => {
    expect(mixStyleFromPrompt('')).toMatchObject({
      headroom: 0.56,
      spread: 0.48,
      process: true,
      label: 'abierta y con aire'
    });
  });

  it('understands softer mixes and vocal emphasis', () => {
    const style = mixStyleFromPrompt('Mezcla suave con aire y sube más la voz');
    expect(style.headroom).toBe(0.48);
    expect(style.spread).toBe(0.38);
    expect(style.vocal).toBe(1.14);
    expect(style.process).toBe(true);
  });

  it('can explicitly limit the pass to fader levels', () => {
    const style = mixStyleFromPrompt('solo volumen, sin eq ni comp');
    expect(style.process).toBe(false);
    expect(style.label).toContain('solo niveles');
  });
});
