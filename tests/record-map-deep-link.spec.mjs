import { test, expect } from '@playwright/test';

const recordKey = 'chicago-marathon-2021';

test('Clean record pages carry record context into the map action', async ({ page }) => {
  await page.goto(`/record/${recordKey}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hero h1')).toContainText('Chicago');

  const mapAction = page.getByRole('link',{name:'Explore on map'});
  await expect(mapAction).toHaveAttribute('href',`map.html?record=${recordKey}`);
});

test('Master map record deep link focuses the matching archive entry', async ({ page }) => {
  await page.goto(`/map.html?record=${recordKey}`, { waitUntil: 'domcontentloaded' });

  const item = page.locator(`.adventure-item[data-id="${recordKey}"]`);
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#map .leaflet-popup')).toBeVisible();
  await expect(page.locator('#map .leaflet-popup')).toContainText('Chicago Marathon');
  await expect.poll(() => new URL(page.url()).searchParams.get('record')).toBe(recordKey);
});

test('Changing map state releases a record deep link cleanly', async ({ page }) => {
  await page.goto(`/map.html?record=${recordKey}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(`.adventure-item[data-id="${recordKey}"]`)).toHaveAttribute('aria-pressed','true');

  await page.locator('[data-filter="summits"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('record')).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get('layer')).toBe('summits');
  await expect(page.locator('[data-filter="summits"]')).toHaveClass(/is-active/);
});
