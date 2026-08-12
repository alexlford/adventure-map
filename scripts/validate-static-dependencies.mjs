import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const checked = new Set();

const cleanRoutes = new Map([
  ['/', 'index.html'],
  ['/explore', 'activities.html'],
  ['/map', 'map.html'],
  ['/stories', 'adventures.html'],
  ['/timeline', 'timeline.html'],
  ['/races', 'races.html'],
  ['/summits', 'summits.html'],
  ['/skiing', 'skiing.html'],
  ['/nordic', 'nordic.html'],
  ['/mtb', 'mountain-biking.html']
]);

const ignoredSchemes = /^(?:https?:|mailto:|tel:|data:|javascript:|blob:|webcal:)/i;
const assetLike = /\.(?:html?|m?js|css|json|geojson|png|jpe?g|gif|webp|svg|ico|xml|txt|webmanifest|pdf)$/i;

async function exists(rel) {
  try { await fs.access(path.join(root, rel)); return true; }
  catch { return false; }
}

function stripRef(raw) {
  return String(raw || '').trim().replace(/^['"]|['"]$/g, '').split('#')[0].split('?')[0];
}

async function verify(raw, source, kind) {
  const value = stripRef(raw);
  if (!value || value === '.' || value.startsWith('#') || ignoredSchemes.test(value) || value.startsWith('//')) return;
  if (value.includes('${') || value.includes('{{') || value.includes('`')) return;
  if (value.startsWith('/record/')) return;

  let target = value;
  if (cleanRoutes.has(value.replace(/\/$/, '') || '/')) target = cleanRoutes.get(value.replace(/\/$/, '') || '/');
  else if (value.startsWith('/')) target = value.slice(1);
  else target = path.normalize(path.join(path.dirname(source), value));

  if (!target || target.startsWith('..') || path.isAbsolute(target)) {
    problems.push(`${source}: ${kind} escapes repository: ${raw}`);
    return;
  }

  const key = `${source}\0${kind}\0${target}`;
  if (checked.has(key)) return;
  checked.add(key);

  if (await exists(target)) return;

  // Extensionless local references are treated as internal routes and must resolve.
  if (!assetLike.test(target) && !path.extname(target)) {
    const candidates = [`${target}.html`, path.join(target, 'index.html')];
    for (const candidate of candidates) if (await exists(candidate)) return;
  }
  problems.push(`${source}: missing local ${kind} ${raw} → ${target}`);
}

async function walk(dir = root) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['.git', 'node_modules', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const files = await walk();
for (const full of files) {
  const rel = path.relative(root, full).replaceAll(path.sep, '/');
  const ext = path.extname(rel).toLowerCase();
  if (!['.html', '.js', '.mjs', '.css'].includes(ext)) continue;
  const text = await fs.readFile(full, 'utf8');

  if (ext === '.html') {
    for (const match of text.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) await verify(match[1], rel, 'HTML dependency');
  }
  if (ext === '.css') {
    for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) await verify(match[1], rel, 'CSS dependency');
  }
  if (ext === '.js' || ext === '.mjs' || ext === '.html') {
    for (const match of text.matchAll(/\bfetch\(\s*["']([^"']+)["']/g)) await verify(match[1], rel, 'fetch target');
    for (const match of text.matchAll(/\.(?:src|href)\s*=\s*["']([^"']+)["']/g)) await verify(match[1], rel, 'runtime dependency');
  }
}

console.log(`Static dependency references checked: ${checked.size}`);
if (problems.length) {
  problems.forEach(problem => console.error(`ERROR ${problem}`));
  process.exitCode = 1;
} else {
  console.log('Static dependency validation passed.');
}
