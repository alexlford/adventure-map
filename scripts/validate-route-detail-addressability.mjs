import fs from 'node:fs';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const publicPayload = readJson('data/public-records.json');
const detailIndex = readJson('data/route-detail-index.json');
const records = publicPayload.records || [];
const sourcePayloads = new Map();

function featureId(feature) {
  return feature?.id || feature?.properties?.featureId || feature?.properties?.id || null;
}

function sourcePayload(entry) {
  const cacheKey = `${entry.format || 'auto'}:${entry.file}`;
  if (!sourcePayloads.has(cacheKey)) sourcePayloads.set(cacheKey, readJson(entry.file));
  return sourcePayloads.get(cacheKey);
}

function decodeComponent(encoded, state, label) {
  let result = 0;
  let shift = 0;
  let byte;
  do {
    if (state.index >= encoded.length) throw new Error(`truncated ${label}`);
    byte = encoded.charCodeAt(state.index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);
  return (result & 1) ? ~(result >> 1) : (result >> 1);
}

function decodePolyline(encoded) {
  if (typeof encoded !== 'string' || !encoded.length) throw new Error('empty encoded line');
  const state = { index: 0 };
  let lat = 0;
  let lon = 0;
  let points = 0;
  while (state.index < encoded.length) {
    const coordinateStart = state.index;
    try {
      lat += decodeComponent(encoded, state, 'latitude');
      lon += decodeComponent(encoded, state, 'longitude');
      const x = lon / 1e5;
      const y = lat / 1e5;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < -180 || x > 180 || y < -90 || y > 90) {
        throw new Error('out-of-range coordinate');
      }
      points += 1;
    } catch (error) {
      const trimEnd = encoded.length - coordinateStart;
      if (!points || trimEnd < 1 || trimEnd > 8 || state.index !== encoded.length) throw error;
      break;
    }
  }
  if (points < 2) throw new Error('fewer than two coordinates');
  return points;
}

function validateSelectedSource(entry) {
  const payload = sourcePayload(entry);
  const isGeoJson = entry.format === 'geojson' || String(entry.file).toLowerCase().endsWith('.geojson');
  if (isGeoJson) {
    const feature = (payload.features || []).find(item => featureId(item) === entry.featureId);
    if (!feature) return `detail feature ${entry.featureId} is missing from ${entry.file}`;
    const geometry = feature.geometry;
    const pointCount = geometry?.type === 'LineString'
      ? (geometry.coordinates || []).length
      : geometry?.type === 'MultiLineString'
        ? (geometry.coordinates || []).reduce((sum, line) => sum + (line?.length || 0), 0)
        : 0;
    if (pointCount < 2) return `detail feature ${entry.featureId} in ${entry.file} has no renderable line geometry`;
    return null;
  }

  const route = (payload.routes || []).find(item => item?.id === entry.featureId);
  if (!route) return `detail feature ${entry.featureId} is missing from ${entry.file}`;
  if (!Array.isArray(route.lines) || !route.lines.length) return `detail feature ${entry.featureId} in ${entry.file} has no encoded lines`;
  for (const line of route.lines) decodePolyline(line);
  return null;
}

const mapped = records.filter(record => Array.isArray(record.routeFeatureIds) && record.routeFeatureIds.length > 0);
const missing = mapped.filter(record => !detailIndex.records?.[record.id]);
const broken = mapped.flatMap(record => {
  const entry = detailIndex.records?.[record.id];
  if (!entry) return [];
  const errors = [];
  if (!entry.featureId) errors.push(`${record.id}: detail index entry has no featureId`);
  if (entry.featureId && !record.routeFeatureIds.includes(entry.featureId)) {
    errors.push(`${record.id}: detail feature ${entry.featureId} is not one of the record routeFeatureIds`);
  }
  if (!entry.file || !fs.existsSync(entry.file)) {
    errors.push(`${record.id}: detail source file is missing: ${entry.file || '(none)'}`);
  } else if (entry.featureId) {
    try {
      const sourceError = validateSelectedSource(entry);
      if (sourceError) errors.push(`${record.id}: ${sourceError}`);
    } catch (error) {
      errors.push(`${record.id}: detail source is not loadable: ${entry.file} (${error.message})`);
    }
  }
  return errors;
});

console.log(`Route detail addressability: ${mapped.length} mapped public records checked.`);
for (const record of missing) {
  const message = `${record.id}: mapped public record has no route detail index entry`;
  console.error(`::error file=data/route-detail-index.json::${message}`);
  console.error(`ERROR ${message}`);
}
for (const error of broken) {
  console.error(`::error file=data/route-detail-index.json::${error}`);
  console.error(`ERROR ${error}`);
}

if (missing.length || broken.length) process.exit(1);
console.log('Every mapped public record is addressable by an existing source containing loadable selected detail geometry.');
