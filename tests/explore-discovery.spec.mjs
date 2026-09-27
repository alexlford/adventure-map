import { test, expect } from '@playwright/test';

test('Timeline restores discovery facets and keeps them shareable', async ({ page }) => {
  await page.goto('/timeline.html?view=races&from=2022&through=2023&place=Colorado&distance=Half%20marathon&status=verified', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('[data-filter="races"]')).toHaveClass(/is-active/);
  await expect(page.locator('#timelineYearFrom')).toHaveValue('2022');
  await expect(page.locator('#timelineYearTo')).toHaveValue('2023');
  await expect(page.locator('#timelinePlace')).toHaveValue('Colorado');
  await expect(page.locator('#timelineDistance')).toHaveValue('Half marathon');
  await expect(page.locator('#timelineStatus')).toHaveValue('verified');
  await expect(page.locator('#timeline .timeline-year').first()).toBeVisible();

  const years = await page.locator('#timeline .timeline-year h3').allTextContents();
  expect(years.every(year => ['2022', '2023'].includes(year.trim()))).toBeTruthy();
  await expect(page.locator('#timelineSummary')).toContainText('verified matches');

  const mapHref = await page.locator('#timelineMapLink').getAttribute('href');
  const mapUrl = new URL(mapHref, 'http://example.test');
  expect(mapUrl.searchParams.get('from')).toBe('2022');
  expect(mapUrl.searchParams.get('through')).toBe('2023');
  expect(mapUrl.searchParams.get('q')).toBe('Colorado');
});

test('Timeline carries direct activity, search, and year state to the map', async ({ page }) => {
  await page.goto('/timeline.html?view=summits&from=2018&through=2025&q=Mount', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#timeline .timeline-year').first()).toBeVisible();

  const href = await page.locator('#timelineMapLink').getAttribute('href');
  const url = new URL(href, 'http://example.test');
  expect(url.pathname).toMatch(/\/map(?:\.html)?$/);
  expect(url.searchParams.get('layer')).toBe('summits');
  expect(url.searchParams.get('q')).toBe('Mount');
  expect(url.searchParams.get('from')).toBe('2018');
  expect(url.searchParams.get('through')).toBe('2025');
});

test('Map exposes the current activity, search, and years as a Timeline handoff', async ({ page }) => {
  await page.goto('/map.html?layer=summits&from=2018&through=2025&q=Mount', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.map-timeline-link')).toBeVisible();

  const href = await page.locator('.map-timeline-link').getAttribute('href');
  const url = new URL(href, 'http://example.test');
  expect(url.pathname).toMatch(/\/timeline(?:\.html)?$/);
  expect(url.searchParams.get('view')).toBe('summits');
  expect(url.searchParams.get('q')).toBe('Mount');
  expect(url.searchParams.get('from')).toBe('2018');
  expect(url.searchParams.get('through')).toBe('2025');
});

test('Record pages expose inferred nearby archive connections', async ({ page }) => {
  await page.goto('/detail.html?record=staunton-rocks-half-2022', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText('Staunton Rocks');
  await expect(page.locator('.context-related-section')).toBeVisible();
  await expect(page.locator('.context-related-section h2')).toHaveText('Nearby in the archive');
  await expect(page.locator('.context-related-link').first()).toBeVisible();
});
