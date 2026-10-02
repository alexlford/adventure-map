import { test, expect } from '@playwright/test';

test('low-resolution race photos are capped near their true size instead of stretched', async ({ page }) => {
  await page.goto('/record/2019-10-19-kansas-city-marathon/', { waitUntil: 'domcontentloaded' });
  const figure = page.locator('.race-memory-photo.race-memory-photo-lowres').first();
  await expect(figure).toBeVisible();
  const img = figure.locator('img');
  await expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  const { natural, shown } = await img.evaluate(el => ({ natural: el.naturalWidth, shown: el.getBoundingClientRect().width }));
  expect(shown).toBeLessThanOrEqual(natural * 2 + 1);
});

test('full-size race photos keep filling their frame', async ({ page }) => {
  await page.goto('/record/2015-04-25-illinois-marathon/', { waitUntil: 'domcontentloaded' });
  const fullSize = page.locator('.race-memory-photo:not(.race-memory-photo-lowres) img[src*="with-mom"]').first();
  await expect(fullSize).toBeVisible();
  const ratio = await fullSize.evaluate(el => el.getBoundingClientRect().width / el.closest('figure').getBoundingClientRect().width);
  expect(ratio).toBeGreaterThan(0.95);
});

test('the Illinois Marathon hero photo decodes instead of showing a broken image', async ({ page }) => {
  await page.goto('/record/2015-04-25-illinois-marathon/', { waitUntil: 'domcontentloaded' });
  const hero = page.locator('.race-memory-photo-hero img');
  await expect(hero).toBeVisible();
  const embeddedOk = await hero.evaluate(async el => {
    const svg = await (await fetch(el.currentSrc, { cache: 'no-store' })).text();
    const data = svg.match(/href="(data:image\/[^"]+)"/)?.[1];
    if (!data) return false;
    const probe = new Image();
    probe.src = data;
    try { await probe.decode(); return probe.naturalWidth > 0; } catch { return false; }
  });
  expect(embeddedOk).toBe(true);
});

test('race records without an exact date have no stray separator in the subtitle', async ({ page }) => {
  for (const slug of ['2006-river-to-river-relay', '2008-river-to-river-relay']) {
    await page.goto(`/record/${slug}/`, { waitUntil: 'domcontentloaded' });
    const meta = page.locator('.race-memory-meta');
    await expect(meta).toHaveText('Southern Illinois');
  }
  await page.goto('/record/2023-05-29-bolderboulder/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.race-memory-meta')).toHaveText(/^May 29, 2023 · Boulder, Colorado$/);
});
