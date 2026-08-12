import fs from 'node:fs';
import zlib from 'node:zlib';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const readPolylineJson = path => {
  const text = fs.readFileSync(path, 'utf8');
  if (path.endsWith('.gz.b64')) return JSON.parse(zlib.gunzipSync(Buffer.from(text.trim(), 'base64')).toString('utf8'));
  return JSON.parse(text);
};
const recordsPayload = readJson('data/public-records.json');
const routeCatalog = readJson('data/route-catalog.json');
const relationshipPayload = readJson('data/relationships.json');

const personalFeatureIds = new Set();
const routeActivityIds = new Set();
const personalOwnedRecordIds = new Set();

const addAdventureIds = values => {
  const ids = Array.isArray(values) ? values : (values ? [values] : []);
  for (const id of ids) personalOwnedRecordIds.add(String(id));
};

const isPersonalGps = (id, properties = {}) => {
  if (properties.provenance === 'personal-gps') return true;
  if (properties.stravaActivityId != null) return true;
  if (id && String(id).startsWith('strava-')) return true;
  const source = `${properties.source || ''} ${properties.sourceLabel || ''} ${properties.routeType || ''}`.toLowerCase();
  return (source.includes('strava') || source.includes('personal gps')) && !source.includes('historical');
};

for (const routeFile of routeCatalog.routeFiles || []) {
  const payload = readJson(routeFile);
  for (const feature of payload.features || []) {
    const id = feature.id || feature.properties?.featureId || feature.properties?.id;
    const override = id ? routeCatalog.featureOverrides?.[id] : null;
    const properties = { ...(feature.properties || {}), ...(override || {}) };
    if (!isPersonalGps(id, properties)) continue;
    if (id) personalFeatureIds.add(String(id));
    const activityId = properties.stravaActivityId;
    if (activityId != null) routeActivityIds.add(String(activityId));
    if (id && String(id).startsWith('strava-')) routeActivityIds.add(String(id).slice(7));
    addAdventureIds(properties.adventureIds);
  }
}

const polylineFiles = [
  ...(routeCatalog.preferredPolylineFiles || []),
  ...(routeCatalog.polylineFiles?.length ? routeCatalog.polylineFiles : ['data/activity-route-polylines.json']),
];
for (const polylineFile of polylineFiles) {
  const payload = readPolylineJson(polylineFile);
  for (const route of payload.routes || []) {
    const id = route.id || null;
    const override = id ? routeCatalog.featureOverrides?.[id] : null;
    const properties = { ...route, ...(override || {}) };
    if (id) personalFeatureIds.add(String(id));
    if (properties.stravaActivityId != null) routeActivityIds.add(String(properties.stravaActivityId));
    for (const activityId of properties.sourceActivityIds || properties.activityIds || []) routeActivityIds.add(String(activityId));
    if (id && /^strava-\d+$/.test(String(id))) routeActivityIds.add(String(id).slice(7));
    addAdventureIds(properties.adventureIds);
  }
}

// Challenge/weekend pages inherit all personal route geometry from their member events.
// Repeat until stable so nested relationships remain safe if they are introduced later.
let ownershipChanged = true;
while (ownershipChanged) {
  ownershipChanged = false;
  for (const rel of relationshipPayload.relationships || []) {
    if (!rel.adventureId || !Array.isArray(rel.memberIds)) continue;
    if (!rel.memberIds.some(memberId => personalOwnedRecordIds.has(String(memberId)))) continue;
    if (!personalOwnedRecordIds.has(String(rel.adventureId))) {
      personalOwnedRecordIds.add(String(rel.adventureId));
      ownershipChanged = true;
    }
  }
}

const privacyIds = new Set(Object.entries(routeCatalog.recordOverrides || {})
  .filter(([, value]) => value?.provenance === 'privacy-withheld')
  .map(([id]) => id));

const statusRequiresPersonalRoute = status => {
  const value = String(status || '').toLowerCase();
  return value === 'gps'
    || value === 'strava-record'
    || value === 'gps-source-available'
    || value === 'partial-recording'
    || value.startsWith('multi-event')
    || value.startsWith('multi-activity');
};

const records = recordsPayload.records || recordsPayload;
const directAudit = [];
const recordsWithoutStrava = [];
for (const record of records) {
  const activityIds = [
    ...(record.stravaActivityIds || []),
    ...(record.stravaActivityId != null ? [record.stravaActivityId] : []),
  ].filter(value => value != null).map(String);
  const uniqueActivityIds = [...new Set(activityIds)];
  const explicitPersonalRoute = (record.routeFeatureIds || []).some(id => personalFeatureIds.has(String(id)));
  const ownedPersonalRoute = personalOwnedRecordIds.has(String(record.id));
  const coveredActivityIds = uniqueActivityIds.filter(activityId => routeActivityIds.has(activityId) || personalFeatureIds.has(`strava-${activityId}`));
  const hasPersonalRoute = explicitPersonalRoute || ownedPersonalRoute || coveredActivityIds.length > 0;
  const privacyWithheld = privacyIds.has(record.id) || record.routeStatus === 'withheld-privacy' || record.routeInfo?.status === 'withheld-privacy';
  const routeStatus = record.routeStatus || record.routeInfo?.status || null;
  const base = {
    id: record.id,
    slug: record.slug,
    date: record.date || record.startDate || null,
    endDate: record.endDate || null,
    completionDate: record.completionDate || null,
    name: record.name,
    kind: record.kind || record.recordClass || null,
    discipline: record.discipline || null,
    routeStatus,
    hasPersonalRoute,
    privacyWithheld,
    coverageMode: explicitPersonalRoute ? 'record-routeFeatureIds' : (ownedPersonalRoute ? 'route-adventureIds' : (coveredActivityIds.length ? 'strava-activity-id' : null)),
  };

  if (!uniqueActivityIds.length) {
    recordsWithoutStrava.push({ ...base, requiresPersonalRoute: statusRequiresPersonalRoute(routeStatus) });
    continue;
  }

  directAudit.push({
    ...base,
    activityIds: uniqueActivityIds,
    coveredActivityIds,
    missingActivityIds: hasPersonalRoute ? [] : uniqueActivityIds,
  });
}

const directActionableMissing = directAudit.filter(item => item.missingActivityIds.length && !item.privacyWithheld);
const intentionalPrivacy = directAudit.filter(item => item.missingActivityIds.length && item.privacyWithheld);
const directFullyCovered = directAudit.filter(item => !item.missingActivityIds.length);
const aggregateRequired = recordsWithoutStrava.filter(item => item.requiresPersonalRoute);
const aggregateCovered = aggregateRequired.filter(item => item.hasPersonalRoute);
const aggregateActionableMissing = aggregateRequired.filter(item => !item.hasPersonalRoute && !item.privacyWithheld);
const unlinkedWithPersonalRoute = recordsWithoutStrava.filter(item => item.hasPersonalRoute);
const unlinkedWithoutPersonalRoute = recordsWithoutStrava.filter(item => !item.hasPersonalRoute);
const actionableMissing = [...directActionableMissing, ...aggregateActionableMissing];

console.log(JSON.stringify({
  totalPublicRecords: records.length,
  recordsWithDirectStrava: directAudit.length,
  directStravaFullyCovered: directFullyCovered.length,
  directStravaActionableMissing: directActionableMissing.length,
  intentionalPrivacy: intentionalPrivacy.length,
  recordsWithoutDirectStrava: recordsWithoutStrava.length,
  aggregateStravaRouteRequired: aggregateRequired.length,
  aggregateStravaRouteCovered: aggregateCovered.length,
  aggregateStravaRouteMissing: aggregateActionableMissing.length,
  recordsWithoutDirectStravaWithPersonalRoute: unlinkedWithPersonalRoute.length,
  recordsWithoutDirectStravaWithoutPersonalRoute: unlinkedWithoutPersonalRoute.length,
  actionableRouteGaps: actionableMissing.length,
}, null, 2));

if (recordsWithoutStrava.length) {
  console.log('\nNO_DIRECT_STRAVA_LINK');
  for (const item of recordsWithoutStrava) console.log(JSON.stringify(item));
}
if (intentionalPrivacy.length) {
  console.log('\nINTENTIONAL_PRIVACY');
  for (const item of intentionalPrivacy) console.log(JSON.stringify(item));
}
if (actionableMissing.length) {
  console.log('\nMISSING_STRAVA_ROUTES');
  for (const item of actionableMissing) console.log(JSON.stringify(item));
  process.exitCode = 1;
} else {
  console.log('\nEvery public record that should expose Strava/personal GPS geometry has route coverage; only pre-Strava historical records are exceptions.');
}
