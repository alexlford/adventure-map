import fs from 'node:fs';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const publicPayload = readJson('data/public-records.json');
const detailIndex = readJson('data/route-detail-index.json');
const records = publicPayload.records || [];

const mapped = records.filter(record => Array.isArray(record.routeFeatureIds) && record.routeFeatureIds.length > 0);
const missing = mapped.filter(record => !detailIndex.records?.[record.id]);
const broken = mapped.flatMap(record => {
  const entry = detailIndex.records?.[record.id];
  if (!entry) return [];
  const errors = [];
  if (!entry.featureId) errors.push(`${record.id}: detail index entry has no featureId`);
  if (!entry.file || !fs.existsSync(entry.file)) errors.push(`${record.id}: detail source file is missing: ${entry.file || '(none)'}`);
  return errors;
});

console.log(`Route detail addressability: ${mapped.length} mapped public records checked.`);
for (const record of missing) {
  console.error(`ERROR ${record.id}: mapped public record has no route detail index entry`);
}
for (const error of broken) console.error(`ERROR ${error}`);

if (missing.length || broken.length) process.exit(1);
console.log('Every mapped public record is addressable by an existing route detail source.');
