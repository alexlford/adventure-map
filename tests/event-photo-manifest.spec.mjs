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
  expect(chicago.media.some(item => item.source === 'event-photo-manifest')).toBeTruthy();
  const manifestPhoto = chicago.media.find(item => item.source === 'event-photo-manifest');
  expect(manifestPhoto.src).toContain('/assets/event-photos/races/chicago-marathon-2021/');
  expect(manifestPhoto.alt).toMatch(/Chicago Marathon/i);

  await page.goto(`/detail.html?record=${encodeURIComponent(chicago.slug || chicago.id)}`, { waitUntil: 'domcontentloaded' });
  const photo = page.locator('#recordMedia img[src*="assets/event-photos/races/chicago-marathon-2021/"]').first();
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute('alt', /Chicago Marathon/i);

  const assetResponse = await page.request.get(manifestPhoto.src);
  expect(assetResponse.ok()).toBeTruthy();
  expect(assetResponse.headers()['content-type']).toMatch(/^image\//i);
  expect((await assetResponse.body()).byteLength).toBeGreaterThan(0);
});

test('2015 Illinois Marathon thunderstorm finish is attached to the marathon, not the 2016 I-Challenge races', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const marathon = await loadRecord(page, 'illinois-marathon-2015');
  const fiveK = await loadRecord(page, 'illinois-5k-2016');
  const half = await loadRecord(page, 'illinois-half-2016');
  expect(marathon).toBeTruthy();
  expect(fiveK).toBeTruthy();
  expect(half).toBeTruthy();
  const filename = '2015-04-25-illinois-marathon-thunderstorm-finish-01.jpeg';
  expect(marathon.media.some(item => item.src.includes(filename))).toBeTruthy();
  expect(fiveK.media.some(item => item.src.includes(filename))).toBeFalsy();
  expect(half.media.some(item => item.src.includes(filename))).toBeFalsy();
});

test('reviewed Frisco Nordic photos preserve exact and general-use scope', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const january7 = await loadRecord(page, 'nordic-day-2024-01-07');
  expect(january7).toBeTruthy();
  expect(january7.media.some(item => item.src.includes('2024-01-07-frisco-nordic-center-basil-olive-01.jpeg'))).toBeTruthy();

  const candidateFilename = '2024-01-frisco-nordic-center-with-olive-01.jpeg';
  const attached = await page.evaluate(async path => {
    const all = await window.AdventureSite.load({ fresh: true });
    return all.filter(record => (record.media || []).some(item => item.src.includes(path))).map(record => record.id);
  }, candidateFilename);
  expect(attached).toEqual([]);
});

test('BOLDERBoulder photo is attached to 2023, not 2024', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const race2023 = await loadRecord(page, 'bolderboulder-2023');
  const race2024 = await loadRecord(page, 'bolderboulder-2024');
  expect(race2023).toBeTruthy();
  expect(race2024).toBeTruthy();
  const filename = '2023-05-29-bolderboulder-10k-course-01.jpeg';
  expect(race2023.media.some(item => item.src.includes(filename))).toBeTruthy();
  expect(race2024.media.some(item => item.src.includes(filename))).toBeFalsy();
});
