import { test, expect } from '@playwright/test';

test('Map popup contains one record action and no legacy id route', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const result = await page.evaluate(async () => {
    const all = await window.AdventureCatalog.load();
    const record = all.find(item => item.kind === 'race') || all[0];
    const html = window.popupCard?.(record) || '';
    const shell = document.createElement('div');
    shell.innerHTML = html;
    return {
      html,
      hrefs: [...shell.querySelectorAll('a[href]')].map(link => link.getAttribute('href')),
    };
  });

  expect(result.html).toBeTruthy();
  expect(result.hrefs).toHaveLength(1);
  expect(result.hrefs[0]).not.toContain('detail.html?id=');
});
