import fs from 'node:fs';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const recordsPayload = readJson('data/public-records.json');
const routeCatalog = readJson('data/route-catalog.json');

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

for (const polylineFile of routeCatalog.polylineFiles?.length ? routeCatalog.polylineFiles : ['data/activity-route-polylines.json']) {
  const payload = readJson(polylineFile);
  for (const route of payload.routes || []) {
    if (route.id) personalFeatureIds.add(String(route.id));
    if (route.stravaActivityId != null) routeActivityIds.add(String(route.stravaActivityId));
    if (route.id && String(route.id).startsWith('strava-')) routeActivityIds.add(String(route.id).slice(7));
    addAdventureIds(route.adventureIds);
  }
}

const privacyIds = new Set(Object.entries(routeCatalog.recordOverrides || {})
  .filter(([, value]) => value?.provenance === 'privacy-withheld')
  .map(([id]) => id));

const records = recordsPayload.records || recordsPayload;
const audit = [];
const recordsWithoutStrava = [];
for (const record of records) {
  const activityIds = [
    ...(record.stravaActivityIds || []),
    ...(record.stravaActivityId != null ? [record.stravaActivityId] : []),
  ].filter(value => value != null).map(String);
  const uniqueActivityIds = [...new Set(activityIds)];
  if (!uniqueActivityIds.length) {
    recordsWithoutStrava.push({
      id: record.id,
      slug: record.slug,
      date: record.date || record.startDate || null,
      endDate: record.endDate || null,
      completionDate: record.completionDate || null,
      name: record.name,
      kind: record.kind || record.recordClass || null,
      discipline: record.discipline || null,
      routeStatus: record.routeStatus || record.routeInfo?.status || null,
    });
    continue;
  }

  const privacyWithheld = privacyIds.has(record.id) || record.routeStatus === 'withheld-privacy' || record.routeInfo?.status === 'withheld-privacy';
  const explicitPersonalRoute = (record.routeFeatureIds || []).some(id => personalFeatureIds.has(String(id)));
  const ownedPersonalRoute = personalOwnedRecordIds.has(String(record.id));
  const coveredActivityIds = uniqueActivityIds.filter(activityId => routeActivityIds.has(activityId) || personalFeatureIds.has(`strava-${activityId}`));
  const hasPersonalRoute = explicitPersonalRoute || ownedPersonalRoute || coveredActivityIds.length > 0;
  const missingActivityIds = hasPersonalRoute ? [] : uniqueActivityIds;

  audit.push({
    id: record.id,
    slug: record.slug,
    date: record.date || record.startDate || null,
    name: record.name,
    kind: record.kind || record.recordClass || null,
    routeStatus: record.routeStatus || record.routeInfo?.status || null,
    activityIds: uniqueActivityIds,
    coveredActivityIds,
    coverageMode: explicitPersonalRoute ? 'record-routeFeatureIds' : (ownedPersonalRoute ? 'route-adventureIds' : (coveredActivityIds.length ? 'strava-activity-id' : null)),
    missingActivityIds,
    privacyWithheld,
  });
}

const actionableMissing = audit.filter(item => item.missingActivityIds.length && !item.privacyWithheld);
const intentionalPrivacy = audit.filter(item => item.missingActivityIds.length && item.privacyWithheld);
const fullyCovered = audit.filter(item => !item.missingActivityIds.length);

console.log(JSON.stringify({
  totalPublicRecords: records.length,
  recordsWithStrava: audit.length,
  recordsWithoutStrava: recordsWithoutStrava.length,
  fullyCovered: fullyCovered.length,
  actionableMissing: actionableMissing.length,
  intentionalPrivacy: intentionalPrivacy.length,
}, null, 2));

if (recordsWithoutStrava.length) {
  console.log('\nNO_STRAVA_LINK');
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
  console.log('\nEvery public record linked to Strava has its personal GPS route, except explicit privacy-withheld records.');
}
