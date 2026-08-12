import { test, expect } from '@playwright/test';

test('Map interactions publish shareable URL state and restore it on reload', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  await page.locator('[data-filter="summits"]').click();
  await page.locator('#searchInput').fill('mount');
  await page.locator('#searchInput').dispatchEvent('input');

  const years = await page.locator('#yearFrom option').evaluateAll(options => options.map(option => option.value).filter(Boolean));
  if (years.length > 2) {
    await page.locator('#yearFrom').selectOption(years.at(-2));
    await page.locator('#yearTo').selectOption(years.at(-1));
  }

  await expect.poll(() => new URL(page.url()).searchParams.get('layer')).toBe('summits');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('mount');
  if (years.length > 2) {
    await expect.poll(() => new URL(page.url()).searchParams.get('from')).toBe(years.at(-2));
    await expect.poll(() => new URL(page.url()).searchParams.get('to')).toBe(years.at(-1));
  }

  const stateUrl = page.url();
  await page.goto(stateUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-filter="summits"]')).toHaveClass(/is-active/);
  await expect(page.locator('#searchInput')).toHaveValue('mount');
  if (years.length > 2) {
    await expect(page.locator('#yearFrom')).toHaveValue(years.at(-2));
    await expect(page.locator('#yearTo')).toHaveValue(years.at(-1));
  }
});
