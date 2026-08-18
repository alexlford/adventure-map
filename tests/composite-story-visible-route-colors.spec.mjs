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

test('Royal Gorge composite Story preserves route colors and mobile hierarchy', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/detail.html?record=royal-gorge-groove-weekend-2024', { waitUntil: 'domcontentloaded' });

  const routeItems = page.locator('#storyRouteKey .story-route-key-item');
  await expect(routeItems).toHaveCount(2);

  const legend = uniqueSorted((await routeItems.evaluateAll(nodes =>
    nodes.map(node => String(getComputedStyle(node).getPropertyValue('--route-color') || '').trim().toLowerCase())
  )).map(normalizeCssColor));
  expect(legend).toEqual(['#2f7d4a', '#b45309']);

  await expect.poll(async () => {
    const strokes = (await page.locator('#detailMap .leaflet-overlay-pane path').evaluateAll(nodes =>
      nodes.map(node => String(getComputedStyle(node).stroke || node.getAttribute('stroke') || '').trim().toLowerCase())
    )).map(normalizeCssColor);
    return uniqueSorted(strokes.filter(color => color !== 'transparent'));
  }, { timeout: 15000 }).toEqual(legend);

  const swatches = uniqueSorted((await page.locator('#storyRouteKey .story-route-key-line').evaluateAll(nodes =>
    nodes.map(node => String(getComputedStyle(node).backgroundColor || '').trim().toLowerCase())
  )).map(normalizeCssColor));
  expect(swatches).toEqual(legend);

  const stats = page.locator('.challenge-feature .story-objective-stats article');
  const components = page.locator('.challenge-feature .story-component');
  await expect(stats).toHaveCount(4);
  await expect(components).toHaveCount(2);

  const statBoxes = await stats.evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  for (const box of statBoxes) {
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(45);
  }

  const componentBoxes = await components.evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  }));
  expect(componentBoxes[0].width).toBeGreaterThan(250);
  expect(componentBoxes[1].width).toBeGreaterThan(250);
  expect(componentBoxes[0].height).toBeGreaterThan(80);
  expect(componentBoxes[1].top).toBeGreaterThanOrEqual(componentBoxes[0].bottom);

  const keyBoxes = await routeItems.evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, width: rect.width };
  }));
  expect(keyBoxes[0].width).toBeGreaterThan(250);
  expect(keyBoxes[1].top).toBeGreaterThanOrEqual(keyBoxes[0].bottom);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
