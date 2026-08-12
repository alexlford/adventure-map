import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const routeCatalog = JSON.parse(await fs.readFile(new URL('../data/route-catalog.json', import.meta.url), 'utf8'));
const geometrySources = [
  ...(routeCatalog.routeFiles || []),
  ...(routeCatalog.polylineFiles || [])
].map(source => source.replace(/^data\//, ''));

async function installRouteRuntime(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  if (!await page.evaluate(() => Boolean(window.AdventureRoutes))) {
    await page.addScriptTag({ url: '/route-catalog.js' });
  }
}

test('One unavailable route source does not take down the remaining public geometry', async ({ page }) => {
  let failedRequests = 0;
  await page.route('**/data/strava-route-backfill-06.json', route => {
    failedRequests += 1;
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"test route-source outage"}' });
  });
  await installRouteRuntime(page);

  const result = await page.evaluate(async () => {
    const collections = await AdventureRoutes.loadAll();
    return {
      collections: collections.length,
      features: collections.reduce((sum, collection) => sum + (collection.features || []).length, 0)
    };
  });

  expect(failedRequests).toBe(1);
  expect(result.collections).toBeGreaterThan(0);
  expect(result.features).toBeGreaterThan(0);
});

test('A total geometry outage fails clearly and the route loader can recover on retry', async ({ page }) => {
  const handlers = new Map();
  for (const source of geometrySources) {
    const pattern = `**/data/${source}`;
    const handler = route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"test total route outage"}' });
    handlers.set(pattern, handler);
    await page.route(pattern, handler);
  }
  await installRouteRuntime(page);

  const failure = await page.evaluate(async () => {
    try {
      await AdventureRoutes.loadAll();
      return null;
    } catch (error) {
      return error.message;
    }
  });
  expect(failure).toContain('Unable to load public route geometry');

  for (const [pattern, handler] of handlers) await page.unroute(pattern, handler);

  const recovered = await page.evaluate(async () => {
    const collections = await AdventureRoutes.loadAll();
    return collections.reduce((sum, collection) => sum + (collection.features || []).length, 0);
  });
  expect(recovered).toBeGreaterThan(0);
});
