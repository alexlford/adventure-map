import { test, expect } from '@playwright/test';

const normalizeCssColor = value => {
  const color = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!color) return '';
  if (color === 'transparent' || color === 'rgba(0,0,0,0)' || color.endsWith(',0)')) return 'transparent';
  const match = color.match(/^rgba?\((\d+),(\d+),(\d+)(?:,[^)]+)?\)$/);
  if (!match) return color;
  return `#${match.slice(1, 4).map(part => Number(part).toString(16).padStart(2, '0')).join('')}`;
};

test('BeerFit Kansas City Story preserves both races and both GPS routes', async ({ page }) => {
  await page.goto('/detail.html?record=beerfit-kansas-city-2016', { waitUntil: 'domcontentloaded' });

  const relationship = await page.evaluate(async () => {
    const payload = await fetch('/data/relationships.json').then(response => response.json());
    return (payload.relationships || []).find(item => item.adventureId === 'beerfit-kansas-city-2016') || null;
  });
  expect(relationship?.type).toBe('same-day');
  expect(relationship?.memberIds).toEqual([
    'beerfit-kansas-city-5k-2016',
    'beerfit-kansas-city-brew-mile-2016',
  ]);

  const key = page.locator('#storyRouteKey .story-route-key-item');
  await expect(key).toHaveCount(2);
  const keyText = await key.allTextContents();
  expect(keyText.join(' ')).toContain('5K');
  expect(keyText.join(' ')).toContain('Brew Mile');

  const legend = (await key.evaluateAll(nodes => nodes.map(node => String(getComputedStyle(node).getPropertyValue('--route-color') || '').trim().toLowerCase()))).map(normalizeCssColor);
  expect(new Set(legend).size).toBe(2);

  await expect.poll(async () => page.locator('#detailMap .leaflet-overlay-pane path').count(), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  const strokes = (await page.locator('#detailMap .leaflet-overlay-pane path').evaluateAll(nodes => nodes.map(node => String(node.getAttribute('stroke') || getComputedStyle(node).stroke || '').trim().toLowerCase()))).map(normalizeCssColor).filter(color => color && color !== 'transparent');

  expect(new Set(strokes)).toEqual(new Set(legend));
});
