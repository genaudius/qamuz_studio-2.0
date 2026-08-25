import { describe, expect, it } from 'vitest';

import { filesFromDataTransfer } from './import-session';

describe('filesFromDataTransfer', () => {
  it('falls back to the file list when there are no directory entries', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'bajo.wav', { type: 'audio/wav' });
    const data = {
      items: [],
      files: [file]
    } as unknown as DataTransfer;

    const out = await filesFromDataTransfer(data);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('bajo.wav');
  });
});
