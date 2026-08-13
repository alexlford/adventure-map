import { test, expect } from '@playwright/test';

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('Failed to load resource')) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

test('map extensions use the frozen runtime boundary instead of ambient core globals', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const result = await page.evaluate(async () => {
    const source = await fetch('/map-enhancements.js').then(response => response.text());
    const runtime = window.AdventureMapRuntime;
    const api = window.AdventureMap;
    await runtime.ready();
    return {
      source,
      runtimeFrozen: Object.isFrozen(runtime),
      internalFrozen: Object.isFrozen(runtime.internal),
      sameLeaflet: runtime.leaflet === api.leaflet,
      publicInternal: api.internal,
      recordCount: runtime.snapshot().recordCount,
      routeLayerCount: runtime.internal.routeFeatureLayers().length,
      markerGroupCount: runtime.internal.markerGroups().length,
    };
  });

  expect(result.source).toContain('const runtime = window.AdventureMapRuntime');
  expect(result.source).toContain('const internal = runtime?.internal');
  expect(result.source).not.toContain('state.');
  expect(result.source).not.toContain('CATEGORY[');
  expect(result.source).not.toContain('publicLayerFor(');
  expect(result.source).not.toContain('filteredAdventures()');
  expect(result.source).not.toContain('renderMarkers(');
  expect(result.runtimeFrozen).toBeTruthy();
  expect(result.internalFrozen).toBeTruthy();
  expect(result.sameLeaflet).toBeTruthy();
  expect(result.publicInternal).toBeUndefined();
  expect(result.recordCount).toBeGreaterThan(0);
  expect(result.routeLayerCount).toBeGreaterThan(0);
  expect(result.markerGroupCount).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
