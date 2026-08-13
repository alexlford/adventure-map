import fs from 'node:fs';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const publicPayload = readJson('data/public-records.json');
const detailIndex = readJson('data/route-detail-index.json');
const records = publicPayload.records || [];

const mapped = records.filter(record => Array.isArray(record.routeFeatureIds) && record.routeFeatureIds.length > 0);
const missing = mapped.filter(record => !detailIndex.records?.[record.id]);

console.log(`Route detail addressability: ${mapped.length} mapped public records checked.`);
if (missing.length) {
  for (const record of missing) {
    console.error(`ERROR ${record.id}: mapped public record has no route detail index entry`);
  }
  process.exit(1);
}

console.log('Every mapped public record is addressable by the route detail index.');
