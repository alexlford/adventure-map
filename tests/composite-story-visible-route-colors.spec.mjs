import { test, expect } from '@playwright/test';

const normalizeCssColor = value => {
  const color = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!color) return '';
  if (color === 'transparent' || color === 'rgba(0,0,0,0)' || color === 'rgba(0,0,0,0.0)' || color.endsWith(',0)')) return 'transparent';
  const match = color.match(/^rgba?\((\d+),(\d+),(\d+)(?:,[^)]+)?\)$/);
  if (!match) return color;
  return `#${match.slice(1, 4).map(part => Number(part).toString(16).padStart(2, '0')).join('')}`;
};

test('Royal Gorge Story shows only route-key colors on visible component routes', async ({ page }) => {
  await page.goto('/detail.html?record=royal-gorge-groove-weekend-2024', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#storyRouteKey .story-route-key-item')).toHaveCount(2);

  const legend = (await page.locator('#storyRouteKey .story-route-key-item').evaluateAll(nodes =>
    nodes.map(node => String(getComputedStyle(node).getPropertyValue('--route-color') || '').trim().toLowerCase())
  )).map(normalizeCssColor);

  const routePaths = page.locator('#detailMap .leaflet-overlay-pane path:not(.detail-location-point)');
  await expect.poll(async () => routePaths.count(), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#detailMap')).toHaveClass(/has-composite-routes/);

  // Check the visible/computed stroke, not the SVG presentation attribute.
  // A CSS !important rule can repaint the path while leaving the attribute
  // unchanged, which is the regression this test protects against. The white
  // detail-location marker is intentionally not a route layer.
  const strokes = (await routePaths.evaluateAll(nodes =>
    nodes.map(node => String(getComputedStyle(node).stroke || '').trim().toLowerCase())
  )).map(normalizeCssColor);
  const visible = strokes.filter(color => color && color !== 'transparent');

  expect(new Set(visible)).toEqual(new Set(legend));
  for (const color of visible) expect(legend).toContain(color);
});
