import { describe, expect, it } from 'vitest';

import { inspectTracks } from './session-inventory';
import {
  applySketchDefaults,
  getLastLyrics,
  isPartRequest,
  missingArrangeFields,
  parseArrangeIntent,
  parseArrangeReply,
  rememberLyrics,
  resetSketch,
  voiceMountedMessage,
  wantsContinueEditing,
  wantsGrooveChange,
  wantsLyrics
} from './song-sketch';
import { makeTrack } from '$lib/core/track';

describe('empty arrange', () => {
  it('sees lanes without clips as empty', () => {
    const inventory = inspectTracks(
      [makeTrack('Audio 1', 'audio', 'blue'), makeTrack('Midi 1', 'midi', 'purple')],
      null
    );
    expect(inventory.allEmpty).toBe(true);
    expect(inventory.empty.map((track) => track.name)).toEqual(['Audio 1', 'Midi 1']);
  });
});

describe('bachata arrange intent', () => {
  it('reads bajo, duration, key and genre, and asks for tempo and style', () => {
    resetSketch();
    const text =
      'quiero un bajo en todo el track durante 3 minutos con un ritmo de bachata en do mayor con escala de la menor';
    expect(isPartRequest(text)).toBe(true);
    const intent = parseArrangeIntent(text);
    expect(intent.role).toBe('bass');
    expect(intent.durationMinutes).toBe(3);
    expect(intent.key).toBe('C');
    expect(intent.relative).toBe('A');
    expect(intent.genre).toBe('bachata');
    expect(missingArrangeFields(applySketchDefaults(intent))).toEqual(['bpm', 'style']);
  });

  it('reads a follow-up tempo and bachata style', () => {
    const extra = parseArrangeReply('130 bpm bailable');
    expect(extra.bpm).toBe(130);
    expect(extra.style).toBe('bailable');
  });

  it('copies the bass notes when asking for segunda', () => {
    const intent = parseArrangeIntent('agregale la segunda guitarra en las mismas notas del bajo');
    expect(intent.role).toBe('segunda');
    expect(intent.copyFrom).toBe('bass');
  });

  it('detects continue editing and lyrics', () => {
    expect(wantsContinueEditing('vamos a seguir editando')).toBe(true);
    expect(wantsLyrics('vamos a hacer una voz con una letra de despedida')).toBe(true);
    expect(wantsLyrics('quiero la voz')).toBe(true);
    expect(wantsLyrics('agrega la voz')).toBe(true);
    expect(wantsLyrics('sube la voz')).toBe(false);
    expect(wantsLyrics('borra la voz')).toBe(false);
  });

  it('detects a style rewrite without a full part sentence', () => {
    expect(wantsGrooveChange('hazlo bailable')).toBe(true);
    expect(wantsGrooveChange('haz el bajo bolero')).toBe(true);
    expect(wantsGrooveChange('quiero un bajo en bachata')).toBe(false);
  });

  it('keeps the drafted lyric so the voice mount can reprint it', () => {
    resetSketch();
    rememberLyrics('En esta noche tu nombre me encuentra');
    expect(getLastLyrics()).toContain('tu nombre me encuentra');
    expect(voiceMountedMessage(getLastLyrics())).toContain('tu nombre me encuentra');
    expect(voiceMountedMessage(getLastLyrics())).not.toMatch(/no invento un cantante/i);
    resetSketch();
    expect(getLastLyrics()).toBe('');
  });
});
