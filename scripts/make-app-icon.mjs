// Rasterizes the Musio app icon to the 1024px PNG that `tauri icon` expects.
// Run with: npm run icons

import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../qamuz_studio 1.0/MusioAppIcon.svg');
const outDir = resolve(here, '../assets');
const out = resolve(outDir, 'app-icon.png');

await mkdir(outDir, { recursive: true });

const svg = await readFile(source);
await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile(out);

console.log(`Wrote ${out}`);
