import { test, expect } from '@playwright/test';

const recordKey = 'chicago-marathon-2021';
const recordSlug = '2021-10-10-chicago-marathon';

test('Clean record pages carry record context into the map action', async ({ page }) => {
  await page.goto(`/record/${recordSlug}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hero h1')).toContainText('Chicago');

  const mapAction = page.getByRole('link',{name:'Explore on map'});
  await expect(mapAction).toHaveAttribute('href',`map.html?record=${recordSlug}`);
});

test('Master map record deep link survives asynchronous map enrichment', async ({ page }) => {
  await page.goto(`/map.html?record=${recordKey}`, { waitUntil: 'domcontentloaded' });

  const item = page.locator(`.adventure-item[data-id="${recordKey}"]`);
  const popup = page.locator('#map .leaflet-popup');
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute('aria-pressed','true');

  const baseRouteFeatures = await page.evaluate(async () => {
    const base = await fetch('data/routes.geojson').then(response => response.json());
    return base.features?.length || 0;
  });
  await expect(page.locator('#skiCount')).not.toHaveText('—');
  await expect.poll(async () => Number(await page.locator('#routeCount').textContent() || 0)).toBeGreaterThan(baseRouteFeatures);

  await expect(item).toHaveAttribute('aria-pressed','true');
  await expect(popup).toBeVisible();
  await expect(popup).toHaveCount(1);
  await expect(popup).toContainText('Chicago Marathon');
  await expect.poll(() => new URL(page.url()).searchParams.get('record')).toBe(recordKey);
  await page.waitForTimeout(650);
  await expect(popup).toHaveCount(1);
  await expect(popup).toContainText('Chicago Marathon');
});

test('Selecting a record on the map creates a shareable focused URL', async ({ page }) => {
  await page.goto('/map.html?q=Chicago%20Marathon', { waitUntil: 'domcontentloaded' });
  const item = page.locator(`.adventure-item[data-id="${recordKey}"]`);
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute('aria-pressed','false');

  await item.click();
  await expect(item).toHaveAttribute('aria-pressed','true');
  await expect.poll(() => new URL(page.url()).searchParams.get('record')).toBe(recordSlug);
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('Chicago Marathon');
});

test('Changing map state releases a record deep link cleanly', async ({ page }) => {
  await page.goto(`/map.html?record=${recordKey}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(`.adventure-item[data-id="${recordKey}"]`)).toHaveAttribute('aria-pressed','true');

  await page.locator('[data-filter="summits"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('record')).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get('layer')).toBe('summits');
  await expect(page.locator('[data-filter="summits"]')).toHaveClass(/is-active/);
});
