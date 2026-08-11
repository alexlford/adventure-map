import { test, expect } from '@playwright/test';

test('Map core renders official race result context', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  const popup = await page.evaluate(() => window.popupCard?.({
    id: 'race-smoke-test',
    slug: 'race-smoke-test',
    kind: 'race',
    discipline: 'marathon',
    name: 'Race Smoke Test',
    location: 'Denver, Colorado',
    date: '2026-01-01',
    officialTime: '3:59:59',
    officialDistance: '26.2 mi',
    officialPlace: '123',
    award: 'Finisher',
    stravaActivityId: '12345',
    stravaDistanceMi: 26.3,
    stravaElapsedSeconds: 14400,
  }));
  expect(popup).toContain('Official: 3:59:59');
  expect(popup).toContain('26.2 mi');
  expect(popup).toContain('overall 123');
  expect(popup).toContain('Finisher');
  expect(popup).toContain('Strava: 26.3 mi GPS');
  expect((popup.match(/<a\b/g) || []).length).toBe(1);
  expect(popup).toContain('detail.html?record=race-smoke-test');
});
