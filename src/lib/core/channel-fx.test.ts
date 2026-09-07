import { describe, expect, it } from 'vitest';

import {
  channelProcessPayload,
  dbToGain,
  fxBusesPayload,
  gainToDb,
  makeChannelProcess,
  makeFxBuses,
  makeInsert
} from './channel-fx';

describe('channel processing model', () => {
  it('round-trips decibels and linear gain', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501187, 5);
    expect(gainToDb(dbToGain(-18))).toBeCloseTo(-18, 8);
    expect(gainToDb(0)).toBe(-80);
  });

  it('creates independent channel defaults', () => {
    const first = makeChannelProcess();
    const second = makeChannelProcess();

    first.eq.bands[0].gainDb = 4;
    expect(second.eq.bands[0].gainDb).toBe(0);
    expect(first.comp.enabled).toBe(false);
    expect(first.eq.bands).toHaveLength(5);
  });

  it('only instantiates inserts backed by the DSP engine', () => {
    const drive = makeInsert('drive');
    expect(drive).toMatchObject({ kind: 'drive', enabled: true });
    expect(drive?.params).toEqual({ drive: 0.35, tone: 0.55, mix: 0.45 });
    expect(makeInsert('amp')).toBeNull();
  });

  it('serializes channel and tempo-aware bus payloads', () => {
    const process = makeChannelProcess();
    process.preGainDb = -6;
    process.phaseInvert = true;
    process.sends.reverb = 0.2;

    expect(channelProcessPayload(process)).toMatchObject({
      preGain: dbToGain(-6),
      phaseInvert: true,
      eqEnabled: false,
      compEnabled: false,
      sendReverb: 0.2,
      sendDelay: 0
    });
    expect(fxBusesPayload(makeFxBuses(), 132)).toMatchObject({
      delay: { bpm: 132, syncBeats: 0.25 }
    });
  });
});
