import { test, expect } from '@playwright/test';

const featureKey = feature => feature.id || feature.properties?.featureId || feature.properties?.id || JSON.stringify(feature.geometry);

test('Compiled public data matches source-resolved records and routes', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const result = await page.evaluate(async () => {
    const [sourceRecords, compiledRecords, sourceRoutes, compiledRoutes, mapEntitiesResponse] = await Promise.all([
      window.AdventureCatalog.load({ fresh: true }),
      window.AdventureCatalog.loadCompiled('/.ci-public-data/public-records.json'),
      window.AdventureRoutes.loadAll(),
      window.AdventureRoutes.loadCompiled('/.ci-public-data/public-routes.geojson'),
      fetch('/.ci-public-data/public-map-entities.json').then(response => {
        if (!response.ok) throw new Error(`Compiled map entities unavailable (${response.status})`);
        return response.json();
      }),
    ]);
    const routeKey = feature => feature.id || feature.properties?.featureId || feature.properties?.id || JSON.stringify(feature.geometry);
    return {
      sourceRecordIds: sourceRecords.map(record => record.id).sort(),
      compiledRecordIds: compiledRecords.map(record => record.id).sort(),
      sourceRouteIds: sourceRoutes.features.map(routeKey).sort(),
      compiledRouteIds: compiledRoutes.features.map(routeKey).sort(),
      mapEntityCount: mapEntitiesResponse.entityCount,
      mapEntityRows: mapEntitiesResponse.entities?.length || 0,
    };
  });

  expect(result.compiledRecordIds).toEqual(result.sourceRecordIds);
  expect(result.compiledRouteIds).toEqual(result.sourceRouteIds);
  expect(result.mapEntityRows).toBe(result.mapEntityCount);
  expect(result.mapEntityCount).toBeGreaterThan(0);
});
