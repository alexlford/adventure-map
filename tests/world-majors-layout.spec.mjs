import { test, expect } from '@playwright/test';

test('standalone World Majors passport stays compact and aligned on phone widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/world-majors/', { waitUntil: 'domcontentloaded' });

  const grid = page.locator('.majors-passport-grid');
  const cards = grid.locator('.major-passport');
  await expect(cards).toHaveCount(8);
  await expect(cards.first()).toBeVisible();
  await page.waitForTimeout(500);

  const layout = await cards.evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  const widths = layout.map(item => item.width);
  const heights = layout.map(item => item.height);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  expect(Math.max(...heights)).toBeLessThan(230);

  const completed = cards.filter({ hasText: 'Chicago' }).first();
  const stamp = completed.locator('.passport-earned-stamp');
  await expect(stamp).toHaveCount(1);
  await expect(stamp).toHaveAttribute('aria-label', 'Completed');
  await expect(stamp).toHaveText('');
  const stampBackground = await stamp.evaluate(node => getComputedStyle(node).backgroundColor);
  expect(stampBackground).toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('#worldMajorsCompletedStampFix')).toHaveCount(0);
  await expect(page.locator('#majorsResponsiveFix')).toHaveCount(0);

  const overlap = await completed.evaluate(node => {
    const title = node.querySelector('h3')?.getBoundingClientRect();
    const stamp = node.querySelector('.passport-earned-stamp')?.getBoundingClientRect();
    if (!title || !stamp) return true;
    return !(title.right <= stamp.left || title.left >= stamp.right || title.bottom <= stamp.top || title.top >= stamp.bottom);
  });
  expect(overlap).toBeFalsy();
});
