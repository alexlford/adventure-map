import { test, expect } from '@playwright/test';

async function expectStableImages(page, selector = 'img') {
  const images = page.locator(selector);
  const count = await images.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const image = images.nth(index);
    const state = await image.evaluate(node => ({
      src: node.getAttribute('src'),
      alt: node.getAttribute('alt'),
      width: Number(node.getAttribute('width')),
      height: Number(node.getAttribute('height')),
      decoding: node.getAttribute('decoding'),
      loading: node.getAttribute('loading'),
      fetchpriority: node.getAttribute('fetchpriority')
    }));
    expect(state.alt?.trim(), `${state.src} needs meaningful alt text`).toBeTruthy();
    expect(state.width, `${state.src} needs intrinsic width`).toBeGreaterThan(0);
    expect(state.height, `${state.src} needs intrinsic height`).toBeGreaterThan(0);
    expect(state.decoding, `${state.src} should decode asynchronously`).toBe('async');
    if (state.fetchpriority === 'high') {
      expect(state.loading, `${state.src} is a priority image`).not.toBe('lazy');
    } else {
      expect(state.loading, `${state.src} should lazy-load`).toBe('lazy');
    }
  }
}

test('home photos have stable, descriptive markup', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectStableImages(page);
});

for (const record of ['chicago-marathon-2021', 'colfax-5k-2024', 'illinois-marathon-2015']) {
  test(`${record} memory photos have stable, descriptive markup`, async ({ page }) => {
    await page.goto(`/detail.html?record=${record}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveClass(/race-memory-page/);
    await expect(page.locator('.race-memory-photo img').first()).toBeVisible();
    await expectStableImages(page, '.race-memory-photo img');
  });
}
