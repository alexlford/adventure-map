import { test, expect } from '@playwright/test';

test('route detail loader supports GeoJSON catalog sources without downgrading GPS detail', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.AdventureRoutes));

  const result = await page.evaluate(async () => {
    const detailIndex = await fetch('data/route-detail-index.json').then(response => response.json());
    const geoRecord = Object.entries(detailIndex.records || {}).find(([, entry]) => (
      entry?.format === 'geojson' && entry?.quality === 'catalog-detail'
    ));
    if (!geoRecord) throw new Error('Expected at least one GeoJSON catalog-detail route');

    const [geoRecordId, expectedGeoEntry] = geoRecord;
    const geo = await window.AdventureRoutes.loadDetailForAdventure(geoRecordId, { fresh: true });
    const upgraded = await window.AdventureRoutes.detailSourceForAdventure('bolderboulder-2023');
    const feature = geo?.collection?.features?.[0];
    return {
      geoRecordId,
      expectedGeoFeatureId: expectedGeoEntry.featureId,
      geoFormat: geo?.entry?.format,
      geoQuality: geo?.entry?.quality,
      geoFeatureCount: geo?.collection?.features?.length || 0,
      geoFeatureId: feature?.id || feature?.properties?.featureId || feature?.properties?.id || null,
      upgradedFormat: upgraded?.format,
      upgradedQuality: upgraded?.quality,
      upgradedFeatureId: upgraded?.featureId,
    };
  });

  // GeoJSON catalog records should remain addressable, while an upgraded
  // GPS-backed record must keep its stronger full-source indexed geometry.
  expect(result.geoRecordId).toBeTruthy();
  expect(result.geoFormat).toBe('geojson');
  expect(result.geoQuality).toBe('catalog-detail');
  expect(result.geoFeatureCount).toBe(1);
  expect(result.geoFeatureId).toBe(result.expectedGeoFeatureId);
  expect(result.upgradedFormat).toBe('polyline');
  expect(result.upgradedQuality).toBe('full-source');
  expect(result.upgradedFeatureId).toBe('strava-9163211220');
});
