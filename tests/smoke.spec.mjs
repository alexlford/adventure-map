import { test, expect } from '@playwright/test';

const publicPages = [
  ['Home', '/index.html'],
  ['Explore', '/activities.html'],
  ['Map', '/map.html'],
  ['Stories', '/adventures.html'],
  ['Timeline', '/timeline.html'],
  ['Races', '/races.html'],
  ['Summits', '/summits.html'],
  ['Skiing', '/skiing.html'],
  ['Nordic', '/nordic.html'],
  ['Mountain biking', '/mountain-biking.html'],
];

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

for (const [name, path] of publicPages) {
  test(`${name} renders without runtime errors`, async ({ page }) => {
    const errors = collectRuntimeErrors(page);
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(response?.ok(), `${path} should return a successful response`).toBeTruthy();
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(900);
    expect(errors).toEqual([]);
  });
}

test('Map populates complete routes and emits one canonical record link', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expect(page.locator('#routeCount')).not.toHaveText('—');
  const routeCount = Number(await page.locator('#routeCount').textContent());
  expect(routeCount).toBeGreaterThan(0);

  const popup = await page.evaluate(() => window.popupCard?.({
    id: 'smoke-test-record',
    slug: 'smoke-test-record',
    kind: 'adventure',
    name: 'Smoke test record',
    location: 'Denver, Colorado',
  }));

  expect(popup).toBeTruthy();
  expect((popup.match(/<a\b/g) || []).length).toBe(1);
  expect(popup).toContain('detail.html?record=smoke-test-record');
  expect(popup).not.toContain('detail.html?id=');
  expect(errors).toEqual([]);
});

test('Representative detail record renders', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/detail.html?record=colorado-triathlon-2023', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText('Colorado Triathlon');
  expect(errors).toEqual([]);
});

test('Mobile Map sidebar remains scrollable', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const scrollState = await page.locator('.sidebar').evaluate(element => {
    const overflowY = getComputedStyle(element).overflowY;
    const hasOverflow = element.scrollHeight > element.clientHeight;
    const before = element.scrollTop;
    element.scrollTop = element.scrollHeight;
    const moved = element.scrollTop > before;
    return { overflowY, hasOverflow, moved };
  });

  expect(scrollState.overflowY).not.toBe('hidden');
  if (scrollState.hasOverflow) expect(scrollState.moved).toBeTruthy();
  expect(errors).toEqual([]);
});
