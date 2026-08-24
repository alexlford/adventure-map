import assert from 'node:assert/strict';
import { auditQualityFloor, buildMonotonicQualityFloor } from './lib/route-detail-quality.mjs';

const publicRecordIds = new Set(['full', 'reviewed', 'rdp', 'upgrade', 'missing']);
const floorRecords = {
  full: 'full-source',
  reviewed: 'reviewed-source',
  rdp: 'rdp-3m',
  upgrade: 'rdp-3m',
  missing: 'rdp-3m',
};

const indexRecords = {
  full: { quality: 'reviewed-source' },
  reviewed: { quality: 'rdp-3m' },
  rdp: { quality: 'backfill' },
  upgrade: { quality: 'full-source' },
};

const audit = auditQualityFloor({ indexRecords, publicRecordIds, floorRecords });
assert.deepEqual(
  audit.violations.map(({ recordId, reason }) => [recordId, reason]),
  [
    ['full', 'quality-regression'],
    ['reviewed', 'quality-regression'],
    ['rdp', 'quality-regression'],
    ['missing', 'unindexed'],
  ],
);
assert.equal(audit.problems.length, 4);

const clean = auditQualityFloor({
  indexRecords: {
    full: { quality: 'full-source' },
    reviewed: { quality: 'reviewed-source' },
    rdp: { quality: 'rdp-3m' },
    upgrade: { quality: 'reviewed-source' },
  },
  publicRecordIds: new Set(['full', 'reviewed', 'rdp', 'upgrade']),
  floorRecords: {
    full: 'full-source',
    reviewed: 'reviewed-source',
    rdp: 'rdp-3m',
    upgrade: 'rdp-3m',
  },
});
assert.deepEqual(clean.violations, []);
assert.deepEqual(clean.problems, []);

const refreshed = buildMonotonicQualityFloor(
  {
    keepFull: { quality: 'rdp-3m' },
    promoteReviewed: { quality: 'reviewed-source' },
    promoteFull: { quality: 'full-source' },
    add: { quality: 'rdp-3m' },
    ignoreBackfill: { quality: 'backfill' },
  },
  {
    keepFull: 'full-source',
    promoteReviewed: 'rdp-3m',
    promoteFull: 'reviewed-source',
    preserveMissing: 'rdp-3m',
  },
);

assert.deepEqual(refreshed, {
  add: 'rdp-3m',
  keepFull: 'full-source',
  preserveMissing: 'rdp-3m',
  promoteFull: 'full-source',
  promoteReviewed: 'reviewed-source',
});

console.log('Route detail quality floor tests passed.');
