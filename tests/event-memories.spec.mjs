import { test, expect } from '@playwright/test';

for (const kind of ['race', 'summit', 'outing', 'event', 'adventure']) {
  test(`${kind} pages keep memories readable without empty statistics`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/index.html');
    const record = await page.evaluate(async kind => (await AdventureSite.load()).find(r => r.kind === kind && r.discipline !== 'marathon'), kind);
    expect(record).toBeTruthy();
    await page.goto(`/detail.html?record=${encodeURIComponent(record.id)}`);
    await expect(page.locator('h1')).toHaveText(record.name);
    if (kind === 'race') await expect(page.locator('#page')).toHaveAttribute('data-race-memory', 'true');
    await expect(page.locator('.profile, .sport-detail, .race-result-section')).toHaveCount(0);
    await expect(page.locator('.detail-route-section')).toHaveCount(1);
    const values = await page.locator('.metric strong, .race-memory-stat strong').allTextContents();
    expect(values.every(value => value.trim() && value.trim() !== '—')).toBe(true);
    for (const note of await page.locator('.event-notes').all()) {
      await expect(note).not.toHaveAttribute('open', '');
      await note.locator('summary').click();
      await expect(note.locator('p')).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
