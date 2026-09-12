import { describe, expect, it } from 'vitest';

import { makeInsertWithPreset, mixStyleFromPrompt, processForRole } from './mix-agent';

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

describe('EQAMUZ mix-agent automated inserts', () => {
  it('creates insert with active preset and valid safe initial payload', () => {
    const slot = makeInsertWithPreset('eqamuz-pro-eq', 'VOCAL_AIR_&_WARMTH');
    expect(slot).not.toBeNull();
    expect(slot?.kind).toBe('eqamuz-pro-eq');
    expect(slot?.params?.activePresetName).toBe('VOCAL_AIR_&_WARMTH');
    expect(slot?.params?.eqamuzState).toBeDefined();
  });

  it('builds serial EQAMUZ chain for lead_vocal with PRO-EQ, COMP and SATURATOR', () => {
    const style = mixStyleFromPrompt('mezcla balanceada');
    const cp = processForRole('lead_vocal', style);
    expect(cp.inserts.length).toBe(3);
    expect(cp.inserts[0].kind).toBe('eqamuz-pro-eq');
    expect(cp.inserts[0].params?.activePresetName).toBe('VOCAL_AIR_&_WARMTH');
    expect(cp.inserts[1].kind).toBe('eqamuz-comp');
    expect(cp.inserts[1].params?.activePresetName).toBe('OPTO_VOCAL_LEVELER');
    expect(cp.inserts[2].kind).toBe('eqamuz-saturator');
    expect(cp.inserts[2].params?.activePresetName).toBe('SUBTLE_TAPE_WARMTH');
  });

  it('builds serial EQAMUZ chain for bass with PRO-EQ and COMP', () => {
    const style = mixStyleFromPrompt('mezcla balanceada');
    const cp = processForRole('bass', style);
    expect(cp.inserts.length).toBe(2);
    expect(cp.inserts[0].kind).toBe('eqamuz-pro-eq');
    expect(cp.inserts[0].params?.activePresetName).toBe('BASS_TIGHT_CLEANUP');
    expect(cp.inserts[1].kind).toBe('eqamuz-comp');
    expect(cp.inserts[1].params?.activePresetName).toBe('SAFE_TRANSPARENT_GLUE');
  });

  it('builds serial EQAMUZ chain for drums with COMP and PRO-EQ', () => {
    const style = mixStyleFromPrompt('mezcla balanceada');
    const cp = processForRole('drums', style);
    expect(cp.inserts.length).toBe(2);
    expect(cp.inserts[0].kind).toBe('eqamuz-comp');
    expect(cp.inserts[0].params?.activePresetName).toBe('VCA_DRUM_PUNCH');
    expect(cp.inserts[1].kind).toBe('eqamuz-pro-eq');
    expect(cp.inserts[1].params?.activePresetName).toBe('SAFE_FLAT_RESET');
  });

  it('leaves inserts empty when user specifies faders only', () => {
    const style = mixStyleFromPrompt('solo volumen');
    const cp = processForRole('lead_vocal', style);
    expect(cp.inserts.length).toBe(0);
  });
});
