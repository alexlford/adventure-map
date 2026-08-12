import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteRoutes, generatedRoutes } from './lib/site-routes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const checked = new Set();
let localLeafletReferences = 0;

const cleanRoutes = new Map(siteRoutes.map(route => [route.path, route.source]));
const generatedPublicationDirs = new Set(['record',...generatedRoutes.map(route=>route.dir)]);
const ignoredSchemes = /^(?:https?:|mailto:|tel:|data:|javascript:|blob:|webcal:)/i;
const assetLike = /\.(?:html?|m?js|css|json|geojson|png|jpe?g|gif|webp|svg|ico|xml|txt|webmanifest|pdf)$/i;
const remoteLeaflet = /https?:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\/[^"'\s>]*leaflet/i;
const localLeaflet = /(?:^|\/)vendor\/leaflet\/(?:leaflet\.css|leaflet\.js)$/i;

async function exists(rel) {
  try { await fs.access(path.join(root, rel)); return true; }
  catch { return false; }
}

function stripRef(raw) {
  return String(raw || '').trim().replace(/^['"]|['"]$/g, '').split('#')[0].split('?')[0];
}

function validateLeafletRuntime(text, source) {
  if (remoteLeaflet.test(text)) {
    problems.push(`${source}: remote Leaflet runtime dependency is not allowed; use vendor/leaflet assets from the locked npm package.`);
  }
}

async function verify(raw, source, kind) {
  const value = stripRef(raw);
  if (!value || value === '.' || value.startsWith('#') || ignoredSchemes.test(value) || value.startsWith('//')) return;
  if (value.includes('${') || value.includes('{{') || value.includes('`')) return;
  if (value.startsWith('/record/')) return;

  if (localLeaflet.test(value)) localLeafletReferences += 1;

  let target = value;
  const cleanKey = value.replace(/\/$/, '') || '/';
  if (cleanRoutes.has(cleanKey)) target = cleanRoutes.get(cleanKey);
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
    const atRoot = dir === root;
    if (['.git','.github','node_modules','scripts','tests','test-results','playwright-report'].includes(entry.name)) continue;
    // Generated clean-path documents have their own deterministic validator. Keep
    // source-owned direct routes such as /world-majors in this dependency scan.
    if (atRoot && generatedPublicationDirs.has(entry.name)) continue;
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
  if (!['.html','.js','.mjs','.css'].includes(ext)) continue;
  const text = await fs.readFile(full, 'utf8');

  if (ext === '.html') {
    validateLeafletRuntime(text, rel);
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

console.log(`Source dependency references checked: ${checked.size}`);
console.log(`Local Leaflet runtime references checked: ${localLeafletReferences}`);
if (problems.length) {
  problems.forEach(problem => console.error(`ERROR ${problem}`));
  process.exitCode = 1;
} else {
  console.log('Source dependency validation passed.');
}
