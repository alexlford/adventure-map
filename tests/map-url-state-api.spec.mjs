import { test, expect } from '@playwright/test';

const waitForMap = async page => {
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expect.poll(() => page.evaluate(() => window.AdventureMap?.state?.().recordCount || 0)).toBeGreaterThan(0);
};

test('Map restores layer, search, and years from the URL through AdventureMap', async ({ page }) => {
  await page.goto('/map/?layer=summits&from=2023&through=2024&q=mount', { waitUntil: 'domcontentloaded' });
  await waitForMap(page);

  const state = await page.evaluate(() => window.AdventureMap.state());
  expect(state.filter).toBe('summits');
  expect(state.search).toBe('mount');
  expect(state.yearFrom).toBe(2023);
  expect(state.yearTo).toBe(2024);
  await expect(page.locator('[data-filter="summits"]')).toHaveClass(/is-active/);
  await expect(page.locator('#searchInput')).toHaveValue('mount');
  await expect(page.locator('#yearFrom')).toHaveValue('2023');
  await expect(page.locator('#yearTo')).toHaveValue('2024');
});

test('Map restores a record deep link without DOM observers or function monkey-patching', async ({ page }) => {
  await page.goto('/map/?record=decalibron-2023', { waitUntil: 'domcontentloaded' });
  await waitForMap(page);
  await expect.poll(() => page.evaluate(() => {
    const state = window.AdventureMap.state();
    return state.pinnedFocusId || state.focusId;
  })).toBe('decalibron-2023');

  const state = await page.evaluate(() => window.AdventureMap.state());
  expect(state.filter).toBe('adventures');
  expect(new URL(page.url()).searchParams.get('record')).toBe('2023-08-13-decalibron');

  const source = await page.evaluate(() => fetch('/map-url-state.js').then(response => response.text()));
  expect(source).toContain('window.AdventureMap');
  expect(source).toContain('api.ready()');
  expect(source).not.toContain('MutationObserver');
  expect(source).not.toMatch(/initYearControls\s*=/);
  expect(source).not.toContain('filteredAdventures()');
  expect(source).not.toContain('focusAdventure(');
});

test('Map control changes keep the clean URL synchronized', async ({ page }) => {
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await waitForMap(page);

  await page.locator('[data-filter="mtb"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('layer')).toBe('mtb');

  await page.locator('#searchInput').fill('winter park');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('winter park');
});
