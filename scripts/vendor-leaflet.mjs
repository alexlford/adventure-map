import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules', 'leaflet', 'dist');
const target = path.join(root, 'vendor', 'leaflet');

const files = ['leaflet.css', 'leaflet.js'];

await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(target, { recursive: true });

for (const file of files) {
  await fs.copyFile(path.join(source, file), path.join(target, file));
}

await fs.cp(path.join(source, 'images'), path.join(target, 'images'), { recursive: true });

console.log('Vendored Leaflet 1.9.4 runtime assets from the locked npm package.');
