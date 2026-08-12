import { test, expect } from '@playwright/test';

test('Browser pages load the compiled public catalog instead of provenance layers', async ({ page }) => {
  const requested = [];
  page.on('request',request => requested.push(new URL(request.url()).pathname));

  await page.goto('/summits.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#summitCount')).not.toHaveText('—');
  await expect(page.locator('#summitList, #summitGrid, #elevationRanking').first()).toBeVisible();

  expect(requested.some(path => path.endsWith('/data/public-records.json'))).toBeTruthy();
  expect(requested.some(path => path.endsWith('/data/catalog.json'))).toBeFalsy();
  expect(requested.some(path => path.endsWith('/data/adventures.json'))).toBeFalsy();
});

test('Catalog loader falls back to canonical provenance sources if the compiled snapshot is unavailable', async ({ page }) => {
  const requested = [];
  page.on('request',request => requested.push(new URL(request.url()).pathname));
  await page.route('**/data/public-records.json',route => route.fulfill({status:404,contentType:'application/json',body:'{}'}));

  await page.goto('/summits.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#summitCount')).not.toHaveText('—');

  expect(requested.some(path => path.endsWith('/data/public-records.json'))).toBeTruthy();
  expect(requested.some(path => path.endsWith('/data/catalog.json'))).toBeTruthy();
  expect(requested.some(path => path.endsWith('/data/adventures.json'))).toBeTruthy();
});
