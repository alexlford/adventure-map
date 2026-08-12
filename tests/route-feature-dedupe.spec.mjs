import { test, expect } from '@playwright/test';

async function installRouteRuntime(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  if (!await page.evaluate(() => Boolean(window.AdventureRoutes))) {
    await page.addScriptTag({ url: '/route-catalog.js' });
  }
}

test('canonical route ids resolve to one preferred geometry', async ({ page }) => {
  await installRouteRuntime(page);

  const result = await page.evaluate(async () => {
    const collections = await AdventureRoutes.loadAll({ fresh: true });
    const features = collections.flatMap(collection => collection.features || []);
    const ids = features.map(feature => AdventureRoutes.keyFor(feature)).filter(Boolean);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    const decalibron = features.filter(feature => (feature.properties?.adventureIds || []).includes('decalibron-2023'));
    const route = decalibron[0];
    const pointCount = route?.geometry?.type === 'LineString'
      ? route.geometry.coordinates.length
      : (route?.geometry?.coordinates || []).reduce((sum, line) => sum + line.length, 0);

    return {
      duplicates: [...new Set(duplicates)],
      decalibronCount: decalibron.length,
      decalibronId: route ? AdventureRoutes.keyFor(route) : null,
      pointCount
    };
  });

  expect(result.duplicates).toEqual([]);
  expect(result.decalibronCount).toBe(1);
  expect(result.decalibronId).toBe('strava-9642214422');
  expect(result.pointCount).toBeGreaterThan(1000);
});
