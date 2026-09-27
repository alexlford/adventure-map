import fs from 'node:fs/promises';
import path from 'node:path';
import { siteRoutes } from './lib/site-routes.mjs';

const failures = [];
const polish = await fs.readFile('polish.css', 'utf8');

if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)/i.test(polish)) {
  failures.push('polish.css is missing prefers-reduced-motion handling.');
}
if (!/min-height:\s*44px/i.test(polish)) {
  failures.push('polish.css is missing the 44px mobile touch-target floor.');
}
if (!/@media\s*\(pointer:\s*coarse\)/i.test(polish)) {
  failures.push('polish.css is missing coarse-pointer targeting.');
}

const payload = JSON.parse(await fs.readFile('data/public-records.json', 'utf8'));
const publicFiles = new Set();
for (const route of siteRoutes) {
  publicFiles.add(route.generated ? path.join(route.dir, 'index.html') : route.source);
}
for (const record of payload.records || []) {
  publicFiles.add(path.join('record', record.slug, 'index.html'));
}

const maxPublicHtmlBytes = 200_000;
for (const file of publicFiles) {
  const html = await fs.readFile(file, 'utf8');
  const matches = [...html.matchAll(/<link\b[^>]*data-global-polish=["']true["'][^>]*>/gi)];
  if (matches.length !== 1) {
    failures.push(`${file}: expected exactly one global polish stylesheet link, found ${matches.length}.`);
  } else {
    const href = matches[0][0].match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    const resolved = path.normalize(path.join(path.dirname(file), href));
    if (resolved !== path.normalize('polish.css')) {
      failures.push(`${file}: global polish stylesheet resolves to ${resolved}, not polish.css.`);
    }
  }
  const bytes = Buffer.byteLength(html);
  if (bytes > maxPublicHtmlBytes) failures.push(`${file}: ${bytes} bytes exceeds ${maxPublicHtmlBytes}-byte HTML budget.`);
}

const budgets = {
  'section.css': 32_000,
  'landing.css': 24_000,
  'polish.css': 8_000,
  'shared.js': 48_000,
  'record-renderer.js': 80_000,
  'styles.css': 32_000,
  'app.js': 48_000,
  'adventure-map-api.js': 24_000,
  'map-ui-polish.js': 24_000,
  'map-route-detail.js': 24_000
};

for (const [file, limit] of Object.entries(budgets)) {
  const stat = await fs.stat(file);
  if (stat.size > limit) failures.push(`${file}: ${stat.size} bytes exceeds ${limit}-byte performance budget.`);
}

if (failures.length) {
  console.error(`Phase 4 polish validation failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 4 polish validation passed for ${publicFiles.size} public documents and ${Object.keys(budgets).length} critical assets.`);
