import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const representativePages = [
  ['Home', '/'],
  ['Timeline', '/timeline/'],
  ['Map', '/map/'],
  ['Stories', '/stories/'],
  ['Races', '/races/'],
  ['Summits', '/summits/'],
  ['Alpine Skiing', '/skiing/'],
  ['Nordic Skiing', '/nordic/'],
  ['Mountain Biking', '/mtb/'],
  ['Record detail', '/detail.html?record=chicago-marathon-2021']
];

const accessibilityTags = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa'
];

function formatViolations(violations) {
  return violations.map(violation => {
    const nodes = violation.nodes.slice(0, 5).map(node => {
      const target = Array.isArray(node.target) ? node.target.join(' ') : String(node.target);
      return `    ${target}: ${node.failureSummary || 'Accessibility rule failed.'}`;
    }).join('\n');
    return `${violation.impact || 'unknown'} ${violation.id}: ${violation.help}\n${nodes}`;
  }).join('\n\n');
}

for (const [label, path] of representativePages) {
  test(`${label} has no automated WCAG A/AA violations`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForTimeout(250);

    const results = await new AxeBuilder({ page })
      .withTags(accessibilityTags)
      .analyze();

    expect(
      results.violations,
      `Accessibility violations on ${label} (${path}):\n${formatViolations(results.violations)}`
    ).toEqual([]);
  });
}
