import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const publicRecords = readJson('data/public-records.json').records;
const currentMemories = readJson('data/race-memories.json').records;
const archiveMemories = readJson('data/race-memories-archive.json').records;
const turkeyMemories = readJson('data/race-memories-turkey-trots.json').records;
const recordsById = new Map(publicRecords.map(record => [record.id, record]));

const narrativeCases = [
  ['garmin-half-2014', archiveMemories, 'first half marathon', 'under two hours'],
  ['abes-amble-2014', archiveMemories, 'my mom and Aunt Mary Kay', 'Illinois State Fairgrounds'],
  ['pi-miler-2015', archiveMemories, 'first day of trail running', 'finishing third'],
  ['pi-day-half-2015', archiveMemories, 'first day of trail running', 'really enjoyed it'],
  ['illinois-5k-2015', archiveMemories, 'good shakeout race', 'first marathon'],
  ['illinois-marathon-2015', archiveMemories, 'thunderstorm rolled in', 'my mom ran her first half marathon'],
  ['heartland-39-3-2016', archiveMemories, 'keep me training', 'proud not only that I had finished it'],
  ['big-ten-10k-2016', archiveMemories, 'very fun race along Lake Michigan', 'enjoying the race'],
  ['disney-princess-half-2018', archiveMemories, "Abby's first half marathon", 'weekend I turned 30'],
  ['rock-parkway-half-2016', currentMemories, 'surprised myself with how well I ran', 'motivated to see if I could run even better'],
  ['garmin-half-2016', currentMemories, '1:43:16', 'new half-marathon PR'],
  ['illinois-5k-2016', currentMemories, '21:02', 'official 5K race PR'],
  ['illinois-half-2016', currentMemories, 'beautiful spring day in the Midwest', 'racing often'],
  ['running-with-cows-half-2016', currentMemories, 'final race of the Heartland 39.3 series', 'proud of how well I had been running'],
  ['st-louis-turkey-trot-8k-2018', turkeyMemories, 'Leah Forsberg', 'unexpected Thanksgiving reunion'],
  ['gobble-cobble-2019', turkeyMemories, 'pretty cold Thanksgiving morning', 'Inner Harbor'],
  ['baltimore-virtual-turkey-trot-2020', turkeyMemories, '5.48 kilometers recorded', 'virtual 2020 edition'],
  ['mile-high-turkey-trot-2021', turkeyMemories, 'my wife and my mom', 'fun it was to be there together'],
  ['mile-high-turkey-trot-2023', turkeyMemories, 'park far from the start', 'with Olive'],
  ['springfield-turkey-trot-2024', turkeyMemories, 'University of Illinois Springfield campus', 'with Olive'],
  ['mile-high-turkey-trot-2025', turkeyMemories, 'great day together', 'Thanksgiving traditions'],
  ['mile-high-united-way-turkey-trot-series', turkeyMemories, 'Seven Thanksgiving editions that became one tradition.', 'Thanksgiving mornings, family, friends, Olive'],
];

test('every narrative added on 2026-08-28 remains wired to a public record', async () => {
  for (const [recordId, source] of narrativeCases) {
    expect(source[recordId], `${recordId} narrative source`).toBeTruthy();
    expect(recordsById.get(recordId), `${recordId} public record`).toBeTruthy();
  }
});

for (const [recordId, , firstPhrase, secondPhrase] of narrativeCases) {
  test(`${recordId} renders its 2026-08-28 narrative`, async ({ page }) => {
    await page.goto(`/detail.html?record=${recordId}`, { waitUntil: 'domcontentloaded' });
    const story = page.locator('.race-memory-story');
    await expect(story).toBeVisible({ timeout: 15000 });
    await expect(story).toContainText(firstPhrase, { ignoreCase: true });
    await expect(story).toContainText(secondPhrase, { ignoreCase: true });
  });
}
