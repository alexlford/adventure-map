import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = path.resolve(root, outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : 'dist');
const SITE = (process.env.SITE_URL || 'https://adventures.alexlford.com').replace(/\/$/, '');

const excludedTop = new Set(['.git', '.github', 'node_modules', 'dist', '.ci-site', '.ci-public-data', 'scripts', 'tests', 'static-tests', 'docs']);
const excludedFiles = new Set(['package.json', 'package-lock.json', 'playwright.config.mjs', 'playwright.static.config.mjs']);
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
const pageDescriptions = {
  map: 'Explore Alex Ford Adventures by place across races, summits, skiing, Nordic skiing, mountain biking, and memorable outdoor objectives.',
  explore: 'Explore Alex Ford Adventures by activity, including races, summits, skiing, Nordic skiing, mountain biking, and the full timeline.',
  stories: 'Curated stories from Alex Ford Adventures: mountain objectives, ski days, race challenges, traverses, and outdoor chapters worth remembering.',
  timeline: 'A chronological timeline of Alex Ford Adventures across racing, summits, skiing, Nordic skiing, mountain biking, and larger outdoor stories.',
  races: 'Alex Ford race history across road races, marathons, trail races, relays, Nordic races, mountain-bike races, and World Marathon Majors.',
  summits: 'Alex Ford summit history with elevations, regions, outing context, and linked mountain objectives.',
  skiing: 'Alex Ford alpine skiing logbook with resorts, ski days, destinations, and notable ski objectives.',
  nordic: 'Alex Ford Nordic skiing history across trail systems, races, named events, and standout recreational days.',
  mtb: 'Alex Ford mountain-bike history with day-level MTB and downhill classifications, locations, routes, and outings.',
};
const fileToCleanPath = new Map([
  ['index.html', '/'],
  ...Object.entries(cleanPages).map(([route, file]) => [file, `/${route}/`]),
]);

const attr = value => String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xml = attr;
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

function removeStaticMeta(html) {
  return html
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>\s*/gi, '')
    .replace(/<meta\b[^>]*name=["']description["'][^>]*>\s*/gi, '')
    .replace(/<meta\b[^>]*property=["']og:(?:site_name|title|description|type|url)["'][^>]*>\s*/gi, '')
    .replace(/<meta\b[^>]*name=["']twitter:(?:card|title|description)["'][^>]*>\s*/gi, '');
}

function pageTitle(html) {
  return (html.match(/<title>([^<]*)<\/title>/i)?.[1] || 'Alex Ford Adventures').trim();
}

function publicHtml(html, cleanPath = null, descriptionOverride = '') {
  let output = html;
  if (!/<base\b/i.test(output)) output = output.replace(/<head([^>]*)>/i, '<head$1><base href="/">');
  if (!output.includes('ADVENTURE_PUBLIC_BUILD')) output = output.replace(/<\/head>/i, '<script>window.ADVENTURE_PUBLIC_BUILD=true;</script></head>');
  if (cleanPath != null) {
    const title = pageTitle(output);
    const canonical = cleanPath === '/' ? `${SITE}/` : `${SITE}${cleanPath}`;
    const existingDescription = output.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1] || '';
    const description = descriptionOverride || existingDescription || 'Alex Ford Adventures: races, mountains, skiing, biking, and the stories behind them.';
    output = removeStaticMeta(output);
    const metadata = [
      `<meta name="description" content="${attr(description)}">`,
      `<link rel="canonical" href="${attr(canonical)}">`,
      '<meta property="og:site_name" content="Alex Ford Adventures">',
      `<meta property="og:title" content="${attr(title)}">`,
      `<meta property="og:description" content="${attr(description)}">`,
      '<meta property="og:type" content="website">',
      `<meta property="og:url" content="${attr(canonical)}">`,
      '<meta name="twitter:card" content="summary">',
      `<meta name="twitter:title" content="${attr(title)}">`,
      `<meta name="twitter:description" content="${attr(description)}">`,
    ].join('');
    output = output.replace(/<\/head>/i, `${metadata}</head>`);
  }
  return output;
}

function recordHtml(template, record) {
  const slug = record.slug;
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Compiled record ${record.id || record.name || '(unknown)'} is missing a valid canonical slug`);
  const cleanPath = `/record/${encodeURIComponent(slug)}/`;
  const canonical = `${SITE}${cleanPath}`;
  const title = `${record.name} | Alex Ford Adventures`;
  const rawDescription = [recordType(record), record.location, displayDate(record.date), record.note].filter(Boolean).join(' · ');
  const description = (rawDescription || `${record.name} in Alex Ford Adventures`).slice(0, 260);
  let html = publicHtml(template)
    .replace(/<title>[^<]*<\/title>/i, `<title>${attr(title)}</title>`);
  html = removeStaticMeta(html);
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
  return { slug, canonical, html };
}

async function copyPublicTree() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (excludedTop.has(entry.name) || excludedFiles.has(entry.name)) continue;
    const source = path.join(root, entry.name);
    const target = path.join(outDir, entry.name);
    await fs.cp(source, target, { recursive: entry.isDirectory() });
  }
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');
}

async function transformLegacyHtml() {
  const entries = await fs.readdir(outDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.html') || entry.name === '404.html') continue;
    const target = path.join(outDir, entry.name);
    const cleanPath = fileToCleanPath.get(entry.name) ?? null;
    const route = [...Object.entries(cleanPages)].find(([, file]) => file === entry.name)?.[0] || '';
    await fs.writeFile(target, publicHtml(await fs.readFile(target, 'utf8'), cleanPath, route ? pageDescriptions[route] : ''));
  }
}

async function generateCleanPages() {
  for (const [route, file] of Object.entries(cleanPages)) {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    const dir = path.join(outDir, route);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), publicHtml(source, `/${route}/`, pageDescriptions[route]));
  }
}

async function generateRecords() {
  const compiledPath = path.join(outDir, 'data', 'public-records.json');
  const compiled = JSON.parse(await fs.readFile(compiledPath, 'utf8'));
  const template = await fs.readFile(path.join(root, 'detail.html'), 'utf8');
  const slugs = [];
  const seen = new Set();
  for (const record of compiled.records || []) {
    const generated = recordHtml(template, record);
    if (seen.has(generated.slug)) throw new Error(`Duplicate generated record slug: ${generated.slug}`);
    seen.add(generated.slug);
    slugs.push(generated.slug);
    const dir = path.join(outDir, 'record', generated.slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), generated.html);
  }
  if (Number(compiled.recordCount) !== seen.size) throw new Error(`Generated ${seen.size} record pages for ${compiled.recordCount} compiled records`);
  return slugs.sort();
}

async function generatePublicIndex(recordSlugs) {
  const pagePaths = ['/', ...Object.keys(cleanPages).map(route => `/${route}/`)];
  const urls = [
    ...pagePaths.map(cleanPath => cleanPath === '/' ? `${SITE}/` : `${SITE}${cleanPath}`),
    ...recordSlugs.map(slug => `${SITE}/record/${slug}/`),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${xml(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`;
  await fs.writeFile(path.join(outDir, 'sitemap.xml'), sitemap);
  await fs.writeFile(path.join(outDir, 'robots.txt'), robots);
  return urls.length;
}

await copyPublicTree();
const compile = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-public-data.mjs'), '--out-dir', path.join(outDir, 'data')], { cwd: root, stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
await transformLegacyHtml();
await generateCleanPages();
const recordSlugs = await generateRecords();
const indexedUrls = await generatePublicIndex(recordSlugs);
console.log(`Static site generated at ${path.relative(root, outDir) || '.'}.`);
console.log(`Generated ${Object.keys(cleanPages).length} clean section documents and ${recordSlugs.length} record documents.`);
console.log(`Generated sitemap with ${indexedUrls} public URLs.`);
