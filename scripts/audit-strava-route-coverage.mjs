import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const args = process.argv.slice(2);
const compiledIndex = args.indexOf('--compiled');
const compiledPath = compiledIndex >= 0 && args[compiledIndex + 1] ? args[compiledIndex + 1] : 'tmp/public-routes.geojson';
const jsonIndex = args.indexOf('--json');
const jsonPath = jsonIndex >= 0 && args[jsonIndex + 1] ? args[jsonIndex + 1] : null;

const publicPayload = await readJson('data/public-records.json');
const relationshipsPayload = await readJson('data/relationships.json');
const compiled = await readJson(compiledPath);
const records = publicPayload.records || [];
const relationships = relationshipsPayload.relationships || [];
const byId = new Map(records.map(record => [record.id, record]));

const routeFeaturesByRecord = new Map();
const featurePointCount = feature => {
  const geometry = feature?.geometry;
  if (!geometry) return 0;
  if (geometry.type === 'LineString') return geometry.coordinates?.length || 0;
  if (geometry.type === 'MultiLineString') return (geometry.coordinates || []).reduce((sum, line) => sum + (line?.length || 0), 0);
  return 0;
};

for (const feature of compiled.features || []) {
  for (const recordId of feature.properties?.adventureIds || []) {
    const list = routeFeaturesByRecord.get(recordId) || [];
    list.push({
      id: feature.id || feature.properties?.featureId || feature.properties?.id || null,
      provenance: feature.properties?.provenance || null,
      points: featurePointCount(feature),
      stravaActivityId: feature.properties?.stravaActivityId != null ? String(feature.properties.stravaActivityId) : null,
    });
    routeFeaturesByRecord.set(recordId, list);
  }
}

const privacyStatuses = new Set(['withheld-privacy', 'privacy-withheld']);
const privacyWithheld = record => privacyStatuses.has(record.routeStatus) || record.routeInfo?.provenance === 'privacy-withheld';
const stravaIdsFor = record => [...new Set([
  record.stravaActivityId,
  ...(Array.isArray(record.stravaActivityIds) ? record.stravaActivityIds : []),
].filter(value => value != null && value !== '').map(String))];
const personalFeaturesFor = recordId => (routeFeaturesByRecord.get(recordId) || []).filter(feature => feature.provenance === 'personal-gps');

const rows = records.map(record => {
  const stravaIds = stravaIdsFor(record);
  const personal = personalFeaturesFor(record.id);
  const routePoints = personal.reduce((sum, feature) => sum + feature.points, 0);
  const expected = stravaIds.length > 0 && !privacyWithheld(record);
  const status = privacyWithheld(record) ? 'privacy-withheld'
    : expected && personal.length ? 'route-ready'
    : expected ? 'missing-route'
    : personal.length ? 'route-present-without-record-strava-id'
    : 'no-direct-strava-route-expected';
  return {
    id: record.id,
    slug: record.slug,
    kind: record.kind,
    discipline: record.discipline,
    date: record.date || null,
    name: record.name,
    stravaActivityIds: stravaIds,
    expected,
    status,
    personalRouteFeatureIds: personal.map(feature => feature.id),
    routePoints,
  };
});

const challengeRows = [];
for (const rel of relationships) {
  if (!rel.adventureId || !byId.has(rel.adventureId)) continue;
  const parent = byId.get(rel.adventureId);
  const members = (rel.memberIds || []).map(id => byId.get(id)).filter(Boolean);
  if (!members.length) continue;
  const memberAudit = members.map(member => {
    const row = rows.find(item => item.id === member.id);
    return {
      id: member.id,
      name: member.name,
      stravaActivityIds: row?.stravaActivityIds || [],
      routeFeatureIds: row?.personalRouteFeatureIds || [],
      routePoints: row?.routePoints || 0,
      privacyWithheld: privacyWithheld(member),
    };
  });
  const expectedMembers = memberAudit.filter(member => (member.stravaActivityIds.length || member.routeFeatureIds.length) && !member.privacyWithheld);
  const coveredMembers = expectedMembers.filter(member => member.routeFeatureIds.length);
  challengeRows.push({
    relationshipId: rel.id,
    adventureId: parent.id,
    adventureName: parent.name,
    memberCount: members.length,
    expectedRouteMembers: expectedMembers.length,
    coveredRouteMembers: coveredMembers.length,
    status: expectedMembers.length && coveredMembers.length === expectedMembers.length ? 'overlay-ready'
      : expectedMembers.length ? 'overlay-incomplete'
      : 'no-component-strava-routes-expected',
    members: memberAudit,
  });
}

const expectedRows = rows.filter(row => row.expected);
const missing = expectedRows.filter(row => row.status === 'missing-route');
const ready = expectedRows.filter(row => row.status === 'route-ready');
const overlaysIncomplete = challengeRows.filter(row => row.status === 'overlay-incomplete');
const privacy = rows.filter(row => row.status === 'privacy-withheld');
const lowPoint = rows.filter(row => row.personalRouteFeatureIds.length && row.routePoints < 100 && row.status !== 'privacy-withheld');

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  publicRecordCount: records.length,
  directStravaRouteExpectedCount: expectedRows.length,
  directStravaRouteReadyCount: ready.length,
  directStravaRouteMissingCount: missing.length,
  privacyWithheldCount: privacy.length,
  lowPointRouteCount: lowPoint.length,
  combinedStoryCount: challengeRows.length,
  combinedOverlayIncompleteCount: overlaysIncomplete.length,
  missing,
  lowPoint,
  combined: challengeRows,
};

console.log(`STRAVA_ROUTE_AUDIT_SUMMARY ${JSON.stringify({
  publicRecordCount: report.publicRecordCount,
  directExpected: report.directStravaRouteExpectedCount,
  directReady: report.directStravaRouteReadyCount,
  directMissing: report.directStravaRouteMissingCount,
  privacyWithheld: report.privacyWithheldCount,
  lowPointRoutes: report.lowPointRouteCount,
  combinedStories: report.combinedStoryCount,
  combinedOverlayIncomplete: report.combinedOverlayIncompleteCount,
})}`);
for (const row of missing) console.log(`MISSING_ROUTE ${JSON.stringify(row)}`);
for (const row of lowPoint) console.log(`LOW_POINT_ROUTE ${JSON.stringify(row)}`);
for (const row of overlaysIncomplete) console.log(`INCOMPLETE_OVERLAY ${JSON.stringify(row)}`);

if (jsonPath) {
  const out = path.resolve(root, jsonPath);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote route coverage report to ${path.relative(root, out)}`);
}

if (missing.length || overlaysIncomplete.length) process.exitCode = 1;
