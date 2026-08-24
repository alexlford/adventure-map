import assert from 'node:assert/strict';
import {
  publicationSelectionScore,
  routeSegments,
  technicalDetailQuality,
  validateReviewedRoute,
} from './lib/route-geometry-quality.mjs';

assert.equal(
  technicalDetailQuality({ route: { sampling: 'full-source-track-gap-split-180m' } }),
  'full-source',
);
assert.equal(
  technicalDetailQuality({ route: { sampling: 'source-rdp-2m' } }),
  'rdp-3m',
);
assert.equal(
  technicalDetailQuality({
    route: {
      sampling: 'source-rdp-2m',
      publicationSelected: true,
      geometryClass: 'recorded-filtered',
    },
  }),
  'reviewed-source',
);
assert.equal(
  technicalDetailQuality({
    route: {
      sampling: 'source-rdp-1m',
      publicationSelected: true,
      geometryClass: 'recorded-corrected',
    },
  }),
  'reviewed-source',
);
assert.equal(
  publicationSelectionScore({ route: { sampling: 'source-rdp-2m' } }),
  400,
);
assert.equal(
  publicationSelectionScore({
    route: {
      sampling: 'source-rdp-2m',
      publicationSelected: true,
      geometryClass: 'recorded-filtered',
    },
  }),
  1000,
);

const mixed = {
  id: 'route-a',
  geometryClass: 'mixed',
  publicationSelected: true,
  segments: [
    { evidence: 'recorded', line: 'abc' },
    { evidence: 'inferred', confidence: 'high', line: 'def' },
    { evidence: 'recorded', line: 'ghi' },
  ],
};
assert.deepEqual(validateReviewedRoute(mixed), []);
assert.deepEqual(routeSegments(mixed).map(segment => segment.featureId), [
  'route-a',
  'route-a::segment-2',
  'route-a::segment-3',
]);

assert.ok(validateReviewedRoute({
  id: 'route-b',
  geometryClass: 'recorded-clean',
  publicationSelected: true,
  segments: [
    { evidence: 'recorded', line: 'abc' },
    { evidence: 'inferred', confidence: 'medium', line: 'def' },
  ],
}).some(error => error.includes('require geometryClass mixed')));

assert.ok(validateReviewedRoute({
  id: 'route-c',
  publicationSelected: true,
  lines: ['abc'],
}).some(error => error.includes('requires geometryClass')));

console.log('Route geometry quality tests passed.');
