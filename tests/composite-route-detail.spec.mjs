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

test('focused composite adventure loads every distinct member route detail', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expect.poll(() => page.evaluate(() => window.AdventureMap?.state?.().recordCount || 0)).toBeGreaterThan(0);

  const expected = await page.evaluate(async () => {
    const focusId = 'colorado-triathlon-2023';
    const [relationshipPayload, detailIndex] = await Promise.all([
      fetch('/data/relationships.json').then(response => response.json()),
      fetch('/data/route-detail-index.json').then(response => response.json()),
    ]);
    const relationship = (relationshipPayload.relationships || []).find(item => item.adventureId === focusId);
    const sourceIds = [...new Set([focusId, ...(relationship?.memberIds || [])])];
    const byKey = new Map();
    for (const sourceId of sourceIds) {
      const entry = detailIndex.records?.[sourceId];
      if (!entry) continue;
      byKey.set(`${entry.file}::${entry.featureId}`, { sourceId, featureId: entry.featureId });
    }

    window.AdventureMap.focus(focusId);
    const map = window.AdventureMap.leaflet;
    map.setView([39.85, -105.30], 8, { animate: false });
    window.AdventureMapRouteDetail.refresh();

    return { focusId, targets: [...byKey.values()] };
  });

  await expect.poll(() => page.evaluate(() => window.AdventureMap.leaflet.getZoom())).toBe(8);

  expect(expected.targets.map(target => target.sourceId).sort()).toEqual([
    'colderbolder-2023',
    'mtb-day-2023-12-02',
    'ski-colorado-triathlon-leg',
  ]);

  const expectedRendered = expected.targets
    .map(target => ({ sourceId: target.sourceId, featureId: target.featureId }))
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId));

  await expect.poll(() => page.evaluate(focusId => {
    const diagnostics = window.AdventureMapRouteDetail?.diagnostics?.();
    return (diagnostics?.targets || [])
      .filter(target => target.id === focusId && target.rendered)
      .map(target => ({ sourceId: target.sourceId, featureId: target.featureId }))
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  }, expected.focusId), { timeout: 15000 }).toEqual(expectedRendered);

  const diagnostics = await page.evaluate(() => window.AdventureMapRouteDetail.diagnostics());
  expect(diagnostics.failures).toEqual([]);
  expect(diagnostics.targets.filter(target => target.id === expected.focusId && target.rendered)).toHaveLength(3);
  expect(errors).toEqual([]);
});
