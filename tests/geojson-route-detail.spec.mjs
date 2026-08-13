import { test, expect } from '@playwright/test';

test('route detail loader supports GeoJSON catalog sources without downgrading GPS detail', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.AdventureRoutes));

  const result = await page.evaluate(async () => {
    const geo = await window.AdventureRoutes.loadDetailForAdventure('abes-amble-2014', { fresh: true });
    const pending = await window.AdventureRoutes.detailSourceForAdventure('bolderboulder-2023');
    const feature = geo?.collection?.features?.[0];
    return {
      geoFormat: geo?.entry?.format,
      geoQuality: geo?.entry?.quality,
      geoFeatureCount: geo?.collection?.features?.length || 0,
      geoFeatureId: feature?.id || feature?.properties?.featureId || feature?.properties?.id || null,
      pendingFormat: pending?.format,
      pendingQuality: pending?.quality,
      pendingFeatureId: pending?.featureId,
    };
  });

  expect(result.geoFormat).toBe('geojson');
  expect(result.geoQuality).toBe('catalog-detail');
  expect(result.geoFeatureCount).toBe(1);
  expect(result.geoFeatureId).toBe('strava-641968068');
  expect(result.pendingFormat).toBe('polyline');
  expect(result.pendingQuality).toBe('backfill');
  expect(result.pendingFeatureId).toBe('strava-9163211220');
});
