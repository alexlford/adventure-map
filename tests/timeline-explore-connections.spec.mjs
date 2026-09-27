import { test, expect } from '@playwright/test';

test('Timeline facets are shareable and filter the chronology by year', async ({ page }) => {
  await page.goto('/timeline.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#timeline .timeline-year').first()).toBeVisible();

  const year = await page.locator('#timelineYear option').nth(1).getAttribute('value');
  expect(year).toMatch(/^\d{4}$/);
  await page.locator('#timelineYear').selectOption(year);

  await expect.poll(() => new URL(page.url()).searchParams.get('year')).toBe(year);
  await expect(page.locator('#timeline .timeline-year')).toHaveCount(1);
  await expect(page.locator('#timeline .timeline-year h3')).toHaveText(year);

  const stateUrl = page.url();
  await page.goto(stateUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#timelineYear')).toHaveValue(year);
  await expect(page.locator('#timeline .timeline-year h3')).toHaveText(year);
});

test('Timeline race-distance selection hands the exact record set to the map', async ({ page }) => {
  await page.goto('/timeline.html?view=races&distance=marathon', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-filter="races"]')).toHaveClass(/is-active/);
  await expect(page.locator('#timelineDistance')).toHaveValue('marathon');
  await expect(page.locator('#timeline .timeline-item').first()).toBeVisible();

  const timelineCountText = await page.locator('#timelineResultSummary').textContent();
  const timelineCount = Number(timelineCountText?.match(/^(\d+)/)?.[1]);
  expect(timelineCount).toBeGreaterThan(0);

  const mapHref = await page.locator('#timelineMapLink').getAttribute('href');
  expect(mapHref).toContain('selection=');
  expect(mapHref).toContain('source=timeline');

  await page.locator('#timelineMapLink').click();
  await expect(page.locator('.map-selection-context')).toBeVisible();
  await expect(page.locator('.map-selection-context')).toContainText(`Timeline selection · ${timelineCount} record`);
  await expect.poll(() => new URL(page.url()).searchParams.get('source')).toBe('timeline');
  expect(new URL(page.url()).searchParams.get('selection')?.split(',').length).toBe(timelineCount);
});

test('Using normal map controls exits a carried Timeline selection', async ({ page }) => {
  await page.goto('/timeline.html?view=summits', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#timelineMapLink')).toHaveAttribute('href', /selection=/);
  await page.locator('#timelineMapLink').click();
  await expect(page.locator('.map-selection-context')).toBeVisible();

  await page.locator('[data-filter="summits"]').click();
  await expect(page.locator('.map-selection-context')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get('selection')).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get('layer')).toBe('summits');
});

test('A filtered Map view becomes the exact same record set in Timeline', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await page.locator('[data-filter="summits"]').click();

  const mapCountText = await page.locator('#resultCount').textContent();
  const mapCount = Number(mapCountText?.match(/(\d+)/)?.[1]);
  expect(mapCount).toBeGreaterThan(0);
  await expect(page.locator('.map-timeline-link')).toHaveAttribute('href', /selection=/);

  await page.locator('.map-timeline-link').click();
  await expect(page.locator('.archive-source-context')).toBeVisible();
  await expect(page.locator('.archive-source-context')).toContainText(`Map selection · ${mapCount} record`);
  await expect(page.locator('#timeline .timeline-item').first()).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('source')).toBe('map');
  expect(new URL(page.url()).searchParams.get('selection')?.split(',').length).toBe(mapCount);
});
