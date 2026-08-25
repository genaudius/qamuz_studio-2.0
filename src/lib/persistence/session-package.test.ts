import { describe, expect, it } from 'vitest';

import { isZipBytes, unzipStore, zipStore } from './zip';
import { masterSessionDocument, safeSessionName, SESSION_EXTENSION } from './session-package';

describe('session package names', () => {
  it('sanitizes folder names', () => {
    expect(safeSessionName('QAMUZ / Bachata?')).toBe('QAMUZ - Bachata-');
    expect(safeSessionName('   ')).toBe('QAMUZ-Session');
  });

  it('writes a master file that points at the Pro Tools-style folders', () => {
    const json = JSON.parse(masterSessionDocument('Amor que vuelve'));
    expect(json.format).toBe('qamuz-session');
    expect(json.extension).toBe(`.${SESSION_EXTENSION}`);
    expect(json.folders.audio).toBe('Audio Files');
    expect(json.folders.midi).toBe('MIDI Files');
  });
});

describe('zip store', () => {
  it('roundtrips files without compression', () => {
    const packed = zipStore([
      { name: 'project.json', data: new TextEncoder().encode('{"ok":true}') },
      { name: 'Audio Files/Bajo.wav', data: new Uint8Array([1, 2, 3, 4]) }
    ]);
    expect(isZipBytes(packed)).toBe(true);
    const entries = unzipStore(packed);
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe('project.json');
    expect(new TextDecoder().decode(entries[0].data)).toBe('{"ok":true}');
    expect([...entries[1].data]).toEqual([1, 2, 3, 4]);
  });
});
