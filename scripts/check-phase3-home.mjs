import fs from 'node:fs/promises';

const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
const required = [
  'Recently added',
  'id="recently-added-list"',
  'id="archiveSnapshot"',
  'data-added-at="2026-09-20"',
  'width="1536" height="1152"'
];
const missing = required.filter(token => !html.includes(token));
if (missing.length) {
  missing.forEach(token => console.error(`Missing Phase 3 homepage token: ${token}`));
  process.exit(1);
}
console.log('Focused Phase 3 homepage check passed.');
