import { test, expect } from '@playwright/test';

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

async function recordFor(page, predicateSource) {
  return page.evaluate(async predicateText => {
    const all = await window.AdventureSite.load();
    const predicate = new Function('record', `return (${predicateText})(record)`);
    const record = all.find(predicate);
    return record ? { id: record.id, slug: record.slug, name: record.name } : null;
  }, predicateSource);
}

async function openRepresentative(page, predicateSource) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const record = await recordFor(page, predicateSource);
  expect(record, `expected representative record for ${predicateSource}`).toBeTruthy();
  await page.goto(`/detail.html?record=${encodeURIComponent(record.slug || record.id)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText(record.name);
  return record;
}

test('race detail renders race-specific context', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openRepresentative(page, "record => record.kind === 'race' && record.officialTime");
  await expect(page.locator('body')).toContainText(/Race dossier|Official result/i);
  await expect(page.locator('.detail-route-section')).toBeVisible();
  await page.waitForTimeout(700);
  expect(errors).toEqual([]);
});

test('completed World Major detail renders passport context', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openRepresentative(page, "record => record.id === 'chicago-marathon-2021'");
  await expect(page.locator('body')).toContainText(/World Marathon Majors passport|Official race dossier/i);
  await expect(page.locator('.detail-route-section')).toBeVisible();
  await page.waitForTimeout(700);
  expect(errors).toEqual([]);
});

test('summit detail renders summit context', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openRepresentative(page, "record => record.kind === 'summit'");
  await expect(page.locator('body')).toContainText(/Summit dossier|Elevation/i);
  await expect(page.locator('.detail-route-section')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('MTB outing detail renders day-level riding context', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openRepresentative(page, "record => record.kind === 'outing' && record.discipline === 'mountain-bike'");
  await expect(page.locator('body')).toContainText(/MTB day|Downhill MTB|Day type/i);
  await expect(page.locator('.detail-route-section')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('Nordic outing detail renders day-level ski context', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openRepresentative(page, "record => record.kind === 'outing' && record.discipline === 'nordic'");
  await expect(page.locator('body')).toContainText(/Nordic day|Day type/i);
  await expect(page.locator('.detail-route-section')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('Story detail renders editorial chapter context', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openRepresentative(page, "record => record.kind === 'adventure'");
  await expect(page.locator('body')).toContainText(/The chapter|Connected records|One story, one record/i);
  await expect(page.locator('.detail-route-section')).toBeVisible();
  await page.waitForTimeout(900);
  expect(errors).toEqual([]);
});

test('generic event detail remains renderable', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openRepresentative(page, "record => record.kind === 'event'");
  await expect(page.locator('.detail-route-section')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
