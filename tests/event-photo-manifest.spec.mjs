import { test, expect } from '@playwright/test';

async function loadRecord(page, id) {
  return page.evaluate(async recordId => {
    const all = await window.AdventureSite.load();
    const record = all.find(item => item.id === recordId);
    if (!record) return null;
    return {
      id: record.id,
      slug: record.slug,
      name: record.name,
      media: record.media || []
    };
  }, id);
}

test('event photo manifest enriches canonical records and renders on detail pages', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const chicago = await loadRecord(page, 'chicago-marathon-2021');
  expect(chicago).toBeTruthy();
  const manifestPhoto = chicago.media.find(item => item.source === 'event-photo-manifest' && item.src.includes('/assets/event-photos/races/chicago-marathon-2021/'));
  expect(manifestPhoto).toBeTruthy();
  expect(manifestPhoto.alt).toMatch(/Chicago Marathon/i);

  await page.goto(`/detail.html?record=${encodeURIComponent(chicago.slug || chicago.id)}`, { waitUntil: 'domcontentloaded' });
  const photo = page.locator('#recordMedia img[src*="assets/event-photos/races/chicago-marathon-2021/"]').first();
  await expect(photo).toBeVisible();
  await expect(photo).toHaveJSProperty('complete', true);
  expect(await photo.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
});

test('I-Challenge weekend photo is shared with both canonical race records', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const fiveK = await loadRecord(page, 'illinois-5k-2016');
  const half = await loadRecord(page, 'illinois-half-2016');
  expect(fiveK).toBeTruthy();
  expect(half).toBeTruthy();
  expect(fiveK.media.some(item => item.src.includes('2016-04-30-illinois-i-challenge-half-finish-01.jpeg'))).toBeTruthy();
  expect(half.media.some(item => item.src.includes('2016-04-30-illinois-i-challenge-half-finish-01.jpeg'))).toBeTruthy();
});

test('unresolved photo is not attached to an arbitrary catalog record', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const unresolvedPath = 'snow-mountain-ranch-nordic-dog-skiing-unresolved-01.jpeg';
  const attached = await page.evaluate(async path => {
    const all = await window.AdventureSite.load();
    return all.filter(record => (record.media || []).some(item => item.src.includes(path))).map(record => record.id);
  }, unresolvedPath);
  expect(attached).toEqual([]);
});
