import fs from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('Usage: node scripts/materialize-route-compatibility.mjs <route-json> [...]');
  process.exit(2);
}

let changed = 0;
for (const path of paths) {
  const payload = JSON.parse(fs.readFileSync(path, 'utf8'));
  let fileChanged = false;

  for (const route of payload.routes || []) {
    if (!Array.isArray(route.linesBrotliBase64) || !route.linesBrotliBase64.length) continue;
    if (Array.isArray(route.lines) && route.lines.length) {
      throw new Error(`${path}: ${route.id || '(unnamed route)'} has both lines and linesBrotliBase64`);
    }

    const lines = route.linesBrotliBase64.map((encoded, index) => {
      const line = brotliDecompressSync(Buffer.from(encoded, 'base64')).toString('utf8');
      if (!line) throw new Error(`${path}: ${route.id || '(unnamed route)'} line ${index} decompressed empty`);
      return line;
    });

    route.lines = lines;
    delete route.linesBrotliBase64;
    fileChanged = true;
    console.log(`${path}: materialized ${route.id || '(unnamed route)'} as ${lines.length} plain polyline line(s).`);
  }

  if (!fileChanged) {
    console.log(`${path}: already browser-compatible.`);
    continue;
  }

  fs.writeFileSync(path, `${JSON.stringify(payload)}\n`);
  changed += 1;
}

console.log(`Materialized ${changed} route source file(s).`);