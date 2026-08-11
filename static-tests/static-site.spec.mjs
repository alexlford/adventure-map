import { test, expect } from '@playwright/test';

const SITE = 'https://adventures.alexlford.com';
const sections = ['map','explore','stories','timeline','races','summits','skiing','nordic','mtb'];

function runtimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('Failed to load resource')) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

test('generated section routes are real static documents with static metadata', async ({ request }) => {
  const home = await request.get('/');
  expect(home.status()).toBe(200);
  const homeHtml = await home.text();
  expect(homeHtml).toContain('<base href="/">');
  expect(homeHtml).toContain(`rel="canonical" href="${SITE}/"`);
  expect(homeHtml).toContain('window.ADVENTURE_PUBLIC_BUILD=true');

  for (const route of sections) {
    const response = await request.get(`/${route}/`);
    expect(response.status(), `${route} should be a generated static document`).toBe(200);
    const html = await response.text();
    expect(html).toContain('<base href="/">');
    expect(html).toContain(`rel="canonical" href="${SITE}/${route}/"`);
    expect(html).toContain(`<meta property="og:url" content="${SITE}/${route}/">`);
    expect(html).toContain('<meta name="description" content="');
    expect(html).toContain('<meta property="og:description" content="');
    expect(html).toContain('window.ADVENTURE_PUBLIC_BUILD=true');
  }
});

test('generated record route has static metadata before JavaScript runs', async ({ request, page }) => {
  const recordsResponse = await request.get('/data/public-records.json');
  expect(recordsResponse.status()).toBe(200);
  const compiled = await recordsResponse.json();
  const record = compiled.records.find(item => item.id === 'chicago-marathon-2021') || compiled.records[0];
  expect(record).toBeTruthy();

  const slug = record.slug || record.id;
  const response = await request.get(`/record/${slug}/`);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain(`<link rel="canonical" href="${SITE}/record/${slug}/">`);
  expect(html).toContain(`<meta property="og:url" content="${SITE}/record/${slug}/">`);
  expect(html).toContain('<meta property="og:type" content="article">');
  expect(html).toContain('<meta name="description" content="');
  expect(html).toContain('window.ADVENTURE_PUBLIC_BUILD=true');

  const errors = runtimeErrors(page);
  await page.goto(`/record/${slug}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText(record.name);
  await expect(page.locator('.detail-route-section')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/record/${slug}/`);
  expect(errors).toEqual([]);
});

test('generated Map uses compiled publication data instead of provenance source layers', async ({ page }) => {
  const requests = [];
  const errors = runtimeErrors(page);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4174') requests.push(url.pathname);
  });

  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expect(page.locator('#routeCount')).not.toHaveText('—');
  await expect(page.locator('#skiCount')).not.toHaveText('—');

  expect(requests).toContain('/data/public-records.json');
  expect(requests).toContain('/data/public-routes.geojson');
  expect(requests).toContain('/data/public-map-entities.json');
  for (const forbidden of [
    '/data/catalog.json',
    '/data/routes.geojson',
    '/data/mined-routes.geojson',
    '/data/historical-routes-v2.geojson',
    '/data/event-routes.geojson',
    '/data/activity-route-polylines.json',
    '/data/skiing.json',
  ]) expect(requests, `generated Map should not request ${forbidden}`).not.toContain(forbidden);
  expect(errors).toEqual([]);
});

test('generated record uses compiled records, relationships, routes, and route provenance', async ({ request, page }) => {
  const compiled = await (await request.get('/data/public-records.json')).json();
  const record = compiled.records.find(item => item.id === 'chicago-marathon-2021') || compiled.records[0];
  const slug = record.slug || record.id;
  const requests = [];
  const errors = runtimeErrors(page);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4174') requests.push(url.pathname);
  });

  await page.goto(`/record/${slug}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText(record.name);
  await expect(page.locator('.detail-route-section')).toBeVisible();

  expect(requests).toContain('/data/public-records.json');
  expect(requests).toContain('/data/public-routes.geojson');
  expect(requests).not.toContain('/data/catalog.json');
  expect(requests).not.toContain('/data/relationships.json');
  expect(requests).not.toContain('/data/route-catalog.json');
  expect(errors).toEqual([]);
});

test('deployment sitemap contains every generated record URL', async ({ request }) => {
  const [recordsResponse, sitemapResponse, robotsResponse] = await Promise.all([
    request.get('/data/public-records.json'),
    request.get('/sitemap.xml'),
    request.get('/robots.txt'),
  ]);
  expect(recordsResponse.status()).toBe(200);
  expect(sitemapResponse.status()).toBe(200);
  expect(robotsResponse.status()).toBe(200);

  const compiled = await recordsResponse.json();
  const sitemap = await sitemapResponse.text();
  const robots = await robotsResponse.text();
  const recordUrls = sitemap.match(/<loc>https:\/\/adventures\.alexlford\.com\/record\/[^<]+<\/loc>/g) || [];

  expect(recordUrls).toHaveLength(compiled.recordCount);
  expect(sitemap).not.toContain('.html</loc>');
  for (const route of sections) expect(sitemap).toContain(`<loc>${SITE}/${route}/</loc>`);
  expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
});
