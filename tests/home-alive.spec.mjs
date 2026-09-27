import { test, expect } from '@playwright/test';

test('homepage presents a distinct recent-adventure stream from live archive data', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#latest-title')).not.toHaveText('');
  await expect(page.locator('#recent-list .recent-item')).toHaveCount(3);

  const featuredHref = await page.locator('#latest-card').getAttribute('href');
  const recent = await page.locator('#recent-list .recent-item').evaluateAll(items => items.map(item => ({
    href: item.getAttribute('href'),
    title: item.querySelector('strong')?.textContent?.trim() || '',
    meta: item.querySelector('em')?.textContent?.trim() || ''
  })));

  expect(featuredHref).toBeTruthy();
  expect(new Set(recent.map(item => item.href)).size).toBe(3);
  expect(recent.every(item => item.href && item.href !== featuredHref)).toBe(true);
  expect(recent.every(item => item.title && item.meta)).toBe(true);
});

test('homepage ends with field notes and a live unambiguous archive snapshot', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Field notes', { exact: true })).toBeVisible();
  await expect(page.locator('#home-snapshot > div')).toHaveCount(4);

  const snapshot = await page.evaluate(() => ({
    records: Number(document.getElementById('snapshot-records')?.textContent?.replace(/,/g, '')),
    years: Number(document.getElementById('snapshot-years')?.textContent?.replace(/,/g, '')),
    routes: Number(document.getElementById('snapshot-routes')?.textContent?.replace(/,/g, '')),
    photos: Number(document.getElementById('snapshot-photos')?.textContent?.replace(/,/g, ''))
  }));

  expect(snapshot.records).toBeGreaterThan(100);
  expect(snapshot.years).toBeGreaterThan(10);
  expect(snapshot.routes).toBeGreaterThan(0);
  expect(snapshot.photos).toBeGreaterThan(0);
  expect(snapshot.routes).toBeLessThanOrEqual(snapshot.records);
  expect(snapshot.photos).toBeLessThanOrEqual(snapshot.records);
  await expect(page.locator('.landing-pursuit')).toHaveCount(0);
});

test('homepage hero reserves its verified image aspect ratio', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const hero = page.locator('.home-hero-photo img');
  await expect(hero).toHaveAttribute('width', '1536');
  await expect(hero).toHaveAttribute('height', '1152');
});