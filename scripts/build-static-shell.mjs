import fs from 'node:fs/promises';
import path from 'node:path';
import { SITE_ORIGIN, siteRoutes, navRoutes, canonicalFor } from './lib/site-routes.mjs';

const primaryRoutes = navRoutes('primary');
const activityRoutes = navRoutes('activity');
const timelineRoute = siteRoutes.find(route => route.key === 'timeline');
const activityKeys = new Set(activityRoutes.map(route => route.activeKey || route.key));
const defaultDescription = 'Alex Ford Adventures: races, mountains, alpine skiing, Nordic skiing, biking and the stories behind them.';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[ch]));
const decode = value => String(value ?? '')
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replaceAll('&#039;', "'");

const activeForRoute = route => route?.parentActiveKey || route?.activeKey || route?.key || null;
const primaryKey = active => active === 'activities' || active === 'timeline' || activityKeys.has(active)
  ? 'explore'
  : active === 'adventures'
    ? 'stories'
    : active;

function renderPrimaryLinks(active) {
  const top = primaryKey(active);
  return primaryRoutes.map(route => {
    const key = route.key;
    const current = top === key ? ' class="is-active" aria-current="page"' : '';
    return `<a data-nav="${esc(key)}" href="${esc(route.path)}"${current}>${esc(route.navLabel || route.label)}</a>`;
  }).join('');
}

function renderPrimaryNav(active, className = 'nav') {
  return `<nav class="${className}" aria-label="Primary navigation" data-static-shell="true">${renderPrimaryLinks(active)}</nav>`;
}

function renderActivitySubnav(active) {
  if (!(active === 'timeline' || activityKeys.has(active))) return '';
  const activityLinks = activityRoutes.map(route => {
    const key = route.activeKey || route.key;
    const current = active === key ? ' class="is-active" aria-current="page"' : '';
    return `<a data-activity-nav="${esc(key)}" href="${esc(route.path)}"${current}>${esc(route.navLabel || route.label)}</a>`;
  }).join('');
  const timelineCurrent = active === 'timeline' ? ' class="is-active" aria-current="page"' : '';
  const timeline = timelineRoute
    ? `<a data-activity-nav="timeline" href="${esc(timelineRoute.path)}"${timelineCurrent}>${esc(timelineRoute.navLabel || timelineRoute.label)}</a>`
    : '';
  return `<div class="activity-subnav-wrap" data-static-shell="true"><nav class="activity-subnav" aria-label="Explore Adventures"><span class="activity-subnav-label">Explore</span>${activityLinks}${timeline}</nav></div>`;
}

function metaContent(html, attribute, value) {
  const tag = html.match(new RegExp(`<meta\\b[^>]*${attribute}=["']${value}["'][^>]*>`, 'i'))?.[0] || '';
  return decode(tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] || '');
}

function ensureMetadata(html, canonical) {
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || 'Alex Ford Adventures');
  const description = metaContent(html, 'name', 'description') || defaultDescription;
  let out = html;
  const remove = [
    /<link\s+rel=["']canonical["'][^>]*>\s*/gi,
    /<meta\s+name=["']description["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:site_name["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:title["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:description["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:type["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:url["'][^>]*>\s*/gi,
    /<meta\s+name=["']twitter:card["'][^>]*>\s*/gi,
    /<meta\s+name=["']twitter:title["'][^>]*>\s*/gi,
    /<meta\s+name=["']twitter:description["'][^>]*>\s*/gi
  ];
  for (const pattern of remove) out = out.replace(pattern, '');
  const metadata = [
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta name="description" content="${esc(description)}">`,
    '<meta property="og:site_name" content="Alex Ford Adventures">',
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${esc(canonical)}">`,
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`
  ].join('');
  return out.replace(/<head>/i, `<head>${metadata}`);
}

function ensureNavigation(html, active) {
  const navPattern = /<nav\s+class=["']nav["'][^>]*>[\s\S]*?<\/nav>/i;
  const mapNavPattern = /<nav\s+class=["']section-nav["'][^>]*>[\s\S]*?<\/nav>/i;
  let out = html;
  if (navPattern.test(out)) out = out.replace(navPattern, renderPrimaryNav(active));
  else if (mapNavPattern.test(out)) out = out.replace(mapNavPattern, renderPrimaryNav(active, 'section-nav'));
  else throw new Error('Document is missing a recognized primary navigation element.');

  out = out.replace(/\s*<div\s+class=["']activity-subnav-wrap["'][^>]*>[\s\S]*?<\/nav>\s*<\/div>/gi, '');
  const subnav = renderActivitySubnav(active);
  if (subnav) {
    if (!/<\/header>/i.test(out)) throw new Error('Document is missing a site header for activity subnavigation.');
    out = out.replace(/<\/header>/i, `</header>${subnav}`);
  }
  return out;
}

function normalizedAssetPath(src) {
  let value = decode(src).split(/[?#]/, 1)[0];
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      if (url.origin !== SITE_ORIGIN) return null;
      value = url.pathname;
    }
  } catch {
    return null;
  }
  value = value.replace(/^\/+/, '').replace(/^(?:\.\.\/)+/, '').replace(/^\.\//, '');
  return value.startsWith('assets/event-photos/') ? value : null;
}

function ensurePhotoDimensions(html, dimensionsByPath) {
  return html.replace(/<img\b[^>]*>/gi, tag => {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const assetPath = src ? normalizedAssetPath(src) : null;
    const dimensions = assetPath ? dimensionsByPath.get(assetPath) : null;
    if (!dimensions) return tag;

    let out = tag;
    if (!/\bwidth=["'][^"']+["']/i.test(out)) out = out.replace(/<img\b/i, `<img width="${dimensions.width}"`);
    if (!/\bheight=["'][^"']+["']/i.test(out)) out = out.replace(/<img\b/i, `<img height="${dimensions.height}"`);
    return out;
  });
}

const photoIndex = JSON.parse(await fs.readFile('data/photo-index.json', 'utf8'));
const photoDimensions = new Map((photoIndex.photos || []).map(photo => [photo.path, { width: photo.width, height: photo.height }]));

async function materialize(file, { canonical, active }) {
  let html = await fs.readFile(file, 'utf8');
  html = ensureMetadata(html, canonical);
  html = ensureNavigation(html, active);
  html = ensurePhotoDimensions(html, photoDimensions);
  await fs.writeFile(file, html.endsWith('\n') ? html : `${html}\n`);
}

const publicDocuments = new Map();
for (const route of siteRoutes) {
  const file = route.generated ? path.join(route.dir, 'index.html') : route.source;
  publicDocuments.set(file, { canonical: canonicalFor(route), active: activeForRoute(route) });
}

const payload = JSON.parse(await fs.readFile('data/public-records.json', 'utf8'));
for (const record of payload.records || []) {
  const slug = record.slug;
  publicDocuments.set(path.join('record', slug, 'index.html'), {
    canonical: `${SITE_ORIGIN}/record/${encodeURIComponent(slug)}/`,
    active: null
  });
}

const failures = [];
for (const [file, context] of publicDocuments) {
  try {
    await materialize(file, context);
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
  }
}
if (failures.length) {
  const diagnostic = `Static shell failures (${failures.length})\n${failures.map(item => `- ${item}`).join('\n')}\n`;
  await fs.writeFile('static-shell-diagnostics.txt', diagnostic);
  throw new Error(diagnostic);
}
await fs.rm('static-shell-diagnostics.txt', { force: true });
console.log(`Static shell materialized for ${publicDocuments.size} public documents with ${photoDimensions.size} indexed photos.`);