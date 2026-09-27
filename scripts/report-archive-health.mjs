import fs from 'node:fs/promises';

const publicPayload = JSON.parse(await fs.readFile('data/public-records.json', 'utf8'));
const photoManifest = JSON.parse(await fs.readFile('data/event-photo-manifest.json', 'utf8'));
const records = publicPayload.records || [];
const photos = photoManifest.photos || [];
const photoRecordIds = new Set(
  photos.filter(photo => photo.status === 'canonical' && photo.eventId).map(photo => photo.eventId)
);

const checks = [
  ['Date', record => Boolean(record.startDate || record.date || record.year)],
  ['Place', record => Boolean(record.locationInfo?.label || record.location || record.region)],
  ['Coordinates', record => Number.isFinite(record.locationInfo?.lat ?? record.lat) && Number.isFinite(record.locationInfo?.lon ?? record.lon)],
  ['Explicit taxonomy', record => Boolean(record.recordClass && record.sport)],
  ['Distance', record => Number.isFinite(record.distanceInfo?.mi) || Number.isFinite(record.distanceMi) || Number.isFinite(record.officialDistanceMi)],
  ['Route', record => Boolean(record.routeFeatureIds?.length || record.routeInfo?.status === 'gps' || record.routeStatus === 'gps')],
  ['Evidence', record => Boolean(record.evidence?.source || record.evidence?.matchSource || record.evidence?.resultSource || record.matchSource || record.resultSource)],
  ['Photo', record => Boolean(record.media?.length || photoRecordIds.has(record.id))]
];

const rows = checks.map(([label, predicate]) => {
  const complete = records.filter(predicate).length;
  return { label, complete, missing: records.length - complete, pct: records.length ? complete / records.length * 100 : 0 };
});

console.log(`Archive health: ${records.length} public records`);
console.log('');
console.log('Field                Complete   Missing   Coverage');
console.log('-------------------  --------   -------   --------');
for (const row of rows) {
  console.log(`${row.label.padEnd(19)}  ${String(row.complete).padStart(8)}   ${String(row.missing).padStart(7)}   ${row.pct.toFixed(1).padStart(7)}%`);
}

const weighted = records.map(record => {
  const missing = checks.filter(([, predicate]) => !predicate(record)).map(([label]) => label);
  const score = missing.reduce((sum, label) => sum + ({ Date: 5, Place: 4, Coordinates: 3, 'Explicit taxonomy': 5, Distance: 1, Route: 1, Evidence: 3, Photo: 2 }[label] || 1), 0);
  return { record, missing, score };
}).filter(item => item.missing.length).sort((a, b) => b.score - a.score || String(b.record.startDate || b.record.date || '').localeCompare(String(a.record.startDate || a.record.date || '')));

console.log('');
console.log('Highest-value incomplete records:');
for (const { record, missing } of weighted.slice(0, 20)) {
  console.log(`- ${record.name} (${record.id}): ${missing.join(', ')}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  recordCount: records.length,
  coverage: Object.fromEntries(rows.map(row => [row.label, { complete: row.complete, missing: row.missing, percent: Number(row.pct.toFixed(1)) }])),
  priorityIncomplete: weighted.slice(0, 50).map(({ record, missing, score }) => ({ id: record.id, slug: record.slug || null, name: record.name, score, missing }))
};

if (process.argv.includes('--json')) process.stdout.write(`\n${JSON.stringify(report, null, 2)}\n`);
