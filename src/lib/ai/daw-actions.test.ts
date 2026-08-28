import { describe, expect, it } from 'vitest';

import { inferDawAction } from './daw-actions';
import { mixStyleFromPrompt } from './mix-agent';

describe('inferDawAction mix', () => {
  it('routes mix requests to the DAW mixer without GenAudius', () => {
    expect(inferDawAction('mezclar')?.name).toBe('mix_session');
    expect(inferDawAction('Mezclar las pistas')?.name).toBe('mix_session');
    expect(inferDawAction('Analiza la sesión y prepara una mezcla profesional.')?.name).toBe(
      'mix_session'
    );
    expect(inferDawAction('mézclame esto')?.name).toBe('mix_session');
    expect(inferDawAction('mix the session')?.name).toBe('mix_session');
    expect(inferDawAction('cambia esto')?.name).toBe('edit_selection');
    expect(inferDawAction('agrega un coro aquí')?.name).toBe('edit_selection');
    expect(inferDawAction('agrega un piano')?.name).toBe('add_instrument');
    expect(inferDawAction('agrega un bajo a la sección')?.name).toBe('add_instrument');
    expect(inferDawAction('agrégale un bajo a esta seccion')?.name).toBe('add_instrument');
    expect(inferDawAction('ponle un bajo aquí')?.name).toBe('add_instrument');
    expect(inferDawAction('genera un bajo en esta parte')?.name).toBe('add_instrument');
  });

  it('does not treat a new song request as a mix', () => {
    expect(inferDawAction('crea una canción con bajo')?.name).not.toBe('add_instrument');
    expect(inferDawAction('crea una canción con una mezcla de salsa y bachata')?.name).not.toBe(
      'mix_session'
    );
  });

  it('creates midi, instrument, aux and bus tracks', () => {
    expect(inferDawAction('añade una pista midi')).toEqual({
      name: 'add_track',
      args: { type: 'midi' }
    });
    expect(inferDawAction('añade un instrumento virtual')?.args).toMatchObject({ type: 'instrument' });
    expect(inferDawAction('añade una pista auxiliar')?.args).toMatchObject({ type: 'aux' });
    expect(inferDawAction('añade una pista bus')?.args).toMatchObject({ type: 'bus' });
    expect(inferDawAction('añade una pista de audio')?.args).toMatchObject({ type: 'audio' });
  });

  it('routes bar-exact alignment to the Conductor snap', () => {
    expect(inferDawAction('alinea al compás exacto')?.name).toBe('snap_to_bar');
    expect(inferDawAction('pon el golpe en el compás')?.name).toBe('snap_to_bar');
    expect(inferDawAction('entra en el compás 2|2')?.name).toBe('snap_to_bar');
  });
});

describe('mixStyleFromPrompt', () => {
  it('keeps an airy default and follows the user request', () => {
    expect(mixStyleFromPrompt('').headroom).toBeLessThan(0.65);
    expect(mixStyleFromPrompt('mézclame suave y con aire').headroom).toBeLessThan(
      mixStyleFromPrompt('mézclame potente y cerca').headroom
    );
    expect(mixStyleFromPrompt('sube la voz').vocal).toBeGreaterThan(1);
  });
});
