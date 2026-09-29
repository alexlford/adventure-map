import { test, expect } from '@playwright/test';

test('primary navigation follows keyboard order and exposes visible focus', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const brand = page.locator('.site-header .brand');
  const home = page.locator('.site-header .nav a').filter({ hasText: 'Home' });

  await brand.focus();
  await page.keyboard.press('Tab');
  await expect(home).toBeFocused();

  const focusStyle = await home.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset
    };
  });

  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(3);
  expect(Number.parseFloat(focusStyle.outlineOffset)).toBeGreaterThanOrEqual(2);
});

test('skip link reaches the main content with the keyboard', async ({ page }) => {
  await page.goto('/timeline/', { waitUntil: 'domcontentloaded' });

  const skipLink = page.locator('.skip-link');
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});
