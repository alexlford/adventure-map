import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const ledger = JSON.parse(readFileSync(new URL('../data/archive-additions.json', import.meta.url), 'utf8'));
const published = JSON.parse(readFileSync(new URL('../data/public-records.json', import.meta.url), 'utf8'));
const recordsById = new Map(published.records.map(record => [record.id, record]));
const additions = ledger.entries.filter(entry => recordsById.has(entry.recordId));
const featuredEntry = additions.find(entry => entry.featured) || additions[0];
const recentEntries = additions.filter(entry => entry.recordId !== featuredEntry.recordId).slice(0, 3);
const formatAdded = date => new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
}).format(new Date(`${date}T12:00:00Z`));

test('homepage separates archive freshness from event chronology', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Fresh in the archive.' })).toBeVisible();

  const featured = page.locator('#latest-card');
  await expect(featured).toHaveAttribute('data-record-id', featuredEntry.recordId);
  await expect(featured).toHaveAttribute('data-added-at', featuredEntry.addedAt);
  await expect(page.locator('#recent-feature-added')).toContainText(`Added ${formatAdded(featuredEntry.addedAt)}`);

  const recentCards = page.locator('#recently-added-list .recent-card');
  await expect(recentCards).toHaveCount(recentEntries.length);
  for (const [index, entry] of recentEntries.entries()) {
    await expect(recentCards.nth(index)).toHaveAttribute('data-record-id', entry.recordId);
    await expect(recentCards.nth(index)).toContainText(recordsById.get(entry.recordId).name);
  }
});

test('homepage archive snapshot is populated from archive health', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => Number((await page.locator('#snapshot-records').textContent())?.replace(/,/g, '') || 0)).toBeGreaterThan(100);
  await expect.poll(async () => Number((await page.locator('#snapshot-routes').textContent())?.replace(/,/g, '') || 0)).toBeGreaterThan(0);
  await expect.poll(async () => Number((await page.locator('#snapshot-photos').textContent())?.replace(/,/g, '') || 0)).toBeGreaterThan(0);
  await expect(page.locator('#snapshot-years')).toHaveText(/\d{4}–\d{4}/);
});
