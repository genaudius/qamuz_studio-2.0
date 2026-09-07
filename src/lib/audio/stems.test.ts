import { describe, expect, it } from 'vitest';

import { inferInstrument, uniqueTrackName, channelLayout, layoutLabel, trackLayoutLabel } from './stems';
import { makeTrack } from '$lib/core/track';
import { otherStemName, songSessionTitle, splitMixChannels } from './stem-split';

describe('inferInstrument', () => {
  it('maps Spanish stems to mixer roles', () => {
    expect(inferInstrument('voz_leader.wav').name).toBe('Voz');
    expect(inferInstrument('bajo_01.mp3').role).toBe('bass');
    expect(inferInstrument('requinto-solo.aiff').name).toBe('Requinto');
    expect(inferInstrument('coro_final.wav').name).toBe('Coro');
    expect(inferInstrument('segunda_guitarra.wav').name).toBe('Guitarra');
    expect(inferInstrument('DUO-L2Mono_01.wav').role).toBe('duet_vocal');
    expect(inferInstrument('bombo_05.R.wav').role).toBe('drums');
    expect(inferInstrument('GUIRA-L2Mono_07.wav').role).toBe('percussion');
    expect(inferInstrument('BASS DANNY G-L2Mono_01.wav').role).toBe('bass');
  });

  it('keeps unknown names cleaned from the filename', () => {
    expect(inferInstrument('pad_espacial_2.wav').name).toBe('Sintetizador');
    expect(inferInstrument('fx_riser.wav').name).toBe('FX');
    expect(inferInstrument('piano_main.wav').name).toBe('Piano / Teclado');
  });
  it('recognizes English Kie stem labels as instruments', () => {
    expect(inferInstrument('Guitar').name).toBe('Guitarra');
    expect(inferInstrument('Drums').role).toBe('drums');
    expect(inferInstrument('Backing Vocals').name).toBe('Coro');
    expect(inferInstrument('Woodwinds').name).toBe('Vientos');
  });
});

describe('uniqueTrackName', () => {
  it('appends a number when the name is taken', () => {
    expect(uniqueTrackName('Voz', ['Voz'])).toBe('Voz 2');
    expect(uniqueTrackName('Voz', ['Voz', 'Voz 2'])).toBe('Voz 3');
  });
});

describe('channelLayout', () => {
  it('labels mono and stereo', () => {
    expect(layoutLabel(channelLayout(1))).toBe('Audio mono');
    expect(layoutLabel(channelLayout(2))).toBe('Audio estéreo');
    expect(layoutLabel(channelLayout(6), 6)).toBe('Audio 6 canales');
  });
});

describe('trackLayoutLabel', () => {
  it('names midi, instrument, aux and bus tracks', () => {
    expect(trackLayoutLabel(makeTrack('Midi 1', 'midi', 'cyan'))).toBe('MIDI');
    expect(trackLayoutLabel(makeTrack('Keys', 'instrument', 'purple'))).toBe('Instrumento virtual');
    expect(trackLayoutLabel(makeTrack('Aux 1', 'bus', 'gray'))).toBe('Auxiliar');
    expect(trackLayoutLabel(makeTrack('Bus 1', 'bus', 'gray'))).toBe('Bus');
    expect(trackLayoutLabel(makeTrack('Audio 1', 'audio', 'cyan'))).toBe('Estéreo');
  });
});

describe('songSessionTitle', () => {
  it('prefers the song title over the prompt', () => {
    expect(songSessionTitle({ title: 'Amor que vuelve', prompt: 'una bachata larga' })).toBe(
      'Amor que vuelve'
    );
  });

  it('uses the first sentence of the prompt when the title is generic', () => {
    expect(songSessionTitle({ title: 'Generated Track', prompt: 'Una bachata romántica. Con güira.' })).toBe(
      'Una bachata romántica'
    );
  });
});

describe('otherStemName', () => {
  it('names the residual stem from the genre or prompt', () => {
    expect(otherStemName({ prompt: 'una bachata bailable' })).toBe('Guitarra');
    expect(otherStemName({ genre: 'deep house' })).toBe('Synth');
    expect(otherStemName({ prompt: 'piano ballad' })).toBe('Piano');
  });
});

describe('splitMixChannels', () => {
  it('keeps a bass-heavy mix on the bass stem', () => {
    const sampleRate = 44100;
    const left = new Float32Array(sampleRate);
    for (let i = 0; i < left.length; i += 1) {
      left[i] = 0.6 * Math.sin((2 * Math.PI * 70 * i) / sampleRate);
    }
    const stems = splitMixChannels(left, left, sampleRate, { instrumental: true, prompt: 'bachata' });
    expect(stems.some((stem) => stem.name === 'Bajo')).toBe(true);
    expect(stems.some((stem) => stem.name === 'Voz')).toBe(false);
  });

  it('keeps the summed stems below clipping', () => {
    const sampleRate = 8000;
    const left = new Float32Array(sampleRate);
    const right = new Float32Array(sampleRate);
    for (let i = 0; i < left.length; i += 1) {
      const t = i / sampleRate;
      left[i] = 0.95 * Math.sin(2 * Math.PI * 90 * t) + 0.4 * Math.sin(2 * Math.PI * 800 * t);
      right[i] = 0.95 * Math.sin(2 * Math.PI * 90 * t) + 0.35 * Math.sin(2 * Math.PI * 1200 * t);
    }
    const stems = splitMixChannels(left, right, sampleRate, { prompt: 'bachata' });
    let sumPeak = 0;
    for (let i = 0; i < left.length; i += 1) {
      let mixL = 0;
      let mixR = 0;
      for (const stem of stems) {
        mixL += stem.left[i] ?? 0;
        mixR += stem.right[i] ?? 0;
      }
      sumPeak = Math.max(sumPeak, Math.abs(mixL), Math.abs(mixR));
    }
    expect(sumPeak).toBeLessThanOrEqual(0.51);
  });
});

