import { test, expect } from '@playwright/test';

const waitForMap = async page => {
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expect.poll(() => page.evaluate(() => window.AdventureMap?.state?.().recordCount || 0)).toBeGreaterThan(0);
};

test('map enhancements no longer replace core state or render functions', async ({ page }) => {
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await waitForMap(page);

  const source = await page.evaluate(() => fetch('/map-enhancements.js').then(response => response.text()));
  for (const name of ['renderMarkers', 'focusAdventure', 'setRouteEmphasis', 'applyFocusStyles', 'render']) {
    expect(source).not.toMatch(new RegExp(`\\b${name}\\s*=`));
  }
  expect(source).not.toContain('originalRender');
});

test('core render preserves a visible pinned record and releases it when filtered out', async ({ page }) => {
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await waitForMap(page);

  const result = await page.evaluate(() => {
    const api = window.AdventureMap;
    const record = api.filteredRecords().find(item => api.layerFor(item) !== 'mtb');
    if (!record) return null;

    api.focus(record.id);
    api.refresh();
    const afterRefresh = api.state();

    api.setViewState({ filter: 'mtb' });
    const afterFilter = api.state();

    return {
      id: record.id,
      afterRefresh,
      afterFilter,
    };
  });

  expect(result, 'catalog should contain a record outside the MTB layer').toBeTruthy();
  expect(result.afterRefresh.focusId).toBe(result.id);
  expect(result.afterRefresh.pinnedFocusId).toBe(result.id);
  expect(result.afterFilter.focusId).toBeNull();
  expect(result.afterFilter.pinnedFocusId).toBeNull();
});
