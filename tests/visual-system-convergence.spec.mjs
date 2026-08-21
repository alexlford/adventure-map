import { test, expect } from '@playwright/test';

function runtimeErrors(page) {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text())});
  return errors;
}

test('Map shell shares chapter tokens and renders a useful no-results state', async ({ page }) => {
  const errors=runtimeErrors(page);
  await page.goto('/map/?q=__definitely_no_adventure_matches__',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#resultCount')).toHaveText('0 shown');
  await expect(page.locator('.archive-state-empty')).toContainText('No matching records');
  await expect(page.locator('.archive-state-empty')).toContainText('Try another layer, year range, or search.');

  const tokens=await page.locator('body').evaluate(node=>{
    const style=getComputedStyle(node);
    return {muted:style.getPropertyValue('--muted').trim().toLowerCase(),accent:style.getPropertyValue('--accent').trim().toLowerCase(),focus:style.getPropertyValue('--focus').trim().toLowerCase()};
  });
  expect(tokens).toEqual({muted:'#68737d',accent:'#16836d',focus:'#16836d'});
  await expect(page.locator('.stat').first()).toHaveCSS('border-radius','18px');
  await expect(page.locator('.section-nav a').first()).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  expect(errors).toEqual([]);
});

test('Map data failure uses the shared error-state treatment and survives late enrichment', async ({ page }) => {
  await page.route('**/data/routes.geojson',route=>route.abort());
  await page.goto('/map/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#resultCount')).toHaveText('Unavailable');
  await expect(page.locator('.archive-state-error')).toContainText('Map archive unavailable');
  await page.waitForTimeout(1200);
  await expect(page.locator('#resultCount')).toHaveText('Unavailable');
  await expect(page.locator('.archive-state-error')).toContainText('Map archive unavailable');
});

test('Activity chapters use consistent section rhythm and editorial provenance copy', async ({ page }) => {
  await page.goto('/races/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.hero')).toContainText('personal archives');
  await expect(page.locator('.hero')).not.toContainText('alexlford.com');
  await expect(page.locator('.hero')).not.toContainText('Strava');
  await expect(page.locator('.section-title').first()).toHaveCSS('margin-top','60px');

  await page.goto('/nordic/',{waitUntil:'domcontentloaded'});
  const whereCopy=page.locator('.section-title').filter({hasText:'Where I’ve skied'}).locator('p');
  await expect(whereCopy).toContainText('personal GPS history');
  await expect(whereCopy).not.toContainText('Strava');
  await expect(page.locator('.section-title').first()).toHaveCSS('margin-top','60px');
});

test('Story diagnostic title', async ({ page }) => {
  await page.goto('/detail.html?record=2023-12-02-colorado-triathlon',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.hero h1')).toHaveText('Colorado Triathlon');
});

test('Story diagnostic theme class', async ({ page }) => {
  await page.goto('/detail.html?record=2023-12-02-colorado-triathlon',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveClass(/story-theme-challenge/);
});

test('Story diagnostic endpoint dots', async ({ page }) => {
  await page.goto('/detail.html?record=2023-12-02-colorado-triathlon',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.route-endpoint-wrap')).toHaveCount(0);
});

test('Story diagnostic theme tokens', async ({ page }) => {
  await page.goto('/detail.html?record=2023-12-02-colorado-triathlon',{waitUntil:'domcontentloaded'});
  const tokens=await page.locator('body').evaluate(node=>{
    const style=getComputedStyle(node);
    return {
      story:style.getPropertyValue('--story-accent').trim().toLowerCase(),
      accent:style.getPropertyValue('--accent').trim().toLowerCase(),
    };
  });
  expect(tokens).toEqual({story:'#7b4b66',accent:'#7b4b66'});
});

test('Story diagnostic route stroke', async ({ page }) => {
  await page.goto('/detail.html?record=2023-12-02-colorado-triathlon',{waitUntil:'domcontentloaded'});
  const route=page.locator('.detail-map path.leaflet-interactive:not(.detail-location-point)').first();
  await expect(route).toBeVisible();
  await expect(route).toHaveCSS('stroke','rgb(123, 75, 102)');
});
