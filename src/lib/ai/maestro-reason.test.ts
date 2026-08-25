import { describe, expect, it } from 'vitest';

import { deleteWarning, interpretMaestroTurn, isAffirmative, isNegative, namedTrackHint, wantsDeleteTrack } from './maestro-reason';
import { resetSketch } from './song-sketch';

describe('Maestro track reasoning', () => {
  it('detects delete requests that use the selected track', () => {
    expect(wantsDeleteTrack('borrame el track')).toBe(true);
    expect(wantsDeleteTrack('borra esta pista')).toBe(true);
    expect(wantsDeleteTrack('elimina el bajo')).toBe(true);
    expect(wantsDeleteTrack('bórralo')).toBe(true);
    expect(wantsDeleteTrack('bórrala')).toBe(true);
    expect(wantsDeleteTrack('baja el volumen del bajo')).toBe(false);
    expect(wantsDeleteTrack('mezclar')).toBe(false);
  });

  it('reads a named instrument from the delete sentence', () => {
    expect(namedTrackHint('borra el bajo')).toBe('bajo');
    expect(namedTrackHint('borrame el track')).toBe('');
  });

  it('reads yes and no for the delete warning', () => {
    expect(isAffirmative('sí')).toBe(true);
    expect(isAffirmative('seguro')).toBe(true);
    expect(isNegative('no')).toBe(true);
    expect(isNegative('déjalo')).toBe(true);
  });

  it('asks to confirm with the instrument name', () => {
    expect(deleteWarning({ name: 'Bajo' } as never)).toContain('borrar el track del bajo');
    expect(deleteWarning({ name: 'Voz' } as never)).toContain('borrar el track de la voz');
  });

  it('writes lyrics and mounts the voice track in the same turn', () => {
    resetSketch();
    const turn = interpretMaestroTurn('quiero la voz con una letra de despedida');
    expect(turn?.kind).toBe('command');
    if (turn?.kind === 'command') {
      expect(turn.name).toBe('mount_voice');
      expect(String(turn.args.lyrics)).toContain('Canto 1');
      expect(turn.actions?.some((action) => action.id === 'sing_song')).toBe(true);
      expect(turn.actions?.some((action) => action.id === 'compose_chat')).toBe(true);
    }
  });

  it('switches to MIDI arrange mode', () => {
    resetSketch();
    const turn = interpretMaestroTurn('vamos a hacer un arreglo en midi');
    expect(turn?.kind).toBe('answer');
    if (turn?.kind === 'answer') {
      expect(turn.message.toLowerCase()).toContain('midi');
      expect(turn.chips).toContain('Arreglo MIDI');
    }
  });

  it('asks before writing MIDI while GenAudius mode is on', () => {
    resetSketch();
    interpretMaestroTurn('esto lo compone GenAudius');
    const turn = interpretMaestroTurn('quiero un bajo en todo el track con ritmo de bachata');
    expect(turn?.kind).toBe('confirm');
    if (turn?.kind === 'confirm') {
      expect(turn.pending.kind).toBe('arrange');
      expect(turn.actions.some((action) => action.id === 'mode_midi_write')).toBe(true);
    }
  });

  it('shows the bass style card', () => {
    resetSketch();
    const turn = interpretMaestroTurn('adoctrina el bajo a bachata bailable');
    expect(turn?.kind).toBe('answer');
    if (turn?.kind === 'answer') {
      expect(turn.message).toContain('Bajo · bachata');
      expect(turn.message).toContain('paloma');
    }
  });
});
