import { test, expect } from '@playwright/test';

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('Failed to load resource')) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

function skipUnlessMobileWebKit(testInfo) {
  test.skip(testInfo.project.name !== 'webkit-mobile', 'coarse-pointer mobile interaction contract');
}

test('mobile map preserves page scrolling until Explore map is enabled', async ({ page }, testInfo) => {
  skipUnlessMobileWebKit(testInfo);
  const errors = collectRuntimeErrors(page);

  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expect(page.locator('#skiCount')).not.toHaveText('—');

  const coarsePointer = await page.evaluate(() => matchMedia('(max-width:820px) and (pointer:coarse)').matches);
  expect(coarsePointer).toBeTruthy();

  const panel = page.locator('.map-panel');
  const toggle = page.locator('.map-touch-toggle');
  await expect(panel).toHaveClass(/is-touch-passive/);
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveText('Explore map');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  const passive = await page.evaluate(() => {
    const map = window.AdventureMap?.leaflet;
    return {
      dragging: map?.dragging?.enabled?.(),
      touchZoom: map?.touchZoom?.enabled?.(),
      keyboard: map?.keyboard?.enabled?.(),
      scrollWheelZoom: map?.scrollWheelZoom?.enabled?.(),
    };
  });
  expect(passive.dragging).toBeFalsy();
  expect(passive.touchZoom).toBeFalsy();
  expect(passive.keyboard).toBeFalsy();
  expect(passive.scrollWheelZoom).toBeFalsy();

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.evaluate(() => window.scrollBy(0, 240));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await expect(panel).toHaveClass(/is-touch-active/);
  await expect(toggle).toHaveText('Done');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  const active = await page.evaluate(() => {
    const map = window.AdventureMap?.leaflet;
    return {
      dragging: map?.dragging?.enabled?.(),
      touchZoom: map?.touchZoom?.enabled?.(),
      keyboard: map?.keyboard?.enabled?.(),
      scrollWheelZoom: map?.scrollWheelZoom?.enabled?.(),
    };
  });
  expect(active.dragging).toBeTruthy();
  expect(active.touchZoom).toBeTruthy();
  expect(active.keyboard).toBeTruthy();
  expect(active.scrollWheelZoom).toBeFalsy();

  await toggle.click();
  await expect(panel).toHaveClass(/is-touch-passive/);
  await expect(toggle).toHaveText('Explore map');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('mobile map layer controls remain usable and the archive follows page scrolling', async ({ page }, testInfo) => {
  skipUnlessMobileWebKit(testInfo);
  const errors = collectRuntimeErrors(page);

  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const placement = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    const brand = document.querySelector('.brand-block');
    const panel = document.querySelector('.map-panel');
    const rect = panel?.getBoundingClientRect();
    return {
      panelInSidebar: panel?.parentElement === sidebar,
      panelFollowsBrand: brand?.nextElementSibling === panel,
      panelRect: rect ? { left: rect.left, right: rect.right, width: rect.width, height: rect.height } : null,
      viewportWidth: window.innerWidth,
    };
  });
  expect(placement.panelInSidebar).toBeTruthy();
  expect(placement.panelFollowsBrand).toBeTruthy();
  expect(placement.panelRect).toBeTruthy();
  expect(placement.panelRect.left).toBeGreaterThanOrEqual(-2);
  expect(placement.panelRect.right).toBeLessThanOrEqual(placement.viewportWidth + 2);
  expect(placement.panelRect.width).toBeGreaterThan(250);
  expect(placement.panelRect.height).toBeGreaterThan(250);

  const allCount = await page.evaluate(() => window.AdventureMap?.filteredRecords?.().length || 0);
  expect(allCount).toBeGreaterThan(0);

  const mtbFilter = page.locator('[data-filter="mtb"]');
  await mtbFilter.scrollIntoViewIfNeeded();
  await expect(mtbFilter).toBeVisible();
  const filterRect = await mtbFilter.boundingBox();
  expect(filterRect).toBeTruthy();
  expect(filterRect.x).toBeGreaterThanOrEqual(0);
  expect(filterRect.x + filterRect.width).toBeLessThanOrEqual(placement.viewportWidth + 2);
  await mtbFilter.click();
  await expect(mtbFilter).toHaveClass(/is-active/);
  await expect.poll(() => page.evaluate(() => window.AdventureMap?.filteredRecords?.().length || 0)).toBeGreaterThan(0);
  const mtbCount = await page.evaluate(() => window.AdventureMap?.filteredRecords?.().length || 0);
  expect(mtbCount).toBeLessThan(allCount);

  const allFilter = page.locator('[data-filter="all"]');
  await allFilter.click();
  await expect(allFilter).toHaveClass(/is-active/);
  await expect.poll(() => page.evaluate(() => window.AdventureMap?.filteredRecords?.().length || 0)).toBe(allCount);

  const archive = page.locator('.results-section');
  const archiveOverflowY = await archive.evaluate(element => getComputedStyle(element).overflowY);
  expect(['auto', 'scroll']).not.toContain(archiveOverflowY);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const maxScroll = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
  expect(maxScroll).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollBy(0, Math.min(320, Math.max(1, document.documentElement.scrollHeight - window.innerHeight))));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await archive.scrollIntoViewIfNeeded();
  await expect(archive).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});
