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

test('Map exposes a stable AdventureMap runtime API', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const contract = await page.evaluate(() => {
    const api = window.AdventureMap;
    return {
      version: api?.version,
      frozen: Object.isFrozen(api),
      recordCount: api?.state?.().recordCount,
      visibleCount: api?.filteredRecords?.().length,
      routeCount: api?.visibleRoutes?.().length,
      methods: ['state','records','filteredRecords','visibleRoutes','layerFor','popupHtml','focus','emphasize','clearFocus','fit','refresh','setViewState'].every(name => typeof api?.[name] === 'function'),
      sameLeaflet: api?.leaflet === window.adventureMap,
    };
  });

  expect(contract.version).toBe(1);
  expect(contract.frozen).toBeTruthy();
  expect(contract.recordCount).toBeGreaterThan(0);
  expect(contract.visibleCount).toBeGreaterThan(0);
  expect(contract.routeCount).toBeGreaterThan(0);
  expect(contract.methods).toBeTruthy();
  expect(contract.sameLeaflet).toBeTruthy();
  expect(errors).toEqual([]);
});

test('Map marker clustering is owned by the core renderer instead of an enhancement monkey-patch', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const [coreSource, enhancementSource] = await page.evaluate(() => Promise.all([
    fetch('/app.js').then(response => response.text()),
    fetch('/map-enhancements.js').then(response => response.text()),
  ]));

  expect(coreSource).toContain('markerGridSize');
  expect(coreSource).toContain('__adventureCluster');
  expect(enhancementSource).not.toMatch(/renderMarkers\s*=/);
  expect(enhancementSource).not.toContain("if(typeof renderMarkers==='function')");
  expect(errors).toEqual([]);
});

test('Map focus and pinning are owned by the core instead of enhancement monkey-patches', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const ownership = await page.evaluate(async () => {
    const [coreSource, enhancementSource] = await Promise.all([
      fetch('/app.js').then(response => response.text()),
      fetch('/map-enhancements.js').then(response => response.text()),
    ]);
    const api = window.AdventureMap;
    const record = api.records().find(item => Number.isFinite(item.lat) && Number.isFinite(item.lon) && api.visibleRoutes([item]).length === 0);
    if (!record) return { coreSource, enhancementSource, record: null };
    api.focus(record.id);
    const focused = api.state();
    api.emphasize(record.id, false);
    const afterBlur = api.state();
    api.clearFocus();
    const cleared = api.state();
    return { coreSource, enhancementSource, record: record.id, focused, afterBlur, cleared };
  });

  expect(ownership.record, 'catalog should contain a mapped record without route geometry').toBeTruthy();
  expect(ownership.coreSource).toContain('function pinnedIsVisible()');
  expect(ownership.coreSource).toContain('state.pinnedFocusId=a.id');
  expect(ownership.enhancementSource).not.toMatch(/focusAdventure\s*=/);
  expect(ownership.enhancementSource).not.toMatch(/setRouteEmphasis\s*=/);
  expect(ownership.focused.focusId).toBe(ownership.record);
  expect(ownership.focused.pinnedFocusId).toBe(ownership.record);
  expect(ownership.afterBlur.focusId).toBe(ownership.record);
  expect(ownership.afterBlur.pinnedFocusId).toBe(ownership.record);
  expect(ownership.cleared.focusId).toBeNull();
  expect(ownership.cleared.pinnedFocusId).toBeNull();
  await page.waitForTimeout(1000);
  const settled = await page.evaluate(() => window.AdventureMap.state());
  expect(settled.focusId).toBeNull();
  expect(settled.pinnedFocusId).toBeNull();
  expect(errors).toEqual([]);
});

test('Map focus styling and route endpoints are owned by core', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const ownership = await page.evaluate(async () => {
    const [coreSource, enhancementSource] = await Promise.all([
      fetch('/app.js').then(response => response.text()),
      fetch('/map-enhancements.js').then(response => response.text()),
    ]);
    const api = window.AdventureMap;
    const record = api.records().find(item => api.visibleRoutes([item]).some(feature => ['LineString','MultiLineString','GeometryCollection'].includes(feature.geometry?.type)));
    if (!record) return { coreSource, enhancementSource, record: null };
    api.focus(record.id);
    return { coreSource, enhancementSource, record: record.id };
  });

  expect(ownership.record, 'catalog should contain a record with line route geometry').toBeTruthy();
  expect(ownership.coreSource).toContain('focusEndpointLayer');
  expect(ownership.coreSource).toContain('function renderFocusEndpoints()');
  expect(ownership.enhancementSource).not.toMatch(/applyFocusStyles\s*=/);
  expect(ownership.enhancementSource).not.toContain('focusEndpointLayer');
  await expect.poll(() => page.locator('.route-endpoint-wrap').count()).toBeGreaterThan(0);
  await page.evaluate(() => window.AdventureMap.clearFocus());
  await expect(page.locator('.route-endpoint-wrap')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Map public route keeps the Colorado-centered zoom 2 default after data loads', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expect(page.locator('#skiCount')).not.toHaveText('—');

  const view = await page.evaluate(() => {
    const map = window.AdventureMap?.leaflet;
    const center = map?.getCenter?.();
    return {
      zoom: map?.getZoom?.(),
      lat: center?.lat,
      lng: center?.lng,
    };
  });

  expect(view.zoom).toBe(2);
  expect(Math.abs(view.lat - 39)).toBeLessThan(0.25);
  expect(Math.abs(view.lng + 105.5)).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

test('Map presents recovered official race context through AdventureMap', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const result = await page.evaluate(() => {
    const race = window.AdventureMap.records().find(record => record.kind === 'race' && record.officialTime && (record.officialDistance || record.officialDistanceMi));
    if (!race) return null;
    return {
      id: race.id,
      name: race.name,
      officialTime: race.officialTime,
      officialDistance: race.officialDistance || `${race.officialDistanceMi} mi`,
      officialPlace: race.officialPlace || null,
      html: window.AdventureMap.popupHtml(race),
    };
  });

  expect(result, 'catalog should contain at least one race with recovered official result context').toBeTruthy();
  expect(result.html).toContain(result.name);
  expect(result.html).toContain(result.officialTime);
  expect(result.html).toContain(result.officialDistance);
  if (result.officialPlace) expect(result.html).toContain(String(result.officialPlace));
  expect((result.html.match(/Open record/g) || []).length).toBe(1);
  expect(errors).toEqual([]);
});

test('Map keeps MTB geography on the shared forest green', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await page.locator('[data-filter="mtb"]').click();
  await expect(page.locator('[data-filter="mtb"]')).toHaveClass(/is-active/);
  const dot = page.locator('#adventureList .item-dot').first();
  await expect(dot).toBeVisible();
  await expect.poll(() => dot.evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(47, 125, 74)');
  const expansionSource = await page.evaluate(() => fetch('expansion.js').then(response => response.text()));
  expect(expansionSource).toContain("CATEGORY['mountain-bike'] = { label: 'Mountain bike race', color: '#2f7d4a' }");
  expect(expansionSource).not.toContain("CATEGORY['mountain-bike'] = { label: 'Mountain bike race', color: '#2563eb' }");
  expect(errors).toEqual([]);
});

test('Map exposes ski resorts as a usable skiing layer', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expect(page.locator('#skiCount')).not.toHaveText('—');
  const skiCount = Number(await page.locator('#skiCount').textContent());
  expect(skiCount).toBeGreaterThan(0);

  await page.locator('[data-filter="skiing"]').click();
  await expect(page.locator('[data-filter="skiing"]')).toHaveClass(/is-active/);
  await expect(page.locator('#resultCount')).toContainText('shown');
  const shown = Number((await page.locator('#resultCount').textContent())?.match(/(\d+)/)?.[1] || 0);
  expect(shown).toBeGreaterThan(0);
  await expect(page.locator('#adventureList')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('supplemental route loading expands beyond the base route file', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#routeCount')).not.toHaveText('—');
  const result = await page.evaluate(async () => {
    const base = await fetch('data/routes.geojson').then(response => response.json());
    return {
      baseFeatures: base.features?.length || 0,
      publicRouteCount: Number(document.getElementById('routeCount')?.textContent || 0),
    };
  });
  expect(result.publicRouteCount).toBeGreaterThan(result.baseFeatures);
  expect(errors).toEqual([]);
});
