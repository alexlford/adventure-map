import { test, expect } from '@playwright/test';

const normalizeColor = value => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text === 'transparent') return 'transparent';
  if (text.startsWith('#')) {
    if (text.length === 4) return `#${text.slice(1).split('').map(ch => ch + ch).join('')}`;
    return text;
  }
  const match = text.match(/^rgba?\((.+)\)$/);
  if (!match) return text.replace(/\s+/g, '');
  const parts = match[1].replace(/,/g, ' ').replace(/\//g, ' ').trim().split(/\s+/);
  const rgb = parts.slice(0, 3).map(part => Math.max(0, Math.min(255, Math.round(Number(part)))));
  const alpha = parts.length > 3 ? Number(parts[3]) : 1;
  if (alpha <= 0) return 'transparent';
  const hex = channel => channel.toString(16).padStart(2, '0');
  return `#${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`;
};

const isTransparentStroke = value => normalizeColor(value) === 'transparent';

async function routeKeyColors(page) {
  return (await page.locator('#storyRouteKey .story-route-key-item').evaluateAll(nodes => nodes.map(node => String(getComputedStyle(node).getPropertyValue('--route-color') || '').trim()))).map(normalizeColor);
}

async function routeStrokeColors(page) {
  return (await page.locator('#detailMap .leaflet-overlay-pane path').evaluateAll(nodes => nodes
    .map(node => String(getComputedStyle(node).stroke || node.getAttribute('stroke') || '').trim())
    .filter(Boolean))).map(normalizeColor);
}

async function componentColors(page, selector) {
  return (await page.locator(selector).evaluateAll(nodes => nodes.map(node => String(getComputedStyle(node).getPropertyValue('--route-color') || '').trim()))).map(normalizeColor);
}

async function activityTokenColors(page, tokens) {
  return (await page.evaluate(names => {
    const root = getComputedStyle(document.documentElement);
    return names.map(name => String(root.getPropertyValue(name) || '').trim());
  }, tokens)).map(normalizeColor);
}

async function expectCompositeStory(page, recordId, expectedCount, cardSelector) {
  await page.goto(`/detail.html?record=${encodeURIComponent(recordId)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#storyRouteKey .story-route-key-item')).toHaveCount(expectedCount);
  const legendColors = await routeKeyColors(page);
  expect(new Set(legendColors).size).toBe(expectedCount);
  await expect.poll(async () => {
    const strokes = (await routeStrokeColors(page)).filter(color => !isTransparentStroke(color));
    return [...new Set(strokes)].sort();
  }, { timeout: 15000 }).toEqual([...new Set(legendColors)].sort());
  const strokes = (await routeStrokeColors(page)).filter(color => !isTransparentStroke(color));
  for (const color of legendColors) expect(strokes).toContain(color);
  for (const color of strokes) expect(legendColors).toContain(color);
  const cardColors = await componentColors(page, cardSelector);
  expect(cardColors).toEqual(legendColors);
  return legendColors;
}

test('multi-sport Royal Gorge story uses distinct semantic route colors', async ({ page }) => {
  const colors = await expectCompositeStory(page, 'royal-gorge-groove-weekend-2024', 2, '.story-component.has-route-color');
  const expected = await activityTokenColors(page, ['--activity-trail-races', '--activity-mtb']);
  expect(colors).toEqual(expected);
});

test('multi-day same-sport Kokopelli story assigns a distinct color to each day', async ({ page }) => {
  await expectCompositeStory(page, 'kokopelli-three-day-2025', 3, '.story-component.has-route-color');
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
  const colors = await page.locator('.map-route-detail-line').evaluateAll(nodes => nodes.map(node => String(node.getAttribute('stroke') || '').trim().toLowerCase()).filter(Boolean));
  expect(new Set(colors).size).toBeGreaterThanOrEqual(3);
});
