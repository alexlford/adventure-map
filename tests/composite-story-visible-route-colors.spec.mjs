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

test('Royal Gorge Story visibly uses the route-key colors on the map', async ({ page }) => {
  await page.goto('/detail.html?record=royal-gorge-groove-weekend-2024', { waitUntil: 'domcontentloaded' });
  const routeItems = page.locator('#storyRouteKey .story-route-key-item');
  await expect(routeItems).toHaveCount(2);

  const legend = uniqueSorted((await routeItems.evaluateAll(nodes =>
    nodes.map(node => String(getComputedStyle(node).getPropertyValue('--route-color') || '').trim().toLowerCase())
  )).map(normalizeCssColor));
  expect(legend).toEqual(['#2f7d4a', '#b45309']);

  // Assert the computed onscreen stroke, not only Leaflet's SVG presentation
  // attribute. A CSS !important rule can otherwise repaint the route while the
  // stroke attribute still looks correct to the test.
  await expect.poll(async () => {
    const strokes = (await page.locator('#detailMap .leaflet-overlay-pane path').evaluateAll(nodes =>
      nodes.map(node => String(getComputedStyle(node).stroke || node.getAttribute('stroke') || '').trim().toLowerCase())
    )).map(normalizeCssColor);
    return uniqueSorted(strokes.filter(color => color !== 'transparent'));
  }, { timeout: 15000 }).toEqual(legend);
});
