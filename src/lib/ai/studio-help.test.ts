import { describe, expect, it } from 'vitest';

import { matchHelpTopic, wantsHelp } from './studio-help';

describe('Studio help', () => {
  it('treats enviar vs crear as the chat vs GenAudius split', () => {
    expect(wantsHelp('cual es la diferencia entre enviar y crear')).toBe(true);
    expect(matchHelpTopic('que es enviar')?.id).toBe('send-create');
    expect(matchHelpTopic('explica crear')?.id).toBe('send-create');
    expect(wantsHelp('mezclame suave')).toBe(false);
  });

  it('maps mixer and arrange questions', () => {
    expect(matchHelpTopic('qué es el mixer')?.id).toBe('mix');
    expect(matchHelpTopic('como funciona el arrange')?.id).toBe('arrange');
    expect(matchHelpTopic('como importo stems')?.id).toBe('arrange');
  });
});
