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
    const [enhancementSource, keyboardSource, touchSource, expansionSource] = await Promise.all([
      fetch('/map-enhancements.js').then(response => response.text()),
      fetch('/map-keyboard.js').then(response => response.text()),
      fetch('/map-touch-mode.js').then(response => response.text()),
      fetch('/expansion.js').then(response => response.text()),
    ]);
    const runtime = window.AdventureMapRuntime;
    const api = window.AdventureMap;
    await runtime.ready();
    return {
      enhancementSource,
      keyboardSource,
      touchSource,
      expansionSource,
      runtimeFrozen: Object.isFrozen(runtime),
      internalFrozen: Object.isFrozen(runtime.internal),
      sameLeaflet: runtime.leaflet === api.leaflet,
      publicInternal: api.internal,
      recordCount: runtime.snapshot().recordCount,
      routeLayerCount: runtime.internal.routeFeatureLayers().length,
      markerGroupCount: runtime.internal.markerGroups().length,
    };
  });

  expect(result.enhancementSource).toContain('const runtime = window.AdventureMapRuntime');
  expect(result.enhancementSource).toContain('const internal = runtime?.internal');
  expect(result.enhancementSource).not.toContain('state.');
  expect(result.enhancementSource).not.toContain('CATEGORY[');
  expect(result.enhancementSource).not.toContain('publicLayerFor(');
  expect(result.enhancementSource).not.toContain('filteredAdventures()');
  expect(result.enhancementSource).not.toMatch(/(^|[^\w.])renderMarkers\(/m);

  expect(result.keyboardSource).toContain('const runtime = window.AdventureMapRuntime');
  expect(result.keyboardSource).not.toContain('state.');
  expect(result.keyboardSource).not.toContain('applyFocusStyles =');
  expect(result.keyboardSource).not.toContain('typeof map');

  expect(result.touchSource).toContain('window.AdventureMapRuntime?.leaflet');
  expect(result.touchSource).not.toContain('window.adventureMap');

  expect(result.expansionSource).toContain('const runtime = window.AdventureMapRuntime');
  expect(result.expansionSource).toContain('internal.mergeRouteCollections(payloads)');
  expect(result.expansionSource).not.toContain('state.');
  expect(result.expansionSource).not.toContain('CATEGORY.');
  expect(result.expansionSource).not.toContain('renderPreservingFocus()');

  expect(result.runtimeFrozen).toBeTruthy();
  expect(result.internalFrozen).toBeTruthy();
  expect(result.sameLeaflet).toBeTruthy();
  expect(result.publicInternal).toBeUndefined();
  expect(result.recordCount).toBeGreaterThan(0);
  expect(result.routeLayerCount).toBeGreaterThan(0);
  expect(result.markerGroupCount).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
