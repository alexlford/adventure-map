import { test, expect } from '@playwright/test';

test('Master map exposes keyboard-operable geography and selected archive state', async ({ page }) => {
  await page.goto('/map.html?q=Chicago%20Marathon', { waitUntil: 'domcontentloaded' });

  const count = page.locator('#resultCount');
  await expect(count).toHaveAttribute('role','status');
  await expect(count).toHaveAttribute('aria-live','polite');

  const archiveItem = page.locator('#adventureList .adventure-item').first();
  await expect(archiveItem).toBeVisible();
  await expect(archiveItem).toHaveAttribute('aria-controls','map');
  await expect(archiveItem).toHaveAttribute('aria-pressed','false');
  await archiveItem.click();
  await expect(archiveItem).toHaveAttribute('aria-pressed','true');

  const mapControl = page.locator('#map .leaflet-interactive[role="button"]:visible').first();
  await expect(mapControl).toBeVisible();
  await expect(mapControl).toHaveAttribute('tabindex','0');
  await expect(mapControl).toHaveAttribute('aria-keyshortcuts','Enter Space');
  await mapControl.focus();
  await mapControl.press('Enter');
  await expect(page.locator('#map .leaflet-popup')).toBeVisible();
});

test('Chapter map markers can open their records by keyboard', async ({ page }) => {
  await page.goto('/races.html?view=trail', { waitUntil: 'domcontentloaded' });
  const marker = page.locator('#raceMap .leaflet-interactive[role="button"]:visible').first();
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute('tabindex','0');
  await expect(marker).toHaveAttribute('aria-haspopup','dialog');
  await marker.focus();
  await marker.press(' ');
  await expect(page.locator('#raceMap .leaflet-popup')).toBeVisible();
  await expect(page.locator('#raceMap .leaflet-popup .popup-detail a').first()).toContainText('Open record');
});
