/**
 * Uncompressed ZIP (STORE). Used when the browser cannot write a folder, so the
 * `.qamuzsess` master file is still a single download that Abrir can unpack.
 */

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let crc = i;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  CRC_TABLE[i] = crc >>> 0;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function isZipBytes(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function zipStore(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name.replace(/\\/g, '/'));
    const data = entry.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    writeU32(localView, 0, 0x04034b50);
    writeU16(localView, 4, 20);
    writeU32(localView, 14, crc);
    writeU32(localView, 18, data.length);
    writeU32(localView, 22, data.length);
    writeU16(localView, 26, name.length);
    local.set(name, 30);
    locals.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    writeU32(centralView, 0, 0x02014b50);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU32(centralView, 16, crc);
    writeU32(centralView, 20, data.length);
    writeU32(centralView, 24, data.length);
    writeU16(centralView, 28, name.length);
    writeU32(centralView, 42, offset);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralBlob = concat(centrals);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  writeU32(eocdView, 0, 0x06054b50);
  writeU16(eocdView, 8, entries.length);
  writeU16(eocdView, 10, entries.length);
  writeU32(eocdView, 12, centralBlob.length);
  writeU32(eocdView, 16, offset);

  return concat([...locals, centralBlob, eocd]);
}

function readU16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function readU32(data: Uint8Array, offset: number): number {
  return (
    (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0
  );
}

export function unzipStore(data: Uint8Array): ZipEntry[] {
  if (!isZipBytes(data)) throw new Error('No es un archivo de sesión QAMUZ');
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= data.length) {
    if (readU32(data, offset) !== 0x04034b50) break;
    const nameLength = readU16(data, offset + 26);
    const extraLength = readU16(data, offset + 28);
    const compressed = readU32(data, offset + 18);
    const method = readU16(data, offset + 8);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(data.subarray(nameStart, nameStart + nameLength));
    const payloadStart = nameStart + nameLength + extraLength;
    if (method !== 0) throw new Error(`La sesión usa ZIP comprimido (${method}); ábrela como carpeta`);
    entries.push({ name, data: data.slice(payloadStart, payloadStart + compressed) });
    offset = payloadStart + compressed;
  }

  return entries;
}
