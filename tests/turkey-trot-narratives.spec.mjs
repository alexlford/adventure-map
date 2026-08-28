import { test, expect } from '@playwright/test';

const cases = [
  ['st-louis-turkey-trot-8k-2018', 'Leah Forsberg', 'unexpected Thanksgiving reunion'],
  ['gobble-cobble-2019', 'pretty cold Thanksgiving morning', 'Inner Harbor'],
  ['baltimore-virtual-turkey-trot-2020', '5.48 kilometers recorded', 'virtual 2020 edition'],
  ['mile-high-turkey-trot-2021', 'my wife and my mom', 'fun it was to be there together'],
  ['mile-high-turkey-trot-2023', 'park far from the start', 'with Olive'],
  ['springfield-turkey-trot-2024', 'University of Illinois Springfield campus', 'with Olive'],
  ['mile-high-turkey-trot-2025', 'great day together', 'Thanksgiving traditions'],
];

for (const [recordId, firstPhrase, secondPhrase] of cases) {
  test(`${recordId} renders its personal Turkey Trot narrative`, async ({ page }) => {
    await page.goto(`/detail.html?record=${recordId}`, { waitUntil: 'domcontentloaded' });
    const story = page.locator('.race-memory-story');
    await expect(story).toBeVisible({ timeout: 15000 });
    await expect(story).toContainText(firstPhrase);
    await expect(story).toContainText(secondPhrase);
  });
}

test('Turkey Trots Story renders the shared tradition narrative', async ({ page }) => {
  await page.goto('/detail.html?record=mile-high-united-way-turkey-trot-series', { waitUntil: 'domcontentloaded' });
  const story = page.locator('.race-memory-story');
  await expect(story).toBeVisible({ timeout: 15000 });
  await expect(story).toContainText('Seven Thanksgiving editions that became one tradition.');
  await expect(story).toContainText('an unexpected reunion in St. Louis');
  await expect(story).toContainText('Thanksgiving mornings, family, friends, Olive');
});
