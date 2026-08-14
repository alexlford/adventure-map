import { test, expect } from '@playwright/test';

const detailFilePattern = /\/data\/(?:strava-route-(?:rdp3|backfill)-[^/]+\.json|[^/]*full-resolution[^/]*\.(?:json|geojson)|story-route[^/]*\.json)$/;

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

test('high-detail GPS stays lazy at overview zoom and loads every addressable route in a dense viewport', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  const requests = [];
  page.on('request', request => {
    try { requests.push(new URL(request.url()).pathname); } catch {}
  });

  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expect.poll(() => page.evaluate(() => window.AdventureMap?.state?.().recordCount || 0)).toBeGreaterThan(0);
  await page.waitForTimeout(250);

  const initial = await page.evaluate(() => ({
    zoom: window.AdventureMap.leaflet.getZoom(),
    detailZoom: window.AdventureMapRouteDetail?.detailZoom,
    maxVisibleDetails: window.AdventureMapRouteDetail?.maxVisibleDetails,
    hasDetail: document.getElementById('map')?.classList.contains('has-lazy-route-detail'),
    detailCount: document.getElementById('map')?.dataset.routeDetailCount || null,
  }));

  expect(initial.zoom).toBe(2);
  expect(initial.detailZoom).toBe(7);
  expect(initial.maxVisibleDetails).toBeUndefined();
  expect(initial.hasDetail).toBeFalsy();
  expect(initial.detailCount).toBeNull();
  expect(requests).not.toContain('/data/route-detail-index.json');
  expect(requests.filter(path => detailFilePattern.test(path))).toEqual([]);

  const expected = await page.evaluate(async () => {
    const index = await fetch('/data/route-detail-index.json').then(response => response.json());
    const map = window.AdventureMap.leaflet;
    await new Promise(resolve => {
      map.once('moveend', resolve);
      map.setView([39.76, -105.08], 8);
    });

    const bounds = map.getBounds();
    const ids = [];
    const seen = new Set();
    window.AdventureMapRuntime.internal.routeFeatureLayers().forEach(group => group.eachLayer(layer => {
      const feature = layer.feature;
      if (!feature) return;
      const layerBounds = layer.getBounds?.();
      if (layerBounds?.isValid?.() && !bounds.intersects(layerBounds)) return;
      for (const id of feature.properties?.adventureIds || []) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }));

    const keys = new Set();
    for (const id of ids) {
      const entry = index.records?.[id];
      if (!entry) continue;
      keys.add(`${entry.file}::${entry.featureId}`);
    }
    return { count: keys.size };
  });

  expect(expected.count, 'Denver/Boulder drill-in viewport should exercise more than the former eight-route ceiling').toBeGreaterThan(8);
  await expect.poll(() => page.evaluate(() => Number(document.getElementById('map')?.dataset.routeDetailCount || 0))).toBe(expected.count);

  const after = await page.evaluate(() => ({
    count: Number(document.getElementById('map')?.dataset.routeDetailCount || 0),
    active: document.getElementById('map')?.classList.contains('has-lazy-route-detail'),
  }));
  expect(after.active).toBeTruthy();
  expect(after.count).toBe(expected.count);
  expect(after.count).toBeGreaterThan(8);

  const requestedDetailPaths = new Set(requests.filter(path => detailFilePattern.test(path)));
  expect(requestedDetailPaths.size, 'detail zoom should lazily request high-detail route data').toBeGreaterThan(0);
  expect(requestedDetailPaths.size, 'network requests may be deduplicated or cached, but cannot exceed rendered detail targets').toBeLessThanOrEqual(expected.count);

  await page.evaluate(() => window.AdventureMap.leaflet.setZoom(5));
  await expect.poll(() => page.evaluate(() => document.getElementById('map')?.classList.contains('has-lazy-route-detail'))).toBeFalsy();
  await expect.poll(() => page.evaluate(() => document.getElementById('map')?.dataset.routeDetailCount || null)).toBeNull();
  expect(errors).toEqual([]);
});

test('route detail refresh commits atomically and discards a stale in-flight generation', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expect.poll(() => page.evaluate(() => window.AdventureMap?.state?.().recordCount || 0)).toBeGreaterThan(0);

  await page.evaluate(async () => {
    const map = window.AdventureMap.leaflet;
    await new Promise(resolve => {
      map.once('moveend', resolve);
      map.setView([39.76, -105.08], 8);
    });
  });
  await expect.poll(() => page.evaluate(() => Number(document.getElementById('map')?.dataset.routeDetailCount || 0))).toBeGreaterThan(8);

  await page.evaluate(() => {
    const routes = window.AdventureRoutes;
    const original = routes.loadDetailForAdventure;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let delayed = false;

    window.__routeDetailRace = { started: false, release, original };
    routes.loadDetailForAdventure = async function (...args) {
      if (!delayed) {
        delayed = true;
        window.__routeDetailRace.started = true;
        await gate;
      }
      return original.apply(this, args);
    };

    window.AdventureMapRouteDetail.clear();
    window.AdventureMapRouteDetail.refresh();
  });

  await page.waitForFunction(() => window.__routeDetailRace?.started === true);
  await page.waitForTimeout(200);
  expect(await page.locator('.map-route-detail-line').count(), 'staged routes must not leak into Leaflet before the generation commits').toBe(0);
  await expect.poll(() => page.evaluate(() => document.getElementById('map')?.dataset.routeDetailCount || null)).toBeNull();

  await page.evaluate(() => {
    window.AdventureMap.leaflet.setZoom(5);
    window.__routeDetailRace.release();
  });
  await expect.poll(() => page.evaluate(() => document.getElementById('map')?.classList.contains('has-lazy-route-detail'))).toBeFalsy();
  await expect.poll(() => page.evaluate(() => document.getElementById('map')?.dataset.routeDetailCount || null)).toBeNull();
  await page.waitForTimeout(250);
  expect(await page.locator('.map-route-detail-line').count(), 'stale route loads must not repopulate the map after zooming out').toBe(0);

  await page.evaluate(() => {
    window.AdventureRoutes.loadDetailForAdventure = window.__routeDetailRace.original;
    delete window.__routeDetailRace;
  });
  expect(errors).toEqual([]);
});
