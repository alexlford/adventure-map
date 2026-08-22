import fs from 'node:fs/promises';

const outputPath = 'data/recurring-race-audit.json';
const checkOnly = process.argv.includes('--check');
const writeOnly = process.argv.includes('--write') || !checkOnly;

const readJson = async path => JSON.parse(await fs.readFile(path, 'utf8'));
const yearFor = record => Number(record.year || String(record.date || '').slice(0, 4)) || null;
const distanceMiles = record => Number.isFinite(record.officialDistanceMi) ? record.officialDistanceMi
  : Number.isFinite(record.distanceMi) ? record.distanceMi
  : Number.isFinite(record.officialDistanceKm) ? record.officialDistanceKm / 1.609344
  : Number.isFinite(record.distanceKm) ? record.distanceKm / 1.609344
  : null;
const distanceLabel = record => record.officialDistance || record.distance || (Number.isFinite(distanceMiles(record)) ? `${distanceMiles(record).toFixed(1)} mi` : 'unknown');
const hasOfficialResult = record => Boolean(
  record.officialTime || record.officialGunTime || record.officialPlace || record.divisionPlace ||
  record.genderPlace || record.officialPace || record.award || record.ageGroupPlace ||
  (record.officialSplits || []).length
);
const hasUsableRoute = record => {
  if ((record.routeFeatureIds || []).length) return true;
  const status = String(record.routeStatus || '').toLowerCase();
  if (!status || /pending|location-only|none|missing/.test(status)) return false;
  return /gps|route|course|source|historical/.test(status);
};
const normalizedFamilyName = record => {
  const preferred = record.eventSeries || record.seriesName || record.eventName || record.name || '';
  return String(preferred)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\bvirtual\b/g, ' ')
    .replace(/\b(?:5k|10k|15k|20k|25k|30k|50k|100k)\b/g, ' ')
    .replace(/\b(?:3\.1|6\.2|13\.1|26\.2)\s*(?:mi|mile|miles)?\b/g, ' ')
    .replace(/\b(?:one|1|four|4|ten|10)\s*[- ]?miler\b/g, ' ')
    .replace(/\b(?:one|1|four|4|ten|10)\s*mile\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const publicPayload = await readJson('data/public-records.json');
const relationshipPayload = await readJson('data/relationships.json');
const records = publicPayload.records || [];
const races = records.filter(record => record.kind === 'race');
const byId = new Map(records.map(record => [record.id, record]));
const seriesRelationships = (relationshipPayload.relationships || []).filter(rel => rel.type === 'series');
const seriesMembership = new Map();
for (const rel of seriesRelationships) {
  for (const id of rel.memberIds || []) {
    if (!seriesMembership.has(id)) seriesMembership.set(id, []);
    seriesMembership.get(id).push(rel.id);
  }
}

const series = seriesRelationships.map(rel => {
  const members = (rel.memberIds || []).map(id => byId.get(id)).filter(Boolean).filter(record => record.kind === 'race');
  const missingMemberIds = (rel.memberIds || []).filter(id => !byId.has(id));
  const years = [...new Set(members.map(yearFor).filter(Boolean))].sort((a, b) => a - b);
  const distanceCounts = new Map();
  for (const record of members) distanceCounts.set(distanceLabel(record), (distanceCounts.get(distanceLabel(record)) || 0) + 1);
  return {
    id: rel.id,
    name: rel.name,
    adventureId: rel.adventureId || null,
    storyPresent: Boolean(rel.adventureId && byId.has(rel.adventureId)),
    appearanceCount: members.length,
    years,
    memberIds: members.map(record => record.id),
    missingMemberIds,
    officialResultCount: members.filter(hasOfficialResult).length,
    routeCount: members.filter(hasUsableRoute).length,
    distanceHistory: [...distanceCounts.entries()].map(([label, count]) => ({ label, count })),
    resultRecoveryIds: members.filter(record => !hasOfficialResult(record)).map(record => record.id),
    routeRecoveryIds: members.filter(record => !hasUsableRoute(record)).map(record => record.id)
  };
}).sort((a, b) => a.name.localeCompare(b.name));

const families = new Map();
for (const record of races) {
  const key = normalizedFamilyName(record);
  if (!key || key.length < 4) continue;
  if (!families.has(key)) families.set(key, []);
  families.get(key).push(record);
}

const candidateFamilies = [];
const representedFamilies = [];
for (const [key, members] of families) {
  const years = [...new Set(members.map(yearFor).filter(Boolean))].sort((a, b) => a - b);
  if (years.length < 2) continue;
  const represented = members.filter(record => seriesMembership.has(record.id));
  const unrepresented = members.filter(record => !seriesMembership.has(record.id));
  const entry = {
    key,
    displayName: members[0].eventSeries || members[0].seriesName || members[0].eventName || members[0].name,
    years,
    memberIds: members.map(record => record.id).sort(),
    representedMemberIds: represented.map(record => record.id).sort(),
    unrepresentedMemberIds: unrepresented.map(record => record.id).sort(),
    relatedSeriesIds: [...new Set(represented.flatMap(record => seriesMembership.get(record.id) || []))].sort()
  };
  if (unrepresented.length) candidateFamilies.push(entry);
  else representedFamilies.push(entry);
}

candidateFamilies.sort((a, b) => b.years.length - a.years.length || a.displayName.localeCompare(b.displayName));
representedFamilies.sort((a, b) => a.displayName.localeCompare(b.displayName));

const researchQueue = [];
for (const item of series) {
  for (const id of item.resultRecoveryIds) researchQueue.push({ type: 'official-result', seriesId: item.id, recordId: id });
  for (const id of item.routeRecoveryIds) researchQueue.push({ type: 'route', seriesId: item.id, recordId: id });
}
for (const family of candidateFamilies) {
  researchQueue.push({ type: 'series-review', familyKey: family.key, memberIds: family.unrepresentedMemberIds });
}

const payload = {
  schemaVersion: 1,
  raceCount: races.length,
  seriesCount: series.length,
  series,
  candidateFamilies,
  representedFamilies,
  researchQueue
};
const serialized = `${JSON.stringify(payload, null, 2)}\n`;

if (checkOnly) {
  const current = await fs.readFile(outputPath, 'utf8').catch(() => '');
  if (current !== serialized) {
    console.error(`${outputPath} is stale. Run npm run build:recurring-race-audit and commit the result.`);
    process.exit(1);
  }
  console.log(`Recurring race audit is current: ${series.length} series, ${candidateFamilies.length} review candidates, ${researchQueue.length} research tasks.`);
} else if (writeOnly) {
  await fs.writeFile(outputPath, serialized);
  console.log(`Wrote ${outputPath}: ${series.length} series, ${candidateFamilies.length} review candidates, ${researchQueue.length} research tasks.`);
}
