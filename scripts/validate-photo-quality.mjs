import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImageDimensions } from './lib/image-dimensions.mjs';

// Catches photos that will look broken or pixelated on the public site:
//   1. JPEGs that are truncated (no end-of-image marker).
//   2. SVG wrappers whose embedded base64 image is not strictly valid
//      (browsers reject it and show a broken-image icon).
//   3. Archive photos under assets/event-photos narrower than MIN_WIDTH,
//      which race-memory.js can only show as a small stand-in.
//
// KNOWN_ISSUES lists photos already waiting on a replacement original. Remove an
// entry once the full-size file is in place; a stale entry also fails, so the list
// cannot silently outlive the problem.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN_WIDTH = 480;
const KNOWN_ISSUES = new Map([
  // Add [path, 'low-res' | 'truncated'] entries here only while a replacement original is pending.
]);

const problems = [];
const found = new Map();

async function walk(dir) {
  const entries = await fs.readdir(path.join(root, dir), { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(rel));
    else if (/\.(jpe?g|webp|png|svg)$/i.test(entry.name)) files.push(rel);
  }
  return files;
}

const strictBase64 = value => /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length % 4 === 0;

for (const rel of [...await walk('assets/event-photos'), ...await walk('media')]) {
  const file = path.join(root, rel);
  const ext = path.extname(rel).toLowerCase();

  if (ext === '.jpg' || ext === '.jpeg') {
    const buffer = await fs.readFile(file);
    let end = buffer.length;
    while (end > 0 && buffer[end - 1] === 0) end -= 1;
    if (end < 2 || buffer[end - 2] !== 0xff || buffer[end - 1] !== 0xd9) found.set(rel, 'truncated');
  }

  if (ext === '.svg') {
    const text = await fs.readFile(file, 'utf8');
    for (const match of text.matchAll(/href=["']data:image\/[a-z0-9.+-]+;base64,([^"']*)["']/gi)) {
      if (!strictBase64(match[1])) problems.push(`${rel}: embedded base64 image is malformed (length ${match[1].length}); browsers will show a broken image.`);
    }
  }

  if (rel.startsWith('assets/event-photos/') && !found.has(rel)) {
    const size = await readImageDimensions(file);
    if (size && size.width < MIN_WIDTH) found.set(rel, 'low-res');
  }
}

for (const [rel, issue] of found) {
  if (KNOWN_ISSUES.get(rel) === issue) continue;
  problems.push(issue === 'truncated'
    ? `${rel}: JPEG is truncated (no end-of-image marker). Re-export the original.`
    : `${rel}: only ${(await readImageDimensions(path.join(root, rel)))?.width}px wide; archive photos need at least ${MIN_WIDTH}px.`);
}
for (const [rel, issue] of KNOWN_ISSUES) {
  if (found.get(rel) !== issue) problems.push(`${rel}: listed in KNOWN_ISSUES as ${issue}, but that is no longer true. Remove the entry.`);
}

if (problems.length) {
  console.error(`Photo quality check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Photo quality check passed (${KNOWN_ISSUES.size} known photos awaiting replacement originals).`);
