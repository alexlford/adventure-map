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

test('high-detail GPS stays lazy at overview zoom and loads a bounded visible set on drill-in', async ({ page }) => {
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
  expect(initial.maxVisibleDetails).toBe(8);
  expect(initial.hasDetail).toBeFalsy();
  expect(initial.detailCount).toBeNull();
  expect(requests).not.toContain('/data/route-detail-index.json');
  expect(requests.filter(path => detailFilePattern.test(path))).toEqual([]);

  const target = await page.evaluate(async () => {
    const index = await fetch('/data/route-detail-index.json').then(response => response.json());
    const api = window.AdventureMap;
    const qualityRank = { 'full-source': 0, 'rdp-3m': 1, 'story-detail': 2, backfill: 3, 'catalog-detail': 4, 'activity-overview': 5 };
    const eligible = api.records()
      .filter(record => index.records?.[record.id] && api.visibleRoutes([record]).length > 0)
      .sort((a, b) => (qualityRank[index.records[a.id].quality] ?? 99) - (qualityRank[index.records[b.id].quality] ?? 99));
    const record = eligible[0];
    return record ? { id: record.id, entry: index.records[record.id] } : null;
  });

  expect(target, 'at least one currently mapped record should have an addressable detail source').toBeTruthy();
  expect(target.entry.quality).not.toBe('activity-overview');

  const detailRequestsBefore = requests.filter(path => detailFilePattern.test(path)).length;
  await page.evaluate(id => {
    const api = window.AdventureMap;
    api.focus(id);
    if (api.leaflet.getZoom() < 8) api.leaflet.setZoom(8);
  }, target.id);

  await expect.poll(() => page.evaluate(() => Number(document.getElementById('map')?.dataset.routeDetailCount || 0))).toBeGreaterThan(0);

  const expectedPath = `/${target.entry.file.replace(/^\//, '')}`;
  await expect.poll(() => requests.includes(expectedPath)).toBeTruthy();

  const after = await page.evaluate(() => ({
    count: Number(document.getElementById('map')?.dataset.routeDetailCount || 0),
    quality: document.getElementById('map')?.dataset.routeDetailQuality || '',
    active: document.getElementById('map')?.classList.contains('has-lazy-route-detail'),
  }));
  expect(after.active).toBeTruthy();
  expect(after.count).toBeGreaterThan(0);
  expect(after.count).toBeLessThanOrEqual(8);
  expect(after.quality).toContain(target.entry.quality);

  const newDetailRequests = requests.slice(detailRequestsBefore).filter(path => detailFilePattern.test(path));
  expect(new Set(newDetailRequests).size).toBeLessThanOrEqual(8);

  await page.evaluate(() => window.AdventureMap.leaflet.setZoom(5));
  await expect.poll(() => page.evaluate(() => document.getElementById('map')?.classList.contains('has-lazy-route-detail'))).toBeFalsy();
  await expect.poll(() => page.evaluate(() => document.getElementById('map')?.dataset.routeDetailCount || null)).toBeNull();
  expect(errors).toEqual([]);
});
