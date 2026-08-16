import fs from 'node:fs';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const publicPayload = readJson('data/public-records.json');
const detailIndex = readJson('data/route-detail-index.json');
const records = publicPayload.records || [];
const sourceCache = new Map();

function decodeComponent(encoded, state, label) {
  let result = 0;
  let shift = 0;
  let b;
  do {
    if (state.index >= encoded.length) throw new Error(`Truncated ${label}`);
    b = encoded.charCodeAt(state.index++) - 63;
    result |= (b & 0x1f) << shift;
    shift += 5;
  } while (b >= 0x20);
  return (result & 1) ? ~(result >> 1) : (result >> 1);
}

function decodePolyline(encoded) {
  if (typeof encoded !== 'string' || !encoded.length) throw new Error('encoded line is empty or not a string');
  const state = { index: 0 };
  let lat = 0;
  let lon = 0;
  const coordinates = [];
  while (state.index < encoded.length) {
    const coordinateStart = state.index;
    try {
      lat += decodeComponent(encoded, state, 'latitude');
      lon += decodeComponent(encoded, state, 'longitude');
      const point = [lon / 1e5, lat / 1e5];
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90) {
        throw new Error('encoded route contains an out-of-range coordinate');
      }
      coordinates.push(point);
    } catch (error) {
      const trimEnd = encoded.length - coordinateStart;
      if (!coordinates.length || trimEnd < 1 || trimEnd > 8 || state.index !== encoded.length) throw error;
      break;
    }
  }
  if (coordinates.length < 2) throw new Error('encoded route contains fewer than two coordinates');
  return coordinates.length;
}

function loadSource(path) {
  if (!sourceCache.has(path)) sourceCache.set(path, readJson(path));
  return sourceCache.get(path);
}

function validatePolylineEntry(recordId, entry, payload) {
  const route = (payload.routes || []).find(candidate => candidate?.id === entry.featureId);
  if (!route) return [`${recordId}: polyline source ${entry.file} does not contain feature ${entry.featureId}`];
  if (!Array.isArray(route.lines) || !route.lines.length) {
    return [`${recordId}: polyline feature ${entry.featureId} in ${entry.file} is not browser-loadable (missing plain lines array)`];
  }
  const errors = [];
  route.lines.forEach((line, index) => {
    try {
      decodePolyline(line);
    } catch (error) {
      errors.push(`${recordId}: polyline feature ${entry.featureId} line ${index + 1} in ${entry.file} is invalid: ${error.message}`);
    }
  });
  return errors;
}

function featureKey(feature) {
  return feature?.id || feature?.properties?.featureId || feature?.properties?.id || null;
}

function geometryLines(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates || []];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates || [];
  return [];
}

function validateGeoJsonEntry(recordId, entry, payload) {
  const feature = (payload.features || []).find(candidate => featureKey(candidate) === entry.featureId);
  if (!feature) return [`${recordId}: GeoJSON source ${entry.file} does not contain feature ${entry.featureId}`];
  const lines = geometryLines(feature.geometry);
  if (!lines.length || lines.every(line => !Array.isArray(line) || line.length < 2)) {
    return [`${recordId}: GeoJSON feature ${entry.featureId} in ${entry.file} has no renderable line geometry`];
  }
  const invalid = lines.some(line => !Array.isArray(line) || line.length < 2 || line.some(point =>
    !Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
    point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90
  ));
  return invalid ? [`${recordId}: GeoJSON feature ${entry.featureId} in ${entry.file} contains invalid line coordinates`] : [];
}

function validateLoadableEntry(recordId, entry) {
  if (!entry.file || !fs.existsSync(entry.file)) return [];
  let payload;
  try {
    payload = loadSource(entry.file);
  } catch (error) {
    return [`${recordId}: detail source ${entry.file} cannot be parsed as JSON: ${error.message}`];
  }
  if (entry.format === 'polyline') return validatePolylineEntry(recordId, entry, payload);
  if (entry.format === 'geojson') return validateGeoJsonEntry(recordId, entry, payload);
  return [`${recordId}: unsupported detail source format ${entry.format || '(none)'} for ${entry.file}`];
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
    errors.push(...validateLoadableEntry(record.id, entry));
  }
  return errors;
});

console.log(`Route detail addressability: ${mapped.length} mapped public records checked.`);
for (const record of missing) {
  console.error(`ERROR ${record.id}: mapped public record has no route detail index entry`);
}
for (const error of broken) console.error(`ERROR ${error}`);

if (missing.length || broken.length) process.exit(1);
console.log('Every mapped public record resolves to an existing, matching, runtime-loadable route detail feature.');