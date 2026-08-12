import { test, expect } from '@playwright/test';

const sections = [
  ['/', 'Home'],
  ['/explore/', 'Explore'],
  ['/map/', 'Map'],
  ['/stories/', 'Stories'],
  ['/timeline/', 'Timeline'],
  ['/races/', 'Races'],
  ['/summits/', 'Summits'],
  ['/skiing/', 'Skiing'],
  ['/nordic/', 'Nordic'],
  ['/mtb/', 'MTB']
];

const activitySections = new Map([
  ['/races/', 'Races'],
  ['/summits/', 'Summits'],
  ['/skiing/', 'Skiing'],
  ['/nordic/', 'Nordic'],
  ['/mtb/', 'MTB']
]);

for (const [path, label] of sections) {
  test(`${label} clean page keeps the shared Adventures shell consistent`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('footer')).toContainText('Alex Ford Adventures');

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    await expect(canonical).toHaveAttribute('href', /https:\/\/adventures\.alexlford\.com\//);

    const primary = page.locator('nav[aria-label="Primary navigation"]');
    await expect(primary).toBeVisible();
    for (const item of ['Home','Explore','Map','Stories']) {
      await expect(primary.getByRole('link',{name:item,exact:true})).toHaveCount(1);
    }

    const duplicatePrimaryLinks = await primary.locator('a').evaluateAll(links => {
      const seen = new Set();
      return links.map(link => `${link.textContent.trim()}\u0000${link.getAttribute('href') || ''}`).filter(key => {
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
      });
    });
    expect(duplicatePrimaryLinks).toEqual([]);

    if (activitySections.has(path)) {
      const subnav = page.locator('nav[aria-label="Explore Adventures"]');
      await expect(subnav).toBeVisible();
      for (const item of ['Races','Summits','Skiing','Nordic','MTB','Timeline']) {
        await expect(subnav.getByRole('link',{name:item,exact:true})).toHaveCount(1);
      }
      await expect(subnav.getByRole('link',{name:activitySections.get(path),exact:true})).toHaveAttribute('aria-current','page');
    }
  });
}

test('Explore chapter links resolve to the clean published activity pages', async ({ page, request }) => {
  await page.goto('/explore/', { waitUntil: 'domcontentloaded' });
  const expected = new Map([
    ['Races','/races'],
    ['Summits','/summits'],
    ['Skiing','/skiing'],
    ['Nordic','/nordic'],
    ['Mountain Biking','/mtb'],
    ['Timeline','/timeline']
  ]);

  for (const [name, cleanPath] of expected) {
    const card = page.getByRole('link').filter({has:page.getByRole('heading',{name,exact:true})});
    await expect(card).toHaveCount(1);
    const href = await card.getAttribute('href');
    expect(new URL(href,page.url()).pathname.replace(/\/$/,'')).toBe(cleanPath);
    const response = await request.get(`${cleanPath}/`);
    expect(response.ok()).toBeTruthy();
  }
});
