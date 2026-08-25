import fs from 'node:fs';
import { QUALITY_ORDER, auditQualityFloor } from './lib/route-detail-quality.mjs';

const args = new Set(process.argv.slice(2));
const enforce = args.has('--enforce');
const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));

const index = readJson('data/route-detail-index.json');
const qualityFloor = readJson('data/route-detail-quality-floor.json');
const routeCatalog = readJson('data/route-catalog.json');
const recordsPayload = readJson('data/public-records.json');
const records = recordsPayload.records || recordsPayload;
const recordsById = new Map(records.map(record => [String(record.id), record]));
const entries = Object.entries(index.records || {});

const knownQualities = new Set(QUALITY_ORDER);
const problems = [];
const orphanEntries = [];
const byQuality = Object.fromEntries(QUALITY_ORDER.map(quality => [quality, 0]));
const selectedFeatures = new Set();
const historicalCatalogDetailList = (routeCatalog.qualityExpectations?.historicalCatalogDetailRecords || []).map(String);
const historicalCatalogDetailRecords = new Set(historicalCatalogDetailList);
const catalogDetailRecords = new Set(
  entries
    .filter(([recordId, entry]) => recordsById.has(recordId) && entry?.quality === 'catalog-detail')
    .map(([recordId]) => recordId),
);
const catalogDetailPolicyProblems = [];

if (historicalCatalogDetailList.length !== historicalCatalogDetailRecords.size) {
  catalogDetailPolicyProblems.push('historical catalog-detail registry contains duplicate record IDs');
}
for (const recordId of catalogDetailRecords) {
  if (!historicalCatalogDetailRecords.has(recordId)) {
    catalogDetailPolicyProblems.push(`${recordId}: catalog-detail is not registered as an intentional historical proxy`);
  }
}
for (const recordId of historicalCatalogDetailRecords) {
  if (!recordsById.has(recordId)) {
    catalogDetailPolicyProblems.push(`${recordId}: historical catalog-detail registry entry is not a public record`);
    continue;
  }
  const selected = index.records?.[recordId];
  if (!selected) {
    catalogDetailPolicyProblems.push(`${recordId}: historical catalog-detail registry entry has no route-detail selection`);
  } else if (selected.quality !== 'catalog-detail') {
    catalogDetailPolicyProblems.push(
      `${recordId}: historical catalog-detail registry entry is stale; selected quality is ${selected.quality}`,
    );
  }
}
problems.push(...catalogDetailPolicyProblems);

if (qualityFloor.schemaVersion !== 1) {
  problems.push(`route detail quality floor schemaVersion is ${qualityFloor.schemaVersion}; expected 1`);
}

for (const [recordId, entry] of entries) {
  const isPublic = recordsById.has(recordId);
  if (!isPublic) orphanEntries.push({ recordId, entry });
  if (!entry?.file) problems.push(`${recordId}: detail entry is missing file`);
  if (!entry?.featureId) problems.push(`${recordId}: detail entry is missing featureId`);
  if (!knownQualities.has(entry?.quality)) problems.push(`${recordId}: unknown detail quality ${entry?.quality}`);
  if (isPublic && knownQualities.has(entry?.quality)) byQuality[entry.quality] += 1;
  if (entry?.featureId) selectedFeatures.add(entry.featureId);
}

if (index.recordCount !== entries.length) {
  problems.push(`recordCount metadata is ${index.recordCount}; actual indexed records are ${entries.length}`);
}
if (index.featureCount !== selectedFeatures.size) {
  problems.push(`featureCount metadata is ${index.featureCount}; actual selected features are ${selectedFeatures.size}`);
}

const indexedPublicIds = new Set(entries.filter(([recordId]) => recordsById.has(recordId)).map(([recordId]) => recordId));
const unindexed = records.filter(record => !indexedPublicIds.has(String(record.id)));
const sourceGradeRecords = byQuality['full-source'];
const detailGradeRecords = QUALITY_ORDER
  .slice(0, QUALITY_ORDER.indexOf('backfill'))
  .reduce((sum, quality) => sum + byQuality[quality], 0);

const floorAudit = auditQualityFloor({
  indexRecords: index.records || {},
  publicRecordIds: new Set(recordsById.keys()),
  floorRecords: qualityFloor.records || {},
});
problems.push(...floorAudit.problems);

const summary = {
  publicRecords: records.length,
  indexRecords: entries.length,
  indexedPublicRecords: indexedPublicIds.size,
  orphanIndexRecords: orphanEntries.length,
  unindexedPublicRecords: unindexed.length,
  selectedFeatures: selectedFeatures.size,
  sourceGradeRecords,
  detailGradeRecords,
  qualityFloorRecords: Object.keys(qualityFloor.records || {}).length,
  qualityFloorViolations: floorAudit.violations.length,
  historicalCatalogDetailRecords: historicalCatalogDetailRecords.size,
  catalogDetailPolicyViolations: catalogDetailPolicyProblems.length,
  quality: byQuality,
};

console.log(JSON.stringify(summary, null, 2));

const backfill = records
  .filter(record => index.records?.[record.id]?.quality === 'backfill')
  .sort((a, b) => String(b.startDate || b.date || '').localeCompare(String(a.startDate || a.date || '')) || String(a.name || a.id).localeCompare(String(b.name || b.id)));

console.log('\nBACKFILL_PRIORITY');
for (const record of backfill) {
  console.log(JSON.stringify({
    id: record.id,
    date: record.startDate || record.date || null,
    name: record.name || null,
    recordClass: record.recordClass || record.kind || null,
    sport: record.sport || record.discipline || null,
  }));
}

if (floorAudit.violations.length) {
  console.log('\nQUALITY_FLOOR_VIOLATIONS');
  for (const violation of floorAudit.violations) console.log(JSON.stringify(violation));
}

if (catalogDetailPolicyProblems.length) {
  console.log('\nCATALOG_DETAIL_POLICY_VIOLATIONS');
  for (const problem of catalogDetailPolicyProblems) console.log(JSON.stringify({ problem }));
}

if (orphanEntries.length) {
  console.log('\nORPHAN_INDEX_RECORDS');
  for (const { recordId, entry } of orphanEntries) {
    console.log(JSON.stringify({ recordId, quality: entry?.quality || null, featureId: entry?.featureId || null }));
  }
}

if (unindexed.length) {
  console.log('\nUNINDEXED_PUBLIC_RECORDS');
  for (const record of unindexed) {
    console.log(JSON.stringify({
      id: record.id,
      date: record.startDate || record.date || null,
      name: record.name || null,
      routeStatus: record.routeInfo?.status || record.routeStatus || null,
    }));
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`ERROR ${problem}`);
  if (enforce) process.exitCode = 1;
} else {
  if (orphanEntries.length) console.warn(`\nWARN ${orphanEntries.length} route detail index record(s) are not in the public catalog.`);
  console.log('\nRoute detail coverage audit passed.');
}
