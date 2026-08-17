import { test, expect } from '@playwright/test';

const normalize = value => String(value || '').replace(/\s+/g, '').toLowerCase();
const transparent = new Set(['transparent', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.0)']);

test('Royal Gorge Story shows only route-key colors on visible component routes', async ({ page }) => {
  await page.goto('/detail.html?record=royal-gorge-groove-weekend-2024', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#storyRouteKey .story-route-key-item')).toHaveCount(2);

  const legend = await page.locator('#storyRouteKey .story-route-key-item').evaluateAll(nodes =>
    nodes.map(node => String(getComputedStyle(node).getPropertyValue('--route-color') || '').trim().toLowerCase())
  );

  await expect.poll(async () => page.locator('#detailMap .leaflet-overlay-pane path').count(), { timeout: 15000 }).toBeGreaterThanOrEqual(2);

  const strokes = await page.locator('#detailMap .leaflet-overlay-pane path').evaluateAll(nodes =>
    nodes.map(node => String(node.getAttribute('stroke') || getComputedStyle(node).stroke || '').trim().toLowerCase())
  );
  const visible = strokes.filter(color => !transparent.has(normalize(color)));

  expect(new Set(visible)).toEqual(new Set(legend));
  for (const color of visible) expect(legend).toContain(color);
});
