import { test, expect } from '@playwright/test';

const dataPath = url => {
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith('/data/') ? parsed.pathname : null;
  } catch {
    return null;
  }
};

test('Race archive remains usable when relationship enrichment is unavailable', async ({ page }) => {
  const requests = [];
  await page.route('**/data/relationships.json', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"error":"test relationship outage"}'
  }));
  page.on('request', request => {
    const path = dataPath(request.url());
    if (path) requests.push(path);
  });

  await page.goto('/races/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#timeline .timeline-item').first()).toBeVisible();
  await expect(page.locator('#raceTotal')).not.toHaveText('—');
  await expect(page.locator('main > .empty')).toHaveCount(0);

  expect(requests).toContain('/data/public-records.json');
  expect(requests).toContain('/data/relationships.json');
  expect(requests).not.toContain('/data/catalog.json');
});

test('Record dossier survives relationship enrichment failure', async ({ page }) => {
  await page.route('**/data/relationships.json', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"error":"test relationship outage"}'
  }));

  await page.goto('/record/chicago-marathon-2021/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText('Chicago Marathon');
  await expect(page.locator('body')).toContainText(/Race dossier|Official race result/i);
  await expect(page.locator('#page > .empty')).toHaveCount(0);
  await expect(page.locator('.detail-route-section')).toBeVisible();
});

test('Concurrent route consumers share one geometry-loading pass', async ({ page }) => {
  const requests = [];
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  page.on('request', request => {
    const path = dataPath(request.url());
    if (path) requests.push(path);
  });
  if (!await page.evaluate(() => Boolean(window.AdventureRoutes))) {
    await page.addScriptTag({ url: '/route-catalog.js' });
  }

  await page.evaluate(() => Promise.all([
    AdventureRoutes.loadAll(),
    AdventureRoutes.loadAll(),
    AdventureRoutes.loadAll()
  ]));

  const count = path => requests.filter(item => item === path).length;
  expect(count('/data/route-catalog.json')).toBe(1);
  expect(count('/data/routes.geojson')).toBe(1);
  expect(count('/data/activity-route-polylines.json')).toBe(1);
  const before = requests.length;

  await page.evaluate(() => AdventureRoutes.loadAll());
  expect(requests.length).toBe(before);
});
