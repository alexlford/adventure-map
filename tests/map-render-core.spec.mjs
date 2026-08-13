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

test('archive chronology is applied after core row rendering without replacing core functions', async ({ page }) => {
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await waitForMap(page);

  const result = await page.evaluate(async () => {
    const api = window.AdventureMap;
    const records = new Map(api.records().map(record => [record.id, record]));
    const source = await fetch('/map-ui-polish.js').then(response => response.text());
    const ids = Array.from(document.querySelectorAll('#adventureList .adventure-item'), node => node.dataset.id);
    const dateKey = record => {
      if (!record) return '0000-00-00';
      const date = String(record.date || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
      const year = Number(record.year) || Number(date.match(/^(\d{4})/)?.[1]);
      return Number.isFinite(year) && year > 1900 ? `${String(year).padStart(4, '0')}-00-00` : '0000-00-00';
    };
    return {
      source,
      ids,
      keys: ids.map(id => dateKey(records.get(id))),
    };
  });

  expect(result.ids.length).toBeGreaterThan(1);
  for (let index = 1; index < result.keys.length; index += 1) {
    expect(result.keys[index - 1].localeCompare(result.keys[index]), `archive order inversion at row ${index}`).toBeGreaterThanOrEqual(0);
  }
  expect(result.source).toContain("internal.registerPresentationHook('afterRenderList'");
  expect(result.source).toContain("internal.registerPresentationHook('afterFocusStyles'");
  expect(result.source).not.toMatch(/renderList\s*=/);
  expect(result.source).not.toMatch(/applyFocusStyles\s*=/);
});
