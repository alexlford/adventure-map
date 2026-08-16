import assert from 'node:assert/strict';
import { auditQualityFloor, buildMonotonicQualityFloor } from './lib/route-detail-quality.mjs';

const publicRecordIds = new Set(['full', 'rdp', 'upgrade', 'missing']);
const floorRecords = {
  full: 'full-source',
  rdp: 'rdp-3m',
  upgrade: 'rdp-3m',
  missing: 'rdp-3m',
};

const indexRecords = {
  full: { quality: 'rdp-3m' },
  rdp: { quality: 'backfill' },
  upgrade: { quality: 'full-source' },
};

const audit = auditQualityFloor({ indexRecords, publicRecordIds, floorRecords });
assert.deepEqual(
  audit.violations.map(({ recordId, reason }) => [recordId, reason]),
  [
    ['full', 'quality-regression'],
    ['rdp', 'quality-regression'],
    ['missing', 'unindexed'],
  ],
);
assert.equal(audit.problems.length, 3);

const clean = auditQualityFloor({
  indexRecords: {
    full: { quality: 'full-source' },
    rdp: { quality: 'rdp-3m' },
    upgrade: { quality: 'full-source' },
  },
  publicRecordIds: new Set(['full', 'rdp', 'upgrade']),
  floorRecords: {
    full: 'full-source',
    rdp: 'rdp-3m',
    upgrade: 'rdp-3m',
  },
});
assert.deepEqual(clean.violations, []);
assert.deepEqual(clean.problems, []);

const refreshed = buildMonotonicQualityFloor(
  {
    keepFull: { quality: 'rdp-3m' },
    promote: { quality: 'full-source' },
    add: { quality: 'rdp-3m' },
    ignoreBackfill: { quality: 'backfill' },
  },
  {
    keepFull: 'full-source',
    promote: 'rdp-3m',
    preserveMissing: 'rdp-3m',
  },
);

assert.deepEqual(refreshed, {
  add: 'rdp-3m',
  keepFull: 'full-source',
  preserveMissing: 'rdp-3m',
  promote: 'full-source',
});

console.log('Route detail quality floor tests passed.');
