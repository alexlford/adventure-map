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

async function expectOnlyPressed(page, filter) {
  const buttons = page.locator('.filter-row [data-filter]');
  await expect(buttons).toHaveCount(8);
  await expect(page.locator('.filter-row [data-filter][aria-pressed="true"]')).toHaveCount(1);
  const selected = page.locator(`[data-filter="${filter}"]`);
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(selected).toHaveClass(/is-active/);
  await expect(page.locator('.filter-row [data-filter].is-active')).toHaveCount(1);
}

test('Map layer buttons synchronize visual and accessible selected state', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  await expectOnlyPressed(page, 'all');

  await page.locator('[data-filter="mtb"]').click();
  await expect.poll(() => page.evaluate(() => window.AdventureMap?.state?.().filter)).toBe('mtb');
  await expectOnlyPressed(page, 'mtb');

  await page.evaluate(() => window.AdventureMap.setViewState({ filter: 'nordic' }));
  await expect.poll(() => page.evaluate(() => window.AdventureMap?.state?.().filter)).toBe('nordic');
  await expectOnlyPressed(page, 'nordic');

  await page.goto('/map.html?layer=trail-races', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expect.poll(() => page.evaluate(() => window.AdventureMap?.state?.().filter)).toBe('trail-races');
  await expectOnlyPressed(page, 'trail-races');

  expect(errors).toEqual([]);
});
