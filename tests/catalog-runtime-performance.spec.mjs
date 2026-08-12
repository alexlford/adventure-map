import { test, expect } from '@playwright/test';

const dataPath = url => {
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith('/data/') ? parsed.pathname : null;
  } catch {
    return null;
  }
};

const coreCatalogPaths = new Set([
  '/data/public-records.json',
  '/data/relationships.json',
  '/data/catalog.json',
  '/data/adventures.json',
  '/data/strava-matches.json'
]);

test('Race archive consumes the compiled public catalog instead of fanning out across source layers', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    const path = dataPath(request.url());
    if (path) requests.push(path);
  });

  await page.goto('/races/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#timeline .timeline-item').first()).toBeVisible();

  expect(requests.filter(path => path === '/data/public-records.json')).toHaveLength(1);
  expect(requests.filter(path => path === '/data/relationships.json')).toHaveLength(1);
  expect(requests).not.toContain('/data/catalog.json');
  expect(requests).not.toContain('/data/adventures.json');
  expect(requests).not.toContain('/data/strava-matches.json');
  expect(requests.filter(path => coreCatalogPaths.has(path))).toEqual([
    '/data/public-records.json',
    '/data/relationships.json'
  ]);

  const beforeRecords = requests.filter(path => path === '/data/public-records.json').length;
  const beforeRelationships = requests.filter(path => path === '/data/relationships.json').length;
  await page.evaluate(() => Promise.all([
    AdventureSite.load(),
    AdventureSite.load(),
    AdventureSite.loadRelationships(),
    AdventureSite.loadRelationships()
  ]));
  expect(requests.filter(path => path === '/data/public-records.json')).toHaveLength(beforeRecords);
  expect(requests.filter(path => path === '/data/relationships.json')).toHaveLength(beforeRelationships);
});

test('Record dossier reuses the same lean catalog bootstrap before optional route enrichment', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    const path = dataPath(request.url());
    if (path) requests.push(path);
  });

  await page.goto('/detail.html?record=chicago-marathon-2021', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText('Chicago Marathon');

  expect(requests.filter(path => path === '/data/public-records.json')).toHaveLength(1);
  expect(requests.filter(path => path === '/data/relationships.json')).toHaveLength(1);
  expect(requests).not.toContain('/data/catalog.json');
  expect(requests).not.toContain('/data/adventures.json');
  expect(requests).not.toContain('/data/strava-matches.json');
});

test('Catalog falls back to canonical source layers if the compiled artifact is unavailable', async ({ page }) => {
  const requests = [];
  await page.route('**/data/public-records.json', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"test outage"}' }));
  page.on('request', request => {
    const path = dataPath(request.url());
    if (path) requests.push(path);
  });

  await page.goto('/timeline/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#timeline')).not.toBeEmpty();

  expect(requests).toContain('/data/public-records.json');
  expect(requests).toContain('/data/catalog.json');
  expect(requests).toContain('/data/adventures.json');
  expect(requests).toContain('/data/strava-matches.json');
});
