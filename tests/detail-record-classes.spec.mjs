import { test, expect } from '@playwright/test';

async function catalogExamples(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  return page.evaluate(async () => {
    const all = await window.AdventureSite.load();
    const pick = predicate => {
      const record = all.find(predicate);
      return record ? { id: record.id, slug: record.slug, name: record.name } : null;
    };
    return {
      race: pick(record => record.kind === 'race' && record.id !== 'chicago-marathon-2021'),
      worldMajor: pick(record => record.id === 'chicago-marathon-2021'),
      summit: pick(record => record.kind === 'summit'),
      mtbOuting: pick(record => record.kind === 'outing' && record.discipline === 'mountain-bike'),
      nordicOuting: pick(record => record.kind === 'outing' && record.discipline === 'nordic'),
      story: pick(record => record.kind === 'adventure'),
      event: pick(record => record.kind === 'event'),
    };
  });
}

function runtimeErrors(page) {
  const errors = [];
  const onPageError = error => errors.push(`pageerror: ${error.message}`);
  const onConsole = message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('Failed to load resource')) return;
    errors.push(`console: ${text}`);
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  return {
    errors,
    reset: () => { errors.length = 0; },
    dispose: () => { page.off('pageerror', onPageError); page.off('console', onConsole); },
  };
}

test('Representative record classes render without runtime errors', async ({ page }) => {
  const examples = await catalogExamples(page);
  const monitor = runtimeErrors(page);

  for (const [recordClass, record] of Object.entries(examples)) {
    expect(record, `catalog should contain a ${recordClass} example`).toBeTruthy();
    monitor.reset();
    await page.goto(`/detail.html?record=${encodeURIComponent(record.slug || record.id)}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText(record.name);
    await expect(page.locator('.detail-route-section')).toBeVisible();
    await page.waitForTimeout(700);
    expect(monitor.errors, `${recordClass} detail page should not emit runtime errors`).toEqual([]);
  }

  monitor.dispose();
});

test('Record-type modules appear for their intended records', async ({ page }) => {
  const examples = await catalogExamples(page);

  await page.goto(`/detail.html?record=${encodeURIComponent(examples.race.slug || examples.race.id)}`);
  await expect(page.locator('.sport-detail').filter({ hasText: 'Race dossier' })).toBeVisible();

  await page.goto(`/detail.html?record=${encodeURIComponent(examples.worldMajor.slug || examples.worldMajor.id)}`);
  await expect(page.locator('#majorPassportDetail')).toBeVisible();

  await page.goto(`/detail.html?record=${encodeURIComponent(examples.summit.slug || examples.summit.id)}`);
  await expect(page.locator('.sport-detail').filter({ hasText: 'Summit dossier' })).toBeVisible();

  await page.goto(`/detail.html?record=${encodeURIComponent(examples.mtbOuting.slug || examples.mtbOuting.id)}`);
  await expect(page.locator('.sport-detail').filter({ hasText: /MTB|Downhill MTB/ })).toBeVisible();

  await page.goto(`/detail.html?record=${encodeURIComponent(examples.nordicOuting.slug || examples.nordicOuting.id)}`);
  await expect(page.locator('.sport-detail').filter({ hasText: 'Nordic' })).toBeVisible();

  await page.goto(`/detail.html?record=${encodeURIComponent(examples.story.slug || examples.story.id)}`);
  await expect(page.locator('.story-record-editorial')).toBeVisible();
  await expect(page.locator('.metrics')).toHaveCount(0);
  await expect(page.locator('.profile')).toHaveCount(0);
});
