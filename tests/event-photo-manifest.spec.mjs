import { test, expect } from '@playwright/test';

async function loadRecord(page, id) {
  return page.evaluate(async recordId => {
    const all = await window.AdventureSite.load({ fresh: true });
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
  expect(chicago.media).toHaveLength(1);
  expect(chicago.media[0].source).toBe('event-photo-manifest');
  expect(chicago.media[0].src).toContain('/assets/event-photos/races/chicago-marathon-2021/');
  expect(chicago.media[0].alt).toMatch(/Chicago Marathon/i);

  await page.goto(`/detail.html?record=${encodeURIComponent(chicago.slug || chicago.id)}`, { waitUntil: 'domcontentloaded' });
  const photo = page.locator('#recordMedia img').first();
  await photo.scrollIntoViewIfNeeded();
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute('src', /assets\/event-photos\/races\/chicago-marathon-2021\//);
  await expect.poll(
    () => photo.evaluate(node => node.complete && node.naturalWidth > 0),
    { message: 'lazy-loaded event photo should finish loading' }
  ).toBe(true);
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
    const all = await window.AdventureSite.load({ fresh: true });
    return all.filter(record => (record.media || []).some(item => item.src.includes(path))).map(record => record.id);
  }, unresolvedPath);
  expect(attached).toEqual([]);
});
