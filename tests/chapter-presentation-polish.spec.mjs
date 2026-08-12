import { test, expect } from '@playwright/test';

test('Nordic location cards present archive history without verification internals', async ({ page }) => {
  await page.goto('/nordic.html',{waitUntil:'domcontentloaded'});
  const card=page.locator('#locationGrid .card').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.chapter-card-date')).toBeVisible();
  const text=(await card.innerText()).toLowerCase();
  expect(text).not.toMatch(/\b(high|medium|confirmed|probable)\b/);
  expect(text).not.toContain('gps cluster');
});

test('MTB cards favor riding history over classification machinery', async ({ page }) => {
  await page.goto('/mountain-biking.html',{waitUntil:'domcontentloaded'});
  const location=page.locator('#locationGrid .card').first();
  await expect(location).toBeVisible();
  await expect(location.locator('.chapter-card-date')).toBeVisible();
  const text=(await location.innerText()).toLowerCase();
  expect(text).not.toContain('future days may classify differently');
  expect(text).not.toContain('not permanently classified');

  const ride=page.locator('#dayList .timeline-item').first();
  await expect(ride).toBeVisible();
  await expect(ride.locator('div').last().locator('span')).toHaveText('Recorded ride');
  expect((await ride.innerText()).toLowerCase()).not.toMatch(/\b(high|confirmed|probable)\b/);
});

test('Alpine chapter gives Nordic Skiing a deliberate cross-chapter handoff', async ({ page }) => {
  await page.goto('/skiing.html',{waitUntil:'domcontentloaded'});
  const crosslink=page.locator('.chapter-crosslink-grid');
  await expect(crosslink).toBeVisible();
  await expect(crosslink.locator('h3')).toHaveText('Nordic Skiing');
  await expect(crosslink).toContainText('Open Nordic Skiing →');
  await expect.poll(async()=>Math.round((await crosslink.boundingBox())?.width||0)).toBeLessThanOrEqual(560);
});

test('Timeline introduces chronology before its filters', async ({ page }) => {
  await page.goto('/timeline.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.section-title h2')).toHaveText('Chronology');
  const headingBeforeFilters=await page.evaluate(()=>{
    const title=document.querySelector('.section-title');
    const filters=document.querySelector('.filters');
    return Boolean(title&&filters&&(title.compareDocumentPosition(filters)&Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(headingBeforeFilters).toBeTruthy();
});

test('record dossiers inherit the chapter editorial accent treatment', async ({ page }) => {
  await page.goto('/detail.html?record=chicago-marathon-2021',{waitUntil:'domcontentloaded'});
  const panel=page.locator('.sport-panel').first();
  await expect(panel).toBeVisible();
  const treatment=await panel.evaluate(node=>({
    minHeight:getComputedStyle(node).minHeight,
    accentHeight:getComputedStyle(node,'::before').height,
    accentBackground:getComputedStyle(node,'::before').backgroundColor
  }));
  expect(treatment.minHeight).toBe('165px');
  expect(treatment.accentHeight).toBe('3px');
  expect(treatment.accentBackground).not.toBe('rgba(0, 0, 0, 0)');
});
