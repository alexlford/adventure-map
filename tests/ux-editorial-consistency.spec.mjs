import { test, expect } from '@playwright/test';

function runtimeErrors(page) {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text())});
  return errors;
}

test('Alpine Skiing and Nordic Skiing have distinct chapter identities', async ({ page }) => {
  const errors=runtimeErrors(page);
  await page.goto('/skiing/',{waitUntil:'domcontentloaded'});
  await expect(page).toHaveTitle(/Alpine Skiing/);
  await expect(page.locator('.hero .eyebrow')).toHaveText('Adventures · Alpine Skiing');
  await expect(page.locator('.hero')).toContainText('Cross-country skiing stays in the Nordic Skiing chapter');
  await expect(page.locator('.activity-subnav')).toContainText('Alpine Skiing');
  await expect(page.locator('.activity-subnav')).toContainText('Nordic Skiing');
  await expect(page.locator('#days + span')).toHaveText('recorded alpine days');

  await page.goto('/nordic/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.hero .eyebrow')).toHaveText('Adventures · Nordic Skiing');
  await expect(page.locator('.hero')).toContainText('Alpine resort skiing stays in the Alpine Skiing chapter');
  const sibling=page.locator('.chapter-sibling-link');
  await expect(sibling).toContainText('Alpine Skiing');
  await expect(sibling.locator('a.card')).toHaveAttribute('href',/skiing/);
  expect(errors).toEqual([]);
});

test('MTB chapter uses the green activity accent', async ({ page }) => {
  await page.goto('/mtb/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => getComputedStyle(document.body).getPropertyValue('--accent').trim().toLowerCase()==='#2f7d4a');
  const accent=await page.locator('body').evaluate(node=>getComputedStyle(node).getPropertyValue('--accent').trim().toLowerCase());
  expect(accent).toBe('#2f7d4a');
});

test('Map uses explicit ski labels and no retired notable script', async ({ page }) => {
  const errors=runtimeErrors(page);
  await page.goto('/map/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-filter="skiing"]')).toHaveText('Alpine skiing');
  await expect(page.locator('[data-filter="nordic"]')).toHaveText('Nordic skiing');
  const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('src')||''));
  expect(scripts.some(src=>src.endsWith('notable.js'))).toBeFalsy();
  await expect(page.locator('#resultCount')).toContainText('shown');
  expect(errors).toEqual([]);
});

test('Composite challenge members are not promoted as standalone Adventures stories', async ({ page }) => {
  const errors=runtimeErrors(page);
  await page.goto('/adventures/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#storyIndex')).toContainText('Colorado Triathlon');
  await expect(page.locator('#storyIndex')).not.toContainText('Colorado Triathlon · Ski Leg');
  const storyLinks=await page.locator('#storyIndex .story-index-row').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')||''));
  expect(storyLinks.some(href=>href.includes('colorado-triathlon-ski-leg'))).toBeFalsy();
  expect(errors).toEqual([]);
});
