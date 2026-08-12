import { test, expect } from '@playwright/test';

for (const pagePath of ['/races.html','/summits.html','/skiing.html','/nordic.html','/mountain-biking.html']) {
  test(`${pagePath} exposes an on-page chapter index`, async ({ page }) => {
    await page.goto(pagePath, { waitUntil: 'domcontentloaded' });
    const index = page.locator('.chapter-index');
    await expect(index).toBeVisible();
    await expect(index).toHaveAttribute('aria-label','On this page');
    const links = index.locator('a');
    expect(await links.count()).toBeGreaterThanOrEqual(2);
    const href = await links.first().getAttribute('href');
    expect(href).toMatch(/^#chapter-|^#[A-Za-z]/);
    const target = page.locator(href);
    await expect(target).toHaveAttribute('data-chapter-anchor','true');
  });
}

test('Chapter index stays compact and horizontally navigable on phone widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/races.html', { waitUntil: 'domcontentloaded' });
  const index = page.locator('.chapter-index');
  await expect(index).toBeVisible();
  const metrics = await index.evaluate(node => ({
    overflowX:getComputedStyle(node).overflowX,
    scrollWidth:node.scrollWidth,
    clientWidth:node.clientWidth,
    whiteSpace:getComputedStyle(node.querySelector('a')).whiteSpace
  }));
  expect(['auto','scroll']).toContain(metrics.overflowX);
  expect(metrics.whiteSpace).toBe('nowrap');
  expect(metrics.scrollWidth).toBeGreaterThanOrEqual(metrics.clientWidth);
});
