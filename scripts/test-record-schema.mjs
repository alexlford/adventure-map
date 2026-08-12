import assert from 'node:assert/strict';
import { validatePublicRecord } from './lib/record-schema.mjs';

const baseRecord = {
  id: 'schema-test-race',
  slug: 'schema-test-race',
  name: 'Schema Test Race',
  kind: 'race',
  discipline: 'road',
  recordClass: 'race',
  sport: 'running',
  date: '2026-08-12',
  startDate: '2026-08-12',
  finishDate: '2026-08-12',
  matchConfidence: 'probable',
  coordinatePrecision: 'resort',
  lat: 39.7392,
  lon: -104.9903,
  distanceInfo: { km: 5, mi: 3.10686, label: '5K', source: 'official' },
  locationInfo: { label: 'Denver, Colorado', region: 'Colorado', lat: 39.7392, lon: -104.9903, precision: 'resort' },
  evidence: { source: null, matchSource: null, resultSource: null, confidence: 'probable' },
  routeInfo: { status: null, provenance: null }
};

assert.deepEqual(validatePublicRecord(baseRecord), [], 'representative resolved race should satisfy the schema');
assert.ok(validatePublicRecord({ ...baseRecord, kind: 'not-a-kind' }).some(error => error.includes('.kind')), 'invalid kind should be rejected');
const { discipline, ...raceWithoutDiscipline } = baseRecord;
assert.ok(validatePublicRecord(raceWithoutDiscipline).some(error => error.includes('.discipline is required')), 'race discipline should be required');
const { lon, ...recordWithoutLon } = baseRecord;
assert.ok(validatePublicRecord(recordWithoutLon).some(error => error.includes('.lon is required')), 'lat/lon should be paired');
assert.ok(validatePublicRecord({ ...baseRecord, matchConfidence: 'maybe' }).some(error => error.includes('.matchConfidence')), 'invalid confidence should be rejected');
assert.deepEqual(validatePublicRecord({ ...baseRecord, coordinatePrecision: 'resort' }), [], 'current resort precision should be canonical');

console.log('Public record schema contract tests passed.');
