import { test, expect } from '@playwright/test';

const normalize = value => String(value || '').trim().toLowerCase();

async function routeKeyColors(page) {
  return page.locator('#storyRouteKey .story-route-key-item').evaluateAll(nodes => nodes.map(node => normalize(getComputedStyle(node).getPropertyValue('--route-color'))));
}

async function routeStrokeColors(page) {
  return page.locator('#detailMap .leaflet-overlay-pane path').evaluateAll(nodes => nodes.map(node => normalize(node.getAttribute('stroke'))).filter(Boolean));
}

async function expectCompositeStory(page, recordId, expectedCount, cardSelector) {
  await page.goto(`/detail.html?record=${encodeURIComponent(recordId)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#storyRouteKey .story-route-key-item')).toHaveCount(expectedCount);
  const legendColors = await routeKeyColors(page);
  expect(new Set(legendColors).size).toBe(expectedCount);
  await expect.poll(async () => (await routeStrokeColors(page)).length, { timeout: 15000 }).toBeGreaterThanOrEqual(expectedCount);
  const strokes = await routeStrokeColors(page);
  for (const color of legendColors) expect(strokes).toContain(color);
  const cardColors = await page.locator(cardSelector).evaluateAll(nodes => nodes.map(node => normalize(getComputedStyle(node).getPropertyValue('--route-color'))));
  expect(cardColors).toEqual(legendColors);
}

test('multi-sport Royal Gorge story uses distinct semantic route colors', async ({ page }) => {
  await expectCompositeStory(page, 'royal-gorge-groove-weekend-2024', 2, '.story-component.has-route-color');
  const colors = await routeKeyColors(page);
  expect(colors).toContain('#b45309');
  expect(colors).toContain('#2f7d4a');
});

test('multi-day same-sport Kokopelli story assigns a distinct color to each day', async ({ page }) => {
  await expectCompositeStory(page, 'kokopelli-three-day-2025', 3, '.story-linked-record.has-route-color');
});

test('single-route records do not add a composite route key', async ({ page }) => {
  await page.goto('/detail.html?record=clingmans-dome', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#storyRouteKey')).toHaveCount(0);
});

test('focused composite map keeps distinct colors in lazy high-resolution detail', async ({ page }) => {
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.AdventureMap?.state?.().recordCount || 0), { timeout: 15000 }).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.AdventureMap.focus('colorado-triathlon-2023');
    window.AdventureMap.leaflet.setView([39.85, -105.30], 8, { animate: false });
    window.AdventureMapRouteDetail.refresh();
  });
  await expect.poll(() => page.evaluate(() => {
    const diagnostics = window.AdventureMapRouteDetail?.diagnostics?.();
    return (diagnostics?.targets || []).filter(target => target.id === 'colorado-triathlon-2023' && target.rendered).length;
  }), { timeout: 15000 }).toBe(3);
  const colors = await page.locator('.map-route-detail-line').evaluateAll(nodes => nodes.map(node => normalize(node.getAttribute('stroke'))).filter(Boolean));
  expect(new Set(colors).size).toBeGreaterThanOrEqual(3);
});
