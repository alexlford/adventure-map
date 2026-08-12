import { test, expect } from '@playwright/test';

const decalibron = ['mount-democrat','mount-cameron','mount-lincoln','mount-bross'];
const blueSkyOuting = ['mount-evans','mount-spalding'];

test('A single GPS outing can publish every distinct summit reached on it', async ({ request }) => {
  const response = await request.get('/data/public-records.json');
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const byId = new Map((payload.records || []).map(record => [record.id,record]));

  for (const id of [...decalibron,...blueSkyOuting]) expect(byId.has(id), `${id} should remain public`).toBeTruthy();
  expect(new Set(decalibron.map(id => String(byId.get(id).stravaActivityId)))).toEqual(new Set(['9642214422']));
  expect(new Set(blueSkyOuting.map(id => String(byId.get(id).stravaActivityId)))).toEqual(new Set(['7560672014']));
});

test('Previously suppressed shared-activity summits have real clean record pages', async ({ page }) => {
  await page.goto('/record/2023-08-13-mount-democrat/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hero h1')).toHaveText('Mount Democrat');

  await page.goto('/record/2022-07-31-mount-spalding/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hero h1')).toHaveText('Mount Spalding');
});
