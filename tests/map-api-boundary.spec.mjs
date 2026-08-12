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

test('AdventureMap public facade is isolated behind one frozen core boundary', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const result = await page.evaluate(async () => {
    const source = await fetch('/adventure-map-api.js').then(response => response.text());
    const apiStart = source.indexOf('const api = {');
    const apiEnd = source.indexOf('window.AdventureMap = Object.freeze(api)');
    const facadeSource = source.slice(apiStart, apiEnd);
    const api = window.AdventureMap;
    return {
      source,
      facadeSource,
      frozen: Object.isFrozen(api),
      version: api?.version,
      recordCount: api?.state?.().recordCount,
      mapZoom: api?.leaflet?.getZoom?.(),
    };
  });

  expect(result.source).toContain('const core = Object.freeze({');
  expect(result.facadeSource).toContain('state: core.snapshot');
  expect(result.facadeSource).toContain('focus: core.focus');
  expect(result.facadeSource).toContain('setViewState: core.setViewState');
  expect(result.facadeSource).not.toContain('state.');
  expect(result.facadeSource).not.toContain('filteredAdventures(');
  expect(result.facadeSource).not.toContain('focusAdventure(');
  expect(result.facadeSource).not.toContain('render()');
  expect(result.frozen).toBeTruthy();
  expect(result.version).toBe(1);
  expect(result.recordCount).toBeGreaterThan(0);
  expect(result.mapZoom).toBe(2);
  expect(errors).toEqual([]);
});
