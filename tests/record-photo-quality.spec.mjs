import { test, expect } from '@playwright/test';

// A 100x150 JPEG stands in for an undersized archive photo.
const TINY_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCACWAGQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCtRRRXnH0YUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9k=', 'base64');

test('low-resolution race photos are capped near their true size instead of stretched', async ({ page }) => {
  await page.route('**/2019-10-19-kansas-city-marathon-course-01.jpeg', route => route.fulfill({ contentType: 'image/jpeg', body: TINY_JPEG }));
  await page.goto('/record/2019-10-19-kansas-city-marathon/', { waitUntil: 'domcontentloaded' });
  const figure = page.locator('.race-memory-photo.race-memory-photo-lowres:has(img[src*="kansas-city-marathon-course"])').first();
  await expect(figure).toBeVisible();
  const img = figure.locator('img');
  await expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth)).toBe(100);
  const shown = await img.evaluate(el => el.getBoundingClientRect().width);
  expect(shown).toBeLessThanOrEqual(201);
});

test('restored full-size photos fill their frame instead of being capped', async ({ page }) => {
  await page.goto('/record/2019-10-19-kansas-city-marathon/', { waitUntil: 'domcontentloaded' });
  const restored = page.locator('.race-memory-photo img[src*="kansas-city-marathon-course"]').first();
  await expect(restored).toBeVisible();
  await expect(page.locator('.race-memory-photo-lowres')).toHaveCount(0);
  await expect.poll(() => restored.evaluate(el => el.complete && el.naturalWidth)).toBeGreaterThanOrEqual(480);
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
