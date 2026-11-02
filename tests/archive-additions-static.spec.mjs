import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const ledger = JSON.parse(readFileSync(new URL('../data/archive-additions.json', import.meta.url), 'utf8'));
const published = JSON.parse(readFileSync(new URL('../data/public-records.json', import.meta.url), 'utf8'));
const featured = ledger.entries.find(entry => entry.featured) || ledger.entries[0];
const featuredRecord = published.records.find(record => record.id === featured?.recordId);

test('homepage ships a useful recently-added fallback before JavaScript enhancement', async ({ page }) => {
  await page.route('**/landing.js', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Fresh in the archive.' })).toBeVisible();
  await expect(page.locator('#latest-card')).toHaveAttribute('data-record-id', featured.recordId);
  await expect(page.locator('#latest-card')).toHaveAttribute('data-added-at', featured.addedAt);
  await expect(page.locator('#latest-card')).toHaveAttribute('href', `record/${featuredRecord.slug}/`);
  expect(await page.locator('#recently-added-list .recent-card').count()).toBeGreaterThan(0);
  await expect(page.locator('#snapshot-records')).not.toHaveText('');
});
