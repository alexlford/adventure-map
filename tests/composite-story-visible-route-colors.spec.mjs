import { test, expect } from '@playwright/test';

const normalizeCssColor = value => {
  const color = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!color) return '';
  if (color === 'transparent' || color === 'rgba(0,0,0,0)' || color === 'rgba(0,0,0,0.0)' || color.endsWith(',0)')) return 'transparent';
  const match = color.match(/^rgba?\((\d+),(\d+),(\d+)(?:,[^)]+)?\)$/);
  if (!match) return color;
  return `#${match.slice(1, 4).map(part => Number(part).toString(16).padStart(2, '0')).join('')}`;
};

const uniqueSorted = values => [...new Set(values.filter(Boolean))].sort();

test('Royal Gorge Story shows only route-key colors on visible component routes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/detail.html?record=royal-gorge-groove-weekend-2024', { waitUntil: 'domcontentloaded' });

  const routeItems = page.locator('#storyRouteKey .story-route-key-item');
  await expect(routeItems).toHaveCount(2);

  await page.waitForFunction(() => {
    const link = document.querySelector('link[data-adventure-map-visuals]');
    return Boolean(link && link.sheet);
  });

  const legend = uniqueSorted((await routeItems.evaluateAll(nodes =>
    nodes.map(node => String(getComputedStyle(node).getPropertyValue('--route-color') || '').trim().toLowerCase())
  )).map(normalizeCssColor));
  expect(legend).toEqual(['#2f7d4a', '#b45309']);

  await expect(page.locator('#detailMap')).toHaveClass(/has-composite-routes/);

  // Check computed onscreen strokes and wait for both asynchronous route layers.
  // SVG stroke attributes alone can look correct while CSS !important repaints
  // the visible paths, which is the regression this test protects against.
  await expect.poll(async () => {
    const strokes = (await page.locator('#detailMap .leaflet-overlay-pane path').evaluateAll(nodes =>
      nodes.map(node => String(getComputedStyle(node).stroke || '').trim().toLowerCase())
    )).map(normalizeCssColor);
    return uniqueSorted(strokes.filter(color => color && color !== 'transparent'));
  }, { timeout: 15000 }).toEqual(legend);
});
