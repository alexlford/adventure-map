import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const marathons = JSON.parse(fs.readFileSync('data/public-records.json', 'utf8')).records
  .filter(record => record.kind === 'race' && record.discipline === 'marathon');

for (const record of marathons) {
  test(`${record.name} ${record.year} has a compact memory page`, async ({ page }) => {
    await page.goto(`/record/${record.slug}/`);
    await expect(page.locator('#page[data-race-memory="true"]')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(record.name);
    await expect(page.locator('.metrics, .profile, .race-result-section, #majorPassportDetail')).toHaveCount(0);
    await expect(page.locator('.detail-route-section')).toHaveCount(1);
    await expect(page.locator('.race-memory-stat')).not.toContainText(['—']);
    if (record.officialSplits?.length) {
      await expect(page.locator('.marathon-splits')).not.toBeVisible();
      await page.locator('.marathon-details summary').click();
      await expect(page.locator('.marathon-splits')).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow).toBe(false);
  });
}
