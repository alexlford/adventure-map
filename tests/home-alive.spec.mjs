import { test, expect } from '@playwright/test';

test('homepage surfaces recent archive records without duplicating the featured latest adventure', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const recent = page.locator('#recent-grid .recent-card');
  await expect(recent).toHaveCount(4);
  await expect(page.locator('#recent-title')).toHaveText('Fresh from the archive.');

  const latestHref = await page.locator('#latest-card').getAttribute('href');
  const recentHrefs = await recent.evaluateAll(cards => cards.map(card => card.getAttribute('href')));
  expect(latestHref).toBeTruthy();
  expect(recentHrefs).not.toContain(latestHref);
  expect(new Set(recentHrefs).size).toBe(4);
  for (const href of recentHrefs) expect(href).toMatch(/^record\/.+\/$/);

  const photoCards = recent.filter({ has: page.locator('img') });
  const photoCount = await photoCards.count();
  for (let index = 0; index < photoCount; index += 1) {
    await expect(photoCards.nth(index).locator('img')).toHaveAttribute('loading', 'lazy');
  }

  expect(errors).toEqual([]);
});

test('generated photo index exposes rendering metadata without provenance internals', async ({ page }) => {
  const response = await page.request.get('/data/photo-index.json');
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();

  expect(payload.schemaVersion).toBe(1);
  expect(payload.recordCount).toBeGreaterThan(0);
  expect(payload.photoCount).toBeGreaterThanOrEqual(payload.recordCount);

  const mountSherman = payload.records['mount-sherman'];
  expect(mountSherman?.primary?.path).toContain('mount-sherman');
  expect(mountSherman?.primary?.width).toBe(1536);
  expect(mountSherman?.primary?.height).toBe(1152);
  expect(JSON.stringify(payload)).not.toContain('repositoryBlobSha');
  expect(JSON.stringify(payload)).not.toContain('evidence');
});

test('record pages use manifest-backed photography when no curated photo essay exists', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/record/2022-09-25-mount-sherman/', { waitUntil: 'domcontentloaded' });

  const media = page.locator('.record-media-indexed');
  await expect(media).toHaveCount(1);
  await expect(media.locator('h2')).toHaveText('Scenes from the day');
  const image = media.locator('img').first();
  await expect(image).toHaveAttribute('src', /mount-sherman-summit-with-olive/);
  await expect(image).toHaveAttribute('width', '1536');
  await expect(image).toHaveAttribute('height', '1152');
  await expect(image).toHaveAttribute('loading', 'lazy');
  await expect(page.locator('body')).toHaveClass(/has-record-media/);

  expect(errors).toEqual([]);
});
