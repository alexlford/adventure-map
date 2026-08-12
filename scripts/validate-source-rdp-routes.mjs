import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));

const catalog = await readJson('data/route-catalog.json');
const expected = catalog.qualityExpectations?.sourceRdpArchive;
if (!expected) throw new Error('Missing qualityExpectations.sourceRdpArchive.');

const shardFiles = (catalog.polylineFiles || []).filter(rel => /^data\/strava-route-rdp3-\d+\.json$/.test(rel));
if (shardFiles.length !== expected.shardCount) {
  throw new Error(`Expected ${expected.shardCount} source-RDP shards, found ${shardFiles.length}.`);
}

const protectedDenserRoutes = new Set([
  'strava-6814188054',
  'strava-6819611723',
  'strava-9642214422',
  'strava-14377032125',
]);
const routeIds = new Set();
let routeCount = 0;
let sourcePointCount = 0;
let publishedPointCount = 0;

for (const rel of shardFiles) {
  const payload = await readJson(rel);
  if (payload.encoding !== 'google-polyline5') throw new Error(`${rel}: expected google-polyline5 encoding.`);
  if (payload.sampling !== 'source-rdp-3m') throw new Error(`${rel}: unexpected sampling ${payload.sampling}.`);
  if (payload.simplificationToleranceMeters !== expected.simplificationToleranceMeters) {
    throw new Error(`${rel}: simplification tolerance changed.`);
  }
  if (payload.splitGapMeters !== expected.splitGapMeters) throw new Error(`${rel}: source-gap threshold changed.`);
  if (!Array.isArray(payload.routes) || !payload.routes.length) throw new Error(`${rel}: route shard is empty.`);

  for (const route of payload.routes) {
    if (!route.id || routeIds.has(route.id)) throw new Error(`${rel}: duplicate or missing route id ${route.id || '(missing)'}.`);
    if (protectedDenserRoutes.has(route.id)) throw new Error(`${rel}: must not replace protected denser route ${route.id}.`);
    if (!Array.isArray(route.adventureIds) || !route.adventureIds.length) throw new Error(`${route.id}: missing adventure ownership.`);
    if (!Array.isArray(route.lines) || !route.lines.length || route.lines.some(line => typeof line !== 'string' || !line.length)) {
      throw new Error(`${route.id}: missing encoded line geometry.`);
    }
    if (route.density !== 'source-rdp-3m') throw new Error(`${route.id}: density metadata changed.`);
    if (!Number.isInteger(route.sourcePointCount) || route.sourcePointCount < 2) throw new Error(`${route.id}: invalid sourcePointCount.`);
    if (!Number.isInteger(route.publishedPointCount) || route.publishedPointCount < 2 || route.publishedPointCount > route.sourcePointCount) {
      throw new Error(`${route.id}: invalid publishedPointCount.`);
    }
    routeIds.add(route.id);
    routeCount += 1;
    sourcePointCount += route.sourcePointCount;
    publishedPointCount += route.publishedPointCount;
  }
}

const totals = { routeCount, sourcePointCount, publishedPointCount };
for (const [key, actual] of Object.entries(totals)) {
  if (actual !== expected[key]) throw new Error(`Source-RDP ${key} changed: expected ${expected[key]}, found ${actual}.`);
}

console.log(`Source-derived GPS archive validated: ${routeCount} routes, ${publishedPointCount.toLocaleString()} published vertices from ${sourcePointCount.toLocaleString()} source points, max ${expected.simplificationToleranceMeters} m simplification deviation, ${expected.splitGapMeters} m source-gap splitting.`);
