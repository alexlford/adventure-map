import { test, expect } from '@playwright/test';

test('generated record remains article metadata after runtime refresh', async ({ request, page }) => {
  const compiled = await (await request.get('/data/public-records.json')).json();
  const record = compiled.records.find(item => item.id === 'chicago-marathon-2021') || compiled.records[0];
  expect(record).toBeTruthy();
  const slug = record.slug || record.id;

  await page.goto(`/record/${slug}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText(record.name);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://adventures.alexlford.com/record/${slug}/`);
});
