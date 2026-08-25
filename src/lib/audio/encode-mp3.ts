/**
 * Stereo MP3 encoder at a fixed bitrate. WAV stays the lossless bounce;
 * this is for a 320 kbps delivery file.
 */

type LameNs = {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array;
    flush: () => Int8Array;
  };
};

function floatToInt16(channel: Float32Array): Int16Array {
  const out = new Int16Array(channel.length);
  for (let i = 0; i < channel.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, channel[i] ?? 0));
    out[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return out;
}

export async function encodeMp3(buffer: AudioBuffer, bitrate = 320): Promise<Uint8Array> {
  const lame = (await import('lamejs')) as unknown as LameNs & { default?: LameNs };
  const ns = lame.default ?? lame;
  const encoder = new ns.Mp3Encoder(2, buffer.sampleRate, bitrate);
  const left = floatToInt16(buffer.getChannelData(0));
  const right = floatToInt16(buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0));
  const block = 1152;
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < left.length; offset += block) {
    const end = Math.min(left.length, offset + block);
    const chunk = encoder.encodeBuffer(left.subarray(offset, end), right.subarray(offset, end));
    if (chunk.length) parts.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail.buffer, tail.byteOffset, tail.byteLength));
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
    type: mime
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
