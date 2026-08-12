import { test, expect } from '@playwright/test';

test('DeCaLiBron story renders the personal Strava GPS loop instead of a location-only marker', async ({ page }) => {
  await page.goto('/detail.html?record=decalibron-2023', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText('DeCaLiBron');
  await expect(page.locator('#routeMeta')).toContainText('Personal GPS route');
  await expect(page.locator('#routeMeta')).toContainText('August 13, 2023 DeCaLiBron loop');
  await expect(page.locator('#detailMap .leaflet-overlay-pane path').first()).toBeVisible();

  const route = await page.evaluate(async () => {
    const collections = await AdventureRoutes.loadAll();
    const features = collections.flatMap(collection => collection.features || []);
    const feature = features.find(item => (item.id || item.properties?.featureId || item.properties?.id) === 'strava-9642214422');
    if (!feature) return null;
    const segments = feature.geometry?.type === 'LineString'
      ? [feature.geometry.coordinates || []]
      : feature.geometry?.type === 'MultiLineString'
        ? feature.geometry.coordinates || []
        : [];
    return {
      points: segments.reduce((sum, segment) => sum + segment.length, 0),
      owners: feature.properties?.adventureIds || [],
      provenance: feature.properties?.provenance || null,
    };
  });

  expect(route).not.toBeNull();
  expect(route.points).toBeGreaterThanOrEqual(1000);
  expect(route.provenance).toBe('personal-gps');
  expect(route.owners).toEqual(expect.arrayContaining([
    'decalibron-2023',
    'mount-democrat',
    'mount-cameron',
    'mount-lincoln',
    'mount-bross',
  ]));
});
