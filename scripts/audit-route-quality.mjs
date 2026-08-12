import fs from 'node:fs';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const args = new Set(process.argv.slice(2));
const failOnLowQuality = args.has('--enforce');
const routes = readJson('tmp/public-routes.geojson');
const recordsPayload = readJson('data/public-records.json');
const records = recordsPayload.records || recordsPayload;
const recordsById = new Map(records.map(record => [String(record.id), record]));

const rad = value => value * Math.PI / 180;
function haversine(a, b) {
  const lat1 = rad(a[1]);
  const lat2 = rad(b[1]);
  const dLat = lat2 - lat1;
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}
function featureId(feature) {
  return feature.id || feature.properties?.featureId || feature.properties?.id || null;
}
function linesFor(feature) {
  if (feature.geometry?.type === 'LineString') return [feature.geometry.coordinates || []];
  if (feature.geometry?.type === 'MultiLineString') return feature.geometry.coordinates || [];
  return [];
}
function isPersonalGps(feature) {
  const id = featureId(feature) || '';
  const p = feature.properties || {};
  if (p.provenance === 'personal-gps') return true;
  if (p.stravaActivityId != null) return true;
  if (Array.isArray(p.stravaActivityIds) && p.stravaActivityIds.length) return true;
  if (String(id).startsWith('strava-') || String(id).startsWith('activity-')) return true;
  const source = `${p.source || ''} ${p.sourceLabel || ''}`.toLowerCase();
  return source.includes('strava') || source.includes('personal gps');
}
function sourceActivityIds(feature) {
  const p = feature.properties || {};
  const ids = new Set();
  if (p.stravaActivityId != null) ids.add(String(p.stravaActivityId));
  for (const activityId of p.stravaActivityIds || []) ids.add(String(activityId));
  const id = String(featureId(feature) || '');
  if (/^strava-\d+$/.test(id)) ids.add(id.slice(7));
  for (const adventureId of p.adventureIds || []) {
    const record = recordsById.get(String(adventureId));
    if (!record) continue;
    for (const activityId of record.stravaActivityIds || []) ids.add(String(activityId));
    if (record.stravaActivityId != null) ids.add(String(record.stravaActivityId));
  }
  return [...ids];
}

const rows = [];
for (const feature of routes.features || []) {
  if (!isPersonalGps(feature)) continue;
  const lines = linesFor(feature).filter(line => line.length >= 2);
  if (!lines.length) continue;
  const spacings = [];
  let pointCount = 0;
  let lengthM = 0;
  for (const line of lines) {
    pointCount += line.length;
    for (let i = 1; i < line.length; i += 1) {
      const d = haversine(line[i - 1], line[i]);
      if (!Number.isFinite(d)) continue;
      spacings.push(d);
      lengthM += d;
    }
  }
  const segments = spacings.length;
  const avgSpacingM = segments ? lengthM / segments : 0;
  const p95SpacingM = percentile(spacings, 0.95);
  const maxSpacingM = spacings.length ? Math.max(...spacings) : 0;
  const lengthKm = lengthM / 1000;
  const pointsPerKm = lengthKm > 0 ? pointCount / lengthKm : pointCount;
  // A zoomable GPS line should retain roughly one real sample every 10-15 m on average,
  // with very few gaps above 40 m. Short routes still need enough points to preserve bends.
  const minimumPoints = Math.max(30, Math.ceil(lengthKm * 70));
  const highQuality = pointCount >= minimumPoints && avgSpacingM <= 15 && p95SpacingM <= 40 && maxSpacingM <= 200;
  rows.push({
    id: featureId(feature),
    adventureIds: feature.properties?.adventureIds || [],
    sourceActivityIds: sourceActivityIds(feature),
    lineCount: lines.length,
    pointCount,
    lengthKm: Number(lengthKm.toFixed(3)),
    pointsPerKm: Number(pointsPerKm.toFixed(1)),
    avgSpacingM: Number(avgSpacingM.toFixed(1)),
    p95SpacingM: Number(p95SpacingM.toFixed(1)),
    maxSpacingM: Number(maxSpacingM.toFixed(1)),
    minimumPoints,
    highQuality,
  });
}
rows.sort((a, b) => Number(a.highQuality) - Number(b.highQuality) || b.avgSpacingM - a.avgSpacingM || String(a.id).localeCompare(String(b.id)));
const low = rows.filter(row => !row.highQuality);
const summary = {
  personalGpsRoutes: rows.length,
  highQualityRoutes: rows.length - low.length,
  lowQualityRoutes: low.length,
  pointCount: rows.reduce((sum, row) => sum + row.pointCount, 0),
  medianPointsPerKm: Number(percentile(rows.map(row => row.pointsPerKm), 0.5).toFixed(1)),
  medianAvgSpacingM: Number(percentile(rows.map(row => row.avgSpacingM), 0.5).toFixed(1)),
};
console.log(JSON.stringify(summary, null, 2));
console.log('\nGPS_ROUTE_QUALITY');
for (const row of rows) console.log(JSON.stringify(row));
const manifest = rows.map(row => ({ id: row.id, adventureIds: row.adventureIds, sourceActivityIds: row.sourceActivityIds }));
console.log('\nROUTE_SOURCE_MANIFEST_B64');
console.log(Buffer.from(JSON.stringify(manifest), 'utf8').toString('base64'));
if (low.length) {
  console.log(`\n${low.length} GPS route(s) are below the high-resolution zoom target.`);
  if (failOnLowQuality) process.exitCode = 1;
} else {
  console.log('\nEvery personal GPS route meets the high-resolution zoom target.');
}
