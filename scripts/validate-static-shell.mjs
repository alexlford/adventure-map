import fs from 'node:fs/promises';
import path from 'node:path';
import { SITE_ORIGIN, siteRoutes, navRoutes, canonicalFor } from './lib/site-routes.mjs';

const primaryRoutes = navRoutes('primary');
const activityRoutes = navRoutes('activity');
const activityKeys = new Set(activityRoutes.map(route => route.activeKey || route.key));
const errors = [];

const activeForRoute = route => route?.parentActiveKey || route?.activeKey || route?.key || null;
const shouldHaveSubnav = active => active === 'timeline' || activityKeys.has(active);
const count = (html, pattern) => (html.match(pattern) || []).length;

function validateDocument(file, html, canonical, active) {
  const label = file;
  const requiredOnce = [
    ['canonical', /<link\s+rel=["']canonical["'][^>]*>/gi],
    ['description', /<meta\s+name=["']description["'][^>]*>/gi],
    ['og:title', /<meta\s+property=["']og:title["'][^>]*>/gi],
    ['og:description', /<meta\s+property=["']og:description["'][^>]*>/gi],
    ['og:url', /<meta\s+property=["']og:url["'][^>]*>/gi],
    ['twitter:title', /<meta\s+name=["']twitter:title["'][^>]*>/gi],
    ['twitter:description', /<meta\s+name=["']twitter:description["'][^>]*>/gi]
  ];
  for (const [name, pattern] of requiredOnce) {
    const total = count(html, pattern);
    if (total !== 1) errors.push(`${label}: expected exactly one ${name}; found ${total}`);
  }
  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) errors.push(`${label}: canonical URL is not ${canonical}`);
  if (!html.includes(`<meta property="og:url" content="${canonical}">`)) errors.push(`${label}: og:url is not ${canonical}`);
  if (!/<nav\s+class=["']nav["'][^>]*data-static-shell=["']true["']/i.test(html)) errors.push(`${label}: primary navigation is not materialized in HTML`);
  for (const route of primaryRoutes) {
    if (!html.includes(`data-nav="${route.key}"`)) errors.push(`${label}: static primary navigation is missing ${route.key}`);
  }
  const subnavCount = count(html, /<div\s+class=["']activity-subnav-wrap["'][^>]*data-static-shell=["']true["']/gi);
  if (shouldHaveSubnav(active) && subnavCount !== 1) errors.push(`${label}: expected one static activity subnav; found ${subnavCount}`);
  if (!shouldHaveSubnav(active) && subnavCount !== 0) errors.push(`${label}: unexpected activity subnav`);
}

for (const route of siteRoutes) {
  const file = route.generated ? path.join(route.dir, 'index.html') : route.source;
  try {
    const html = await fs.readFile(file, 'utf8');
    validateDocument(file, html, canonicalFor(route), activeForRoute(route));
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

const payload = JSON.parse(await fs.readFile('data/public-records.json', 'utf8'));
for (const record of payload.records || []) {
  const file = path.join('record', record.slug, 'index.html');
  const canonical = `${SITE_ORIGIN}/record/${encodeURIComponent(record.slug)}/`;
  try {
    const html = await fs.readFile(file, 'utf8');
    validateDocument(file, html, canonical, null);
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

if (errors.length) {
  errors.forEach(error => console.error(`ERROR ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Static shell validation passed for ${siteRoutes.length + (payload.records || []).length} public documents.`);
}
