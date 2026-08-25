import { describe, expect, it } from 'vitest';

import { findStyleCard, STYLE_CARDS, wantsStyleCard } from './style-cards';
import {
  getWorkMode,
  resetSketch,
  setWorkMode,
  wantsGenAudiusCompose,
  wantsMidiArrange
} from './song-sketch';

describe('work mode', () => {
  it('detects MIDI arrange vs GenAudius compose', () => {
    expect(wantsMidiArrange('vamos a hacer un arreglo en midi')).toBe(true);
    expect(wantsMidiArrange('modo MIDI')).toBe(true);
    expect(wantsMidiArrange('quiero un bajo en bachata')).toBe(false);
    expect(wantsGenAudiusCompose('esto lo compone GenAudius')).toBe(true);
    expect(wantsGenAudiusCompose('modo genaudius')).toBe(true);
    expect(wantsGenAudiusCompose('quiero un bajo')).toBe(false);
  });

  it('resets the work mode with the sketch', () => {
    setWorkMode('midi');
    expect(getWorkMode()).toBe('midi');
    resetSketch();
    expect(getWorkMode()).toBeNull();
  });
});

describe('bachata style cards', () => {
  it('has bajo, bongó and requinto', () => {
    expect(STYLE_CARDS.map((card) => card.instrument).sort()).toEqual(['bass', 'bongo', 'requinto']);
    expect(findStyleCard('bass', 'bachata')?.caption).toContain('bajo');
    expect(findStyleCard('bongo')?.tags).toContain('martillo');
    expect(findStyleCard('requinto')?.dawSound).toBe('lead');
  });

  it('detects an indoctrinate request', () => {
    expect(wantsStyleCard('adoctrina el bajo a bachata bailable')).toBe(true);
    expect(wantsStyleCard('ficha del requinto')).toBe(true);
    expect(wantsStyleCard('quiero un bajo')).toBe(false);
  });
});
