import { test, expect } from '@playwright/test';

const publicPages = [
  ['Home', '/index.html'],
  ['Explore', '/activities.html'],
  ['Map', '/map.html'],
  ['Stories', '/adventures.html'],
  ['Timeline', '/timeline.html'],
  ['Races', '/races.html'],
  ['Summits', '/summits.html'],
  ['Skiing', '/skiing.html'],
  ['Nordic', '/nordic.html'],
  ['Mountain biking', '/mountain-biking.html'],
];

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

for (const [name, path] of publicPages) {
  test(`${name} renders without runtime errors`, async ({ page }) => {
    const errors = collectRuntimeErrors(page);
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(response?.ok(), `${path} should return a successful response`).toBeTruthy();
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(900);
    expect(errors).toEqual([]);
  });
}

test('Map URL state restores layer and search', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map.html?layer=summits&q=mount', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-filter="summits"]')).toHaveClass(/is-active/);
  await expect(page.locator('#searchInput')).toHaveValue('mount');
  await expect(page.locator('#resultCount')).toContainText('shown');
  expect(errors).toEqual([]);
});

test('Representative detail record renders without runtime errors', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/detail.html?record=colorado-triathlon-2023', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText('Colorado Triathlon');
  await page.waitForTimeout(700);
  expect(errors).toEqual([]);
});

test('Coarse-touch Map starts passive and toggles interaction', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = collectRuntimeErrors(page);
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  expect(await page.evaluate(() => matchMedia('(max-width:820px) and (pointer:coarse)').matches)).toBeTruthy();
  await expect(page.locator('.map-panel')).toHaveClass(/is-touch-passive/);
  await expect(page.locator('.map-touch-toggle')).toHaveText('Explore map');
  expect(await page.evaluate(() => window.adventureMap.dragging.enabled())).toBeFalsy();
  await page.locator('.map-touch-toggle').click();
  await expect(page.locator('.map-panel')).toHaveClass(/is-touch-active/);
  await expect(page.locator('.map-touch-toggle')).toHaveText('Done');
  expect(await page.evaluate(() => window.adventureMap.dragging.enabled())).toBeTruthy();
  await page.locator('.map-touch-toggle').click();
  await expect(page.locator('.map-panel')).toHaveClass(/is-touch-passive/);
  expect(errors).toEqual([]);
  await context.close();
});
