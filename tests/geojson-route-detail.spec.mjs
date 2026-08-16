import { test, expect } from '@playwright/test';

test('route detail loader supports GeoJSON catalog sources without downgrading GPS detail', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.AdventureRoutes));

  const result = await page.evaluate(async () => {
    const geo = await window.AdventureRoutes.loadDetailForAdventure('abes-amble-2014', { fresh: true });
    const upgraded = await window.AdventureRoutes.detailSourceForAdventure('bolderboulder-2023');
    const feature = geo?.collection?.features?.[0];
    return {
      geoFormat: geo?.entry?.format,
      geoQuality: geo?.entry?.quality,
      geoFeatureCount: geo?.collection?.features?.length || 0,
      geoFeatureId: feature?.id || feature?.properties?.featureId || feature?.properties?.id || null,
      upgradedFormat: upgraded?.format,
      upgradedQuality: upgraded?.quality,
      upgradedFeatureId: upgraded?.featureId,
    };
  });

  // GeoJSON-only catalog records should become addressable, while an upgraded
  // GPS-backed record must keep its stronger full-source indexed geometry.
  expect(result.geoFormat).toBe('geojson');
  expect(result.geoQuality).toBe('catalog-detail');
  expect(result.geoFeatureCount).toBe(1);
  expect(result.geoFeatureId).toBe('strava-641968068');
  expect(result.upgradedFormat).toBe('polyline');
  expect(result.upgradedQuality).toBe('full-source');
  expect(result.upgradedFeatureId).toBe('strava-9163211220');
});

test('route detail loader decodes Brotli-compressed full-source GPS shards', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.AdventureRoutes));

  const result = await page.evaluate(async () => {
    const pointCount = detail => {
      const geometry = detail?.collection?.features?.[0]?.geometry;
      if (geometry?.type === 'LineString') return geometry.coordinates?.length || 0;
      if (geometry?.type === 'MultiLineString') {
        return (geometry.coordinates || []).reduce((sum, line) => sum + (line?.length || 0), 0);
      }
      return 0;
    };
    const [mtb, nordic] = await Promise.all([
      window.AdventureRoutes.loadDetailForAdventure('kokopelli-three-day-2025', { fresh: true }),
      window.AdventureRoutes.loadDetailForAdventure('tennessee-pass-nordic-weekend-2022', { fresh: true }),
    ]);
    return {
      mtbQuality: mtb?.entry?.quality,
      mtbPoints: pointCount(mtb),
      nordicQuality: nordic?.entry?.quality,
      nordicPoints: pointCount(nordic),
    };
  });

  expect(result.mtbQuality).toBe('full-source');
  expect(result.mtbPoints).toBeGreaterThan(6000);
  expect(result.nordicQuality).toBe('full-source');
  expect(result.nordicPoints).toBeGreaterThan(7000);
});
