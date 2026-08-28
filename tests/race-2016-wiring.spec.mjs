import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

const publicRecords = readJson('data/public-records.json').records;
const memories = readJson('data/race-memories.json').records;
const relationships = readJson('data/relationships.json').relationships;
const recurringAudit = readJson('data/recurring-race-audit.json').series;
const recordsById = new Map(publicRecords.map(record => [record.id, record]));

test('2016 spring races keep canonical IDs, official results, and memories wired together', async () => {
  const expected = new Map([
    ['rock-parkway-half-2016', '1:47:58.7'],
    ['garmin-half-2016', '1:43:16'],
    ['illinois-5k-2016', '21:02'],
    ['illinois-half-2016', '1:48:13'],
    ['running-with-cows-half-2016', '1:43:29.6']
  ]);

  for (const [id, officialTime] of expected) {
    const record = recordsById.get(id);
    expect(record, `${id} public record`).toBeTruthy();
    expect(record.kind, `${id} kind`).toBe('race');
    expect(record.officialTime, `${id} official result`).toBe(officialTime);
    expect(memories[id], `${id} memory`).toBeTruthy();
  }

  expect(memories['rock-the-parkway-half-2016']).toBeUndefined();
  expect(memories['running-with-the-cows-half-2016']).toBeUndefined();
});

test('2016 Heartland and Illinois race groupings retain their intended semantics', async () => {
  const heartland = relationships.find(rel => rel.id === 'heartland-39-3-series-2016');
  expect(heartland).toMatchObject({
    type: 'series',
    adventureId: 'heartland-39-3-2016',
    memberIds: ['rock-parkway-half-2016', 'garmin-half-2016', 'running-with-cows-half-2016']
  });

  const heartlandAudit = recurringAudit.find(series => series.id === 'heartland-39-3-series-2016');
  expect(heartlandAudit).toMatchObject({
    storyPresent: true,
    appearanceCount: 3,
    officialResultCount: 3,
    routeCount: 3
  });
  expect(heartlandAudit.missingMemberIds).toEqual([]);

  const illinois = relationships.find(rel => rel.id === 'illinois-half-i-challenge-2016-series');
  expect(illinois).toMatchObject({
    type: 'challenge',
    adventureId: 'illinois-half-i-challenge-2016',
    memberIds: ['illinois-5k-2016', 'illinois-half-2016']
  });
});
