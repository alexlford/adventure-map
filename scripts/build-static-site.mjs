import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = path.resolve(root, outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : 'dist');
const SITE = 'https://adventures.alexlford.com';

const excludedTop = new Set(['.git', '.github', 'node_modules', 'dist', '.ci-site', '.ci-public-data', 'scripts', 'tests', 'docs']);
const excludedFiles = new Set(['package.json', 'package-lock.json']);
const cleanPages = {
  map: 'map.html',
  explore: 'activities.html',
  stories: 'adventures.html',
  timeline: 'timeline.html',
  races: 'races.html',
  summits: 'summits.html',
  skiing: 'skiing.html',
  nordic: 'nordic.html',
  mtb: 'mountain-biking.html',
};

const slugify = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
const recordSlug = record => record.slug || [record.date || record.year, record.name].filter(Boolean).map(slugify).filter(Boolean).join('-') || slugify(record.id);
const attr = value => String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const displayDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
};
const recordType = record => {
  if (record.kind === 'summit') return 'Summit';
  if (record.kind === 'race') {
    if (record.discipline === 'marathon') return 'Marathon';
    if (record.discipline === 'trail') return 'Trail race';
    if (record.discipline === 'nordic') return 'Nordic ski race';
    if (record.discipline === 'relay') return 'Relay';
    if (record.discipline === 'mountain-bike') return 'Mountain bike race';
    return 'Race';
  }
  if (record.kind === 'outing') return record.discipline === 'nordic' ? 'Nordic outing' : record.discipline === 'mountain-bike' ? 'Mountain bike outing' : 'Outing';
  if (record.kind === 'event') return 'Event';
  if (record.discipline === 'ski-objective') return 'Ski objective';
  if (record.discipline === 'mountain-loop') return 'Mountain adventure';
  if (record.discipline === 'trek') return 'Trek / traverse';
  return 'Adventure Story';
};

function publicHtml(html) {
  let output = html;
  if (!/<base\b/i.test(output)) output = output.replace(/<head([^>]*)>/i, '<head$1><base href="/">');
  if (!output.includes('ADVENTURE_PUBLIC_BUILD')) output = output.replace(/<\/head>/i, '<script>window.ADVENTURE_PUBLIC_BUILD=true;</script></head>');
  return output;
}

function recordHtml(template, record) {
  const slug = recordSlug(record);
  const canonical = `${SITE}/record/${encodeURIComponent(slug)}/`;
  const title = `${record.name} | Alex Ford Adventures`;
  const description = [recordType(record), record.location, displayDate(record.date), record.note].filter(Boolean).join(' · ');
  let html = publicHtml(template).replace(/<title>[^<]*<\/title>/i, `<title>${attr(title)}</title>`);
  const metadata = [
    `<meta name="description" content="${attr(description)}">`,
    `<link rel="canonical" href="${attr(canonical)}">`,
    '<meta property="og:site_name" content="Alex Ford Adventures">',
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    '<meta property="og:type" content="article">',
    `<meta property="og:url" content="${attr(canonical)}">`,
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${attr(title)}">`,
    `<meta name="twitter:description" content="${attr(description)}">`,
  ].join('');
  html = html.replace(/<\/head>/i, `${metadata}</head>`);
  return { slug, html };
}

async function copyPublicTree() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.cp(root, outDir, {
    recursive: true,
    filter(source) {
      const rel = path.relative(root, source);
      if (!rel) return true;
      const parts = rel.split(path.sep);
      if (excludedTop.has(parts[0])) return false;
      if (parts.length === 1 && excludedFiles.has(parts[0])) return false;
      return true;
    },
  });
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');
}

async function transformRootHtml() {
  const entries = await fs.readdir(outDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.html') || entry.name === '404.html') continue;
    const target = path.join(outDir, entry.name);
    await fs.writeFile(target, publicHtml(await fs.readFile(target, 'utf8')));
  }
}

async function generateCleanPages() {
  for (const [route, file] of Object.entries(cleanPages)) {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    const dir = path.join(outDir, route);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), publicHtml(source));
  }
}

async function generateRecords() {
  const compiledPath = path.join(outDir, 'data', 'public-records.json');
  const compiled = JSON.parse(await fs.readFile(compiledPath, 'utf8'));
  const template = await fs.readFile(path.join(root, 'detail.html'), 'utf8');
  const seen = new Set();
  for (const record of compiled.records || []) {
    const generated = recordHtml(template, record);
    if (!generated.slug) throw new Error(`Cannot generate record page for ${record.id || record.name}`);
    if (seen.has(generated.slug)) throw new Error(`Duplicate generated record slug: ${generated.slug}`);
    seen.add(generated.slug);
    const dir = path.join(outDir, 'record', generated.slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), generated.html);
  }
  if (Number(compiled.recordCount) !== seen.size) throw new Error(`Generated ${seen.size} record pages for ${compiled.recordCount} compiled records`);
  return seen.size;
}

await copyPublicTree();
const compile = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-public-data.mjs'), '--out-dir', path.join(outDir, 'data')], { cwd: root, stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
await transformRootHtml();
await generateCleanPages();
const recordCount = await generateRecords();
console.log(`Static site generated at ${path.relative(root, outDir) || '.'}.`);
console.log(`Generated ${Object.keys(cleanPages).length} clean section documents and ${recordCount} record documents.`);
