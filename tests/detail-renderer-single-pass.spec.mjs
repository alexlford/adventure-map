import { test, expect } from '@playwright/test';

const legacyDetailScripts = [
  'detail-phase4.js',
  'story-detail.js',
  'world-major-detail.js',
  'record-media.js',
  'clean-route-normalizer.js'
];

async function representative(page, predicateSource) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  return page.evaluate(async predicateText => {
    const all = await window.AdventureSite.load();
    const predicate = new Function('record', `return (${predicateText})(record)`);
    const record = all.find(predicate);
    return record ? { id: record.id, slug: record.slug, name: record.name } : null;
  }, predicateSource);
}

test('detail page uses one deterministic renderer and no legacy patch scripts', async ({ page, request }) => {
  const record = await representative(page, "record => record.kind === 'race' && record.officialTime");
  expect(record).toBeTruthy();
  await page.goto(`/detail.html?record=${encodeURIComponent(record.slug || record.id)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText(record.name);
  await expect(page.locator('.detail-route-section')).toHaveCount(1);

  const sources = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src') || ''));
  expect(sources.filter(source => source.endsWith('record-renderer.js'))).toHaveLength(1);
  for (const legacy of legacyDetailScripts) expect(sources.some(source => source.endsWith(legacy))).toBeFalsy();

  const response = await request.get('/record-renderer.js');
  expect(response.ok()).toBeTruthy();
  const source = await response.text();
  expect(source).not.toContain('MutationObserver');
});

test('Story detail composes once without generic profile or duplicate Story modules', async ({ page }) => {
  const record = await representative(page, "record => record.kind === 'adventure'");
  expect(record).toBeTruthy();
  await page.goto(`/detail.html?record=${encodeURIComponent(record.slug || record.id)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText(record.name);
  await expect(page.locator('.story-record-editorial')).toHaveCount(1);
  await expect(page.locator('.profile')).toHaveCount(0);
  await expect(page.locator('.metrics')).toHaveCount(0);
  await expect(page.locator('.detail-route-section')).toHaveCount(1);
  await expect(page.locator('.sport-detail').filter({ hasText: 'Adventure story' })).toHaveCount(0);
});

test('completed Major has one passport dossier and one route section', async ({ page }) => {
  await page.goto('/detail.html?record=chicago-marathon-2021', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText(/Chicago/i);
  await expect(page.locator('#majorPassportDetail')).toHaveCount(1);
  await expect(page.locator('.detail-route-section')).toHaveCount(1);
  await expect(page.locator('.race-result-section')).toHaveCount(1);
});
