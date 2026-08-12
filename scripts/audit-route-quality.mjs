import fs from 'node:fs';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const args = new Set(process.argv.slice(2));
const enforce = args.has('--enforce');
const idsOutArg = process.argv.find(arg => arg.startsWith('--ids-out='));
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
  if (String(id).startsWith('strava-') || String(id).startsWith('activity-')) return true;
  const source = `${p.source || ''} ${p.sourceLabel || ''}`.toLowerCase();
  return source.includes('strava') || source.includes('personal gps');
}
function sourceActivityIds(feature) {
  const p = feature.properties || {};
  const ids = new Set((p.sourceActivityIds || []).map(String));
  if (p.stravaActivityId != null) ids.add(String(p.stravaActivityId));
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
  const minimumPoints = Math.max(30, Math.ceil(lengthKm * 70));
  const highResolution = pointCount >= minimumPoints && avgSpacingM <= 15 && p95SpacingM <= 40 && maxSpacingM <= 200;
  const declaredHighResolutionSource = feature.properties?.density === 'high-resolution-source';
  const publishedPointCount = Number(feature.properties?.publishedPointCount);
  const pointMetadataMatches = !declaredHighResolutionSource || (Number.isFinite(publishedPointCount) && publishedPointCount === pointCount);
  // Some older source recordings were themselves sampled only every ~20-40 m. We preserve
  // every distinct recorded coordinate rather than fabricate interpolated GPS. Those tracks
  // are source-limited, not publication-limited, when the high-resolution archive metadata
  // exactly matches the geometry that was compiled.
  const sourceLimited = !highResolution && declaredHighResolutionSource && pointMetadataMatches;
  const acceptable = highResolution || sourceLimited;
  rows.push({
    id: featureId(feature),
    adventureIds: feature.properties?.adventureIds || [],
    sourceActivityIds: sourceActivityIds(feature),
    density: feature.properties?.density || null,
    lineCount: lines.length,
    pointCount,
    lengthKm: Number(lengthKm.toFixed(3)),
    pointsPerKm: Number(pointsPerKm.toFixed(1)),
    avgSpacingM: Number(avgSpacingM.toFixed(1)),
    p95SpacingM: Number(p95SpacingM.toFixed(1)),
    maxSpacingM: Number(maxSpacingM.toFixed(1)),
    minimumPoints,
    highResolution,
    sourceLimited,
    pointMetadataMatches,
    acceptable,
  });
}
rows.sort((a, b) => Number(a.acceptable) - Number(b.acceptable) || Number(a.highResolution) - Number(b.highResolution) || b.avgSpacingM - a.avgSpacingM || String(a.id).localeCompare(String(b.id)));
const unacceptable = rows.filter(row => !row.acceptable);
const metadataMismatch = rows.filter(row => !row.pointMetadataMatches);
const sourceLimited = rows.filter(row => row.sourceLimited);
const highResolution = rows.filter(row => row.highResolution);
const summary = {
  personalGpsRoutes: rows.length,
  highResolutionRoutes: highResolution.length,
  sourceLimitedRoutes: sourceLimited.length,
  unacceptableRoutes: unacceptable.length,
  metadataMismatches: metadataMismatch.length,
  pointCount: rows.reduce((sum, row) => sum + row.pointCount, 0),
  medianPointsPerKm: Number(percentile(rows.map(row => row.pointsPerKm), 0.5).toFixed(1)),
  medianAvgSpacingM: Number(percentile(rows.map(row => row.avgSpacingM), 0.5).toFixed(1)),
};
console.log(JSON.stringify(summary, null, 2));
console.log('\nGPS_ROUTE_QUALITY');
for (const row of rows) console.log(JSON.stringify(row));
if (idsOutArg) {
  const output = idsOutArg.slice('--ids-out='.length);
  const ids = [...new Set(rows.flatMap(row => row.sourceActivityIds).filter(Boolean).map(String))].sort((a, b) => Number(a) - Number(b));
  fs.writeFileSync(output, `${ids.join('\n')}\n`);
  console.log(`\nWrote ${ids.length} published Strava activity IDs to ${output}.`);
}
if (unacceptable.length || metadataMismatch.length) {
  console.log(`\nRoute quality failed: ${unacceptable.length} unacceptable route(s), ${metadataMismatch.length} metadata mismatch(es).`);
  if (enforce) process.exitCode = 1;
} else {
  console.log(`\nEvery personal GPS route is either high-resolution or published at the full distinct-point density available in its source recording. ${sourceLimited.length} route(s) are source-limited and are not artificially interpolated.`);
}
