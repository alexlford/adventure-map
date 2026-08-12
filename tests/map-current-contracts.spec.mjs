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

test('Map presents recovered official race context', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const result = await page.evaluate(async () => {
    const all = await window.AdventureCatalog.load();
    const race = all.find(record => record.kind === 'race' && record.officialTime && (record.officialDistance || record.officialDistanceMi));
    if (!race) return null;
    return {
      id: race.id,
      name: race.name,
      officialTime: race.officialTime,
      officialDistance: race.officialDistance || `${race.officialDistanceMi} mi`,
      officialPlace: race.officialPlace || null,
      html: window.popupCard?.(race) || '',
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
