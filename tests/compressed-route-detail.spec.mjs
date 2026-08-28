import { test, expect } from '@playwright/test';

test('route detail loader renders build-time materialized full-source GPS without browser Brotli support', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.AdventureRoutes));

  const result = await page.evaluate(async () => {
    const recordId = 'garmin-half-2016';
    const expected = await window.AdventureRoutes.detailSourceForAdventure(recordId);
    if (!expected) throw new Error(`Missing route detail index entry for ${recordId}`);
    if (!expected.sourceFile) throw new Error(`Missing compressed source reference for ${recordId}`);

    const [materialized, source] = await Promise.all([
      fetch(expected.file).then(response => response.json()),
      fetch(expected.sourceFile).then(response => response.json()),
    ]);
    const materializedRoute = (materialized.routes || []).find(route => route.id === expected.featureId);
    const sourceRoute = (source.routes || []).find(route => route.id === expected.featureId);
    if (!materializedRoute) throw new Error(`Missing materialized route ${expected.featureId}`);
    if (!sourceRoute) throw new Error(`Missing compressed source route ${expected.featureId}`);

    const detail = await window.AdventureRoutes.loadDetailForAdventure(recordId, { fresh: true });
    const feature = detail?.collection?.features?.[0];
    const geometry = feature?.geometry;
    const pointCount = geometry?.type === 'LineString'
      ? (geometry.coordinates || []).length
      : geometry?.type === 'MultiLineString'
        ? (geometry.coordinates || []).reduce((sum, line) => sum + (line?.length || 0), 0)
        : 0;

    return {
      format: detail?.entry?.format,
      quality: detail?.entry?.quality,
      featureId: feature?.id || feature?.properties?.featureId || null,
      expectedFeatureId: expected.featureId,
      materializedFile: expected.file,
      sourceFile: expected.sourceFile,
      sourceCompressedLineCount: sourceRoute.linesBrotliBase64?.length || 0,
      materializedLineCount: materializedRoute.lines?.length || 0,
      materializedCompression: materialized.compression,
      materializedEncoding: materialized.encoding,
      sourcePointCount: sourceRoute.sourcePointCount || null,
      pointCount,
    };
  });

  expect(result.format).toBe('polyline');
  expect(result.quality).toBe('full-source');
  expect(result.featureId).toBe(result.expectedFeatureId);
  expect(result.materializedFile).toBe('data/route-detail-browser-polylines.json');
  expect(result.sourceFile).not.toBe(result.materializedFile);
  expect(result.sourceCompressedLineCount).toBeGreaterThan(0);
  expect(result.materializedLineCount).toBe(result.sourceCompressedLineCount);
  expect(result.materializedCompression).toBe('none');
  expect(['polyline5', 'google-polyline5']).toContain(result.materializedEncoding);
  expect(result.pointCount).toBeGreaterThan(100);
  if (result.sourcePointCount) expect(result.pointCount).toBe(result.sourcePointCount);
});
