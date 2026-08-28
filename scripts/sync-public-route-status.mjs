import fs from 'node:fs/promises';
import { SOURCE_BACKED_FLOOR_QUALITIES } from './lib/route-detail-quality.mjs';

const checkOnly = process.argv.includes('--check');
const readJson = async path => JSON.parse(await fs.readFile(path, 'utf8'));
const [recordsPayload, routeIndex] = await Promise.all([
  readJson('data/public-records.json'),
  readJson('data/route-detail-index.json'),
]);

const records = recordsPayload.records || recordsPayload;
let changed = 0;
let sourceBacked = 0;
const stale = [];

for (const record of records) {
  const entry = routeIndex.records?.[record.id];
  if (!entry || !SOURCE_BACKED_FLOOR_QUALITIES.has(entry.quality)) continue;
  sourceBacked += 1;

  // Privacy is an explicit policy decision and must never be overridden by a
  // derived publication status. Everything else with source-backed route detail
  // has a public GPS route by definition.
  if (record.routeStatus === 'withheld-privacy' || record.routeInfo?.status === 'withheld-privacy') continue;

  const featureIds = new Set((record.routeFeatureIds || []).map(String));
  if (entry.featureId) featureIds.add(String(entry.featureId));
  const nextFeatureIds = [...featureIds];
  const statusChanged = record.routeStatus !== 'gps' || record.routeInfo?.status !== 'gps';
  const featuresChanged = JSON.stringify(record.routeFeatureIds || []) !== JSON.stringify(nextFeatureIds);
  if (!statusChanged && !featuresChanged) continue;

  stale.push({ id: record.id, priorStatus: record.routeInfo?.status || record.routeStatus || null, featureId: entry.featureId, quality: entry.quality });
  record.routeStatus = 'gps';
  record.routeFeatureIds = nextFeatureIds;
  record.routeInfo = {
    ...(record.routeInfo || {}),
    status: 'gps',
    provenance: record.routeInfo?.provenance ?? record.routeProvenance ?? null,
  };
  changed += 1;
}

if (checkOnly) {
  if (stale.length) {
    console.error(`Found ${stale.length} stale public route-status record(s):`);
    for (const item of stale) console.error(JSON.stringify(item));
    process.exitCode = 1;
  } else {
    console.log(`Public route status is synchronized across ${sourceBacked} source-backed record(s).`);
  }
} else {
  const output = Array.isArray(recordsPayload) ? records : { ...recordsPayload, records };
  await fs.writeFile('data/public-records.json', `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Synchronized public route status for ${changed} record(s); ${sourceBacked} source-backed records inspected.`);
}
