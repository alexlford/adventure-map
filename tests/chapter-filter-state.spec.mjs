import { test, expect } from '@playwright/test';

test('Race category filter restores from and writes to the URL', async ({ page }) => {
  await page.goto('/races.html?view=trail', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-filter="trail"]')).toHaveClass(/is-active/);
  await expect(page.locator('#timeline .timeline-year').first()).toBeVisible();
  await expect(page.locator('[data-filter="trail"]')).toHaveAttribute('aria-pressed','true');

  await page.locator('[data-filter="marathon"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('marathon');
  await expect(page.locator('[data-filter="marathon"]')).toHaveClass(/is-active/);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-filter="marathon"]')).toHaveClass(/is-active/);
});

test('Timeline category filter is shareable and restores cleanly', async ({ page }) => {
  await page.goto('/timeline.html?view=summits', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-filter="summits"]')).toHaveClass(/is-active/);
  await expect(page.locator('#timeline .timeline-year').first()).toBeVisible();

  await page.locator('[data-filter="skiing"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('skiing');
  await expect(page.locator('[data-filter="skiing"]')).toHaveAttribute('aria-pressed','true');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-filter="skiing"]')).toHaveClass(/is-active/);
});

test('Story archive category restores and remains shareable', async ({ page }) => {
  await page.goto('/adventures.html?view=mountain', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-filter="mountain"]')).toHaveClass(/is-active/);
  await expect(page.locator('#storyIndex .story-index-row').first()).toBeVisible();

  await page.locator('[data-filter="challenge"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('challenge');
  await expect(page.locator('[data-filter="challenge"]')).toHaveAttribute('aria-pressed','true');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-filter="challenge"]')).toHaveClass(/is-active/);
});
