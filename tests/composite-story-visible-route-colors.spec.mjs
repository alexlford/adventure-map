import { test, expect } from '@playwright/test';

const normalizeCssColor = value => {
  const color = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!color) return '';
  if (color === 'transparent' || color === 'rgba(0,0,0,0)' || color === 'rgba(0,0,0,0.0)' || color.endsWith(',0)')) return 'transparent';
  const match = color.match(/^rgba?\((\d+),(\d+),(\d+)(?:,[^)]+)?\)$/);
  if (!match) return color;
  return `#${match.slice(1, 4).map(part => Number(part).toString(16).padStart(2, '0')).join('')}`;
};

const uniqueVisible = values => [...new Set(values.filter(color => color && color !== 'transparent'))].sort();

test('Royal Gorge Story shows only route-key colors on visible component routes', async ({ page }) => {
  await page.goto('/detail.html?record=royal-gorge-groove-weekend-2024', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#storyRouteKey .story-route-key-item')).toHaveCount(2);

  const legend = (await page.locator('#storyRouteKey .story-route-key-item').evaluateAll(nodes =>
    nodes.map(node => String(getComputedStyle(node).getPropertyValue('--route-color') || '').trim().toLowerCase())
  )).map(normalizeCssColor);
  const expectedVisible = uniqueVisible(legend);
  expect(expectedVisible).toEqual(['#2f7d4a', '#b45309']);

  // Check what the browser actually paints. SVG presentation attributes can
  // still contain the correct Leaflet colors while an !important CSS rule
  // repaints every path with the Story accent.
  await expect.poll(async () => {
    const strokes = (await page.locator('#detailMap .leaflet-overlay-pane path').evaluateAll(nodes =>
      nodes.map(node => String(getComputedStyle(node).stroke || '').trim().toLowerCase())
    )).map(normalizeCssColor);
    return uniqueVisible(strokes);
  }, { timeout: 15000 }).toEqual(expectedVisible);
});
