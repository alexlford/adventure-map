import { test, expect } from '@playwright/test';

const featureKey = feature => feature.id || feature.properties?.featureId || feature.properties?.id || JSON.stringify(feature.geometry);

test('Compiled public data matches source-resolved records and routes', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const result = await page.evaluate(async () => {
    const [sourceRecords, compiledRecords, rawCompiledRecords, sourceRoutes, compiledRoutes, mapEntitiesResponse] = await Promise.all([
      window.AdventureCatalog.load({ fresh: true }),
      window.AdventureCatalog.loadCompiled('/.ci-public-data/public-records.json'),
      fetch('/.ci-public-data/public-records.json').then(response => {
        if (!response.ok) throw new Error(`Raw compiled records unavailable (${response.status})`);
        return response.json();
      }),
      window.AdventureRoutes.loadAll(),
      window.AdventureRoutes.loadCompiled('/.ci-public-data/public-routes.geojson'),
      fetch('/.ci-public-data/public-map-entities.json').then(response => {
        if (!response.ok) throw new Error(`Compiled map entities unavailable (${response.status})`);
        return response.json();
      }),
    ]);
    const routeKey = feature => feature.id || feature.properties?.featureId || feature.properties?.id || JSON.stringify(feature.geometry);
    const recordSlugRows = records => records.map(record => `${record.id}:${record.slug}`).sort();
    return {
      sourceRecordIds: sourceRecords.map(record => record.id).sort(),
      compiledRecordIds: compiledRecords.map(record => record.id).sort(),
      sourceRecordSlugs: recordSlugRows(sourceRecords),
      rawCompiledRecordSlugs: recordSlugRows(rawCompiledRecords.records || []),
      rawCompiledRecordCount: rawCompiledRecords.recordCount,
      rawCompiledRecordRows: rawCompiledRecords.records?.length || 0,
      sourceRouteIds: sourceRoutes.features.map(routeKey).sort(),
      compiledRouteIds: compiledRoutes.features.map(routeKey).sort(),
      mapEntityCount: mapEntitiesResponse.entityCount,
      mapEntityRows: mapEntitiesResponse.entities?.length || 0,
    };
  });

  expect(result.compiledRecordIds).toEqual(result.sourceRecordIds);
  expect(result.rawCompiledRecordSlugs).toEqual(result.sourceRecordSlugs);
  expect(result.rawCompiledRecordRows).toBe(result.rawCompiledRecordCount);
  expect(result.compiledRouteIds).toEqual(result.sourceRouteIds);
  expect(result.mapEntityRows).toBe(result.mapEntityCount);
  expect(result.mapEntityCount).toBeGreaterThan(0);
});
