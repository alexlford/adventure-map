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
    await expect(index.locator('a[aria-current="location"]')).toHaveCount(1);
  });
}

test('Race chapter index picks up the asynchronously rendered Majors feature', async ({ page }) => {
  await page.goto('/races.html', { waitUntil:'domcontentloaded' });
  const index = page.locator('.chapter-index');
  await expect(index.getByRole('link',{name:'A marathon journey around the world.'})).toBeVisible();
});

test('Chapter index follows the section being read without moving the page vertically', async ({ page }) => {
  await page.goto('/races.html', { waitUntil:'domcontentloaded' });
  await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  const index = page.locator('.chapter-index');
  await expect(index.getByRole('link',{name:'A marathon journey around the world.'})).toBeVisible();
  const links = index.locator('a');
  await expect(links.nth(1)).toBeVisible();
  const href = await links.nth(1).getAttribute('href');
  await page.locator(href).evaluate(element => {
    const top = window.scrollY + element.getBoundingClientRect().top - 180;
    window.scrollTo(0,Math.max(0,top));
  });
  await page.waitForTimeout(50);
  const before = await page.evaluate(() => window.scrollY);
  await expect.poll(async () => await links.nth(1).getAttribute('aria-current')).toBe('location');
  await expect(links.nth(1)).toHaveClass(/is-current/);
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after-before)).toBeLessThan(4);
});

test('Chapter index stays sticky and horizontally navigable on phone widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/races.html', { waitUntil:'domcontentloaded' });
  const index = page.locator('.chapter-index');
  await expect(index.getByRole('link',{name:'A marathon journey around the world.'})).toBeVisible();
  await expect.poll(async () => index.evaluate(node => {
    const style=getComputedStyle(node);
    return `${style.overflowX}|${style.position}`;
  })).toBe('auto|sticky');
  const metrics = await index.evaluate(node => ({
    overflowX:getComputedStyle(node).overflowX,
    position:getComputedStyle(node).position,
    top:parseFloat(getComputedStyle(node).top),
    scrollWidth:node.scrollWidth,
    clientWidth:node.clientWidth,
    whiteSpace:getComputedStyle(node.querySelector('a')).whiteSpace
  }));
  expect(metrics.overflowX).toBe('auto');
  expect(metrics.position).toBe('sticky');
  expect(metrics.top).toBeGreaterThan(0);
  expect(metrics.whiteSpace).toBe('nowrap');
  expect(metrics.scrollWidth).toBeGreaterThanOrEqual(metrics.clientWidth);
});
