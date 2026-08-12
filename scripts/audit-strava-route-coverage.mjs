import fs from 'node:fs';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const recordsPayload = readJson('data/public-records.json');
const routeCatalog = readJson('data/route-catalog.json');

const featureIds = new Set();
const routeActivityIds = new Set();

for (const routeFile of routeCatalog.routeFiles || []) {
  const payload = readJson(routeFile);
  for (const feature of payload.features || []) {
    const id = feature.id || feature.properties?.featureId || feature.properties?.id;
    if (id) featureIds.add(String(id));
    const activityId = feature.properties?.stravaActivityId;
    if (activityId != null) routeActivityIds.add(String(activityId));
    if (id && String(id).startsWith('strava-')) routeActivityIds.add(String(id).slice(7));
  }
}

for (const polylineFile of routeCatalog.polylineFiles?.length ? routeCatalog.polylineFiles : ['data/activity-route-polylines.json']) {
  const payload = readJson(polylineFile);
  for (const route of payload.routes || []) {
    if (route.id) featureIds.add(String(route.id));
    if (route.stravaActivityId != null) routeActivityIds.add(String(route.stravaActivityId));
    if (route.id && String(route.id).startsWith('strava-')) routeActivityIds.add(String(route.id).slice(7));
  }
}

const privacyIds = new Set(Object.entries(routeCatalog.recordOverrides || {})
  .filter(([, value]) => value?.provenance === 'privacy-withheld')
  .map(([id]) => id));

const records = recordsPayload.records || recordsPayload;
const audit = [];
for (const record of records) {
  const activityIds = [
    ...(record.stravaActivityIds || []),
    ...(record.stravaActivityId != null ? [record.stravaActivityId] : []),
  ].filter(value => value != null).map(String);
  const uniqueActivityIds = [...new Set(activityIds)];
  if (!uniqueActivityIds.length) continue;

  const privacyWithheld = privacyIds.has(record.id) || record.routeStatus === 'withheld-privacy' || record.routeInfo?.status === 'withheld-privacy';
  const coveredActivityIds = uniqueActivityIds.filter(activityId => routeActivityIds.has(activityId) || featureIds.has(`strava-${activityId}`));
  const missingActivityIds = uniqueActivityIds.filter(activityId => !coveredActivityIds.includes(activityId));

  audit.push({
    id: record.id,
    slug: record.slug,
    date: record.date || record.startDate || null,
    name: record.name,
    kind: record.kind || record.recordClass || null,
    routeStatus: record.routeStatus || record.routeInfo?.status || null,
    activityIds: uniqueActivityIds,
    coveredActivityIds,
    missingActivityIds,
    privacyWithheld,
  });
}

const actionableMissing = audit.filter(item => item.missingActivityIds.length && !item.privacyWithheld);
const intentionalPrivacy = audit.filter(item => item.missingActivityIds.length && item.privacyWithheld);
const fullyCovered = audit.filter(item => !item.missingActivityIds.length);

console.log(JSON.stringify({
  recordsWithStrava: audit.length,
  fullyCovered: fullyCovered.length,
  actionableMissing: actionableMissing.length,
  intentionalPrivacy: intentionalPrivacy.length,
}, null, 2));

if (intentionalPrivacy.length) {
  console.log('\nINTENTIONAL_PRIVACY');
  for (const item of intentionalPrivacy) console.log(JSON.stringify(item));
}
if (actionableMissing.length) {
  console.log('\nMISSING_STRAVA_ROUTES');
  for (const item of actionableMissing) console.log(JSON.stringify(item));
  process.exitCode = 1;
} else {
  console.log('\nEvery public record linked to Strava has its personal GPS route, except explicit privacy-withheld records.');
}
