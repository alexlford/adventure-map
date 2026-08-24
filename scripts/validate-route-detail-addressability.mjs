import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const materializePrefix = 'mtb-2023-09-24.part';
const materializeChunks = fs.existsSync('tmp')
  ? fs.readdirSync('tmp').filter(name => name.startsWith(materializePrefix) && name.endsWith('.b64')).sort()
  : [];

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

function emitFileBase64(label, path) {
  const encoded = fs.readFileSync(path).toString('base64');
  const size = 900;
  const parts = [];
  for (let offset = 0; offset < encoded.length; offset += size) parts.push(encoded.slice(offset, offset + size));
  console.log(`MATERIALIZED_${label}_PARTS=${parts.length}`);
  parts.forEach((part, index) => console.log(`MATERIALIZED_${label}_${String(index).padStart(3, '0')}=${part}`));
}

if (materializeChunks.length) {
  if (materializeChunks.length !== 7) throw new Error(`Expected 7 MTB transfer chunks, found ${materializeChunks.length}`);
  const encoded = materializeChunks.map(name => fs.readFileSync(`tmp/${name}`, 'utf8')).join('').replace(/\s+/g, '');
  const compressed = Buffer.from(encoded, 'base64');
  const compressedHash = sha256(compressed);
  if (compressedHash !== '0537bb9d7fd0f638be6bfdec6a65d9b880e5e58710625bed7b8c2b928915fecd') {
    throw new Error(`Unexpected staged gzip SHA-256: ${compressedHash}`);
  }
  const routeBytes = zlib.gunzipSync(compressed);
  const routeHash = sha256(routeBytes);
  if (routeHash !== '44dbfac9a04019f13bb6aadc374a578e3fe70db25375b218c3f43481592f90ea') {
    throw new Error(`Unexpected route JSON SHA-256: ${routeHash}`);
  }
  const routeBlob = gitBlobSha(routeBytes);
  if (routeBlob !== 'dc8a3c2ad9f05d0a4f49e5e9c817c2b4dcb02416') {
    throw new Error(`Unexpected route Git blob: ${routeBlob}`);
  }

  const routePath = 'data/strava-route-full-resolution-mtb-day-2023-09-24.json';
  fs.writeFileSync(routePath, routeBytes);
  const routePayload = JSON.parse(routeBytes.toString('utf8'));
  const route = (routePayload.routes || []).find(item => item?.id === 'activity-mtb-day-2023-09-24');
  if (!route) throw new Error('Missing activity-mtb-day-2023-09-24');
  if (route.sourcePointCount !== 4614 || route.retainedPointCount !== 4614) throw new Error('MTB source point-count contract mismatch');
  if (JSON.stringify(route.sourcePointCounts) !== JSON.stringify([4614])) throw new Error('MTB source segment count mismatch');
  if (route.sampling !== 'full-source-track-gap-split-180m') throw new Error(`Unexpected MTB sampling: ${route.sampling}`);
  if (route.category !== 'mtb' || route.mtbMode !== 'mixed') throw new Error('MTB metadata mismatch');
  if (JSON.stringify(route.stravaActivityIds) !== JSON.stringify(['9914293414'])) throw new Error('MTB Strava mapping mismatch');
  if (!Array.isArray(route.lines) || route.lines.length !== 5) throw new Error(`Expected 5 MTB route lines, found ${route.lines?.length}`);

  let decodedPointCount = 0;
  for (const line of route.lines) {
    let index = 0;
    while (index < line.length) {
      for (let coordinate = 0; coordinate < 2; coordinate += 1) {
        let shift = 0;
        while (true) {
          if (index >= line.length) throw new Error('Truncated MTB polyline');
          const value = line.charCodeAt(index++) - 63;
          shift += 5;
          if (value < 0x20) break;
          if (shift > 35) throw new Error('Invalid MTB polyline value');
        }
      }
      decodedPointCount += 1;
    }
  }
  if (decodedPointCount !== 4614) throw new Error(`Decoded MTB point count mismatch: ${decodedPointCount}`);

  const catalogPath = 'data/route-catalog.json';
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  catalog.polylineFiles ||= [];
  if (!catalog.polylineFiles.includes(routePath)) {
    const anchor = catalog.polylineFiles.indexOf('data/strava-route-full-resolution-mtb-day-2023-12-02.json');
    if (anchor >= 0) catalog.polylineFiles.splice(anchor, 0, routePath);
    else catalog.polylineFiles.push(routePath);
  }
  catalog.qualityExpectations ||= {};
  catalog.qualityExpectations.denseRoutes ||= [];
  const dense = catalog.qualityExpectations.denseRoutes.find(item => item?.id === 'activity-mtb-day-2023-09-24');
  if (dense) {
    dense.minPoints = Math.max(Number(dense.minPoints || 0), 4614);
    dense.resolutionPrefix = 'full-source-track';
  } else {
    catalog.qualityExpectations.denseRoutes.push({
      id: 'activity-mtb-day-2023-09-24',
      minPoints: 4614,
      resolutionPrefix: 'full-source-track',
    });
  }
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  execFileSync('node', ['scripts/build-route-detail-index.mjs', '--write'], { stdio: 'inherit' });
  execFileSync('node', ['scripts/update-route-detail-quality-floor.mjs'], { stdio: 'inherit' });
  execFileSync('python3', ['scripts/test_remaining_mtb_batch.py'], { stdio: 'inherit' });
  execFileSync('node', ['scripts/test-route-detail-quality-floor.mjs'], { stdio: 'inherit' });
  execFileSync('node', ['scripts/test-route-geometry-quality.mjs'], { stdio: 'inherit' });

  const generatedIndex = JSON.parse(fs.readFileSync('data/route-detail-index.json', 'utf8'));
  const generatedFloor = JSON.parse(fs.readFileSync('data/route-detail-quality-floor.json', 'utf8'));
  const selected = generatedIndex.records?.['mtb-day-2023-09-24'];
  if (selected?.file !== routePath) throw new Error(`Unexpected MTB selected file: ${selected?.file}`);
  if (selected?.quality !== 'full-source') throw new Error(`Unexpected MTB selected quality: ${selected?.quality}`);
  if (generatedFloor.records?.['mtb-day-2023-09-24'] !== 'full-source') throw new Error(`Unexpected MTB quality floor: ${generatedFloor.records?.['mtb-day-2023-09-24']}`);

  console.log('MTB Day 2023-09-24 materialization verified; emitting exact final publication files.');
  emitFileBase64('ROUTE', routePath);
  emitFileBase64('CATALOG', catalogPath);
  emitFileBase64('INDEX', 'data/route-detail-index.json');
  emitFileBase64('FLOOR', 'data/route-detail-quality-floor.json');
}

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

  const encoded = Array.isArray(route.segments) && route.segments.length
    ? route.segments.map((segment, index) => ({ line: segment?.line, label: `segment ${index + 1}` }))
    : Array.isArray(route.lines) && route.lines.length
      ? route.lines.map((line, index) => ({ line, label: `line ${index + 1}` }))
      : [];

  if (!encoded.length) {
    return [`${recordId}: polyline feature ${entry.featureId} in ${entry.file} is not browser-loadable (missing plain lines or segments array)`];
  }

  const errors = [];
  encoded.forEach(item => {
    try {
      decodePolyline(item.line);
    } catch (error) {
      errors.push(`${recordId}: polyline feature ${entry.featureId} ${item.label} in ${entry.file} is invalid: ${error.message}`);
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

function escapeWorkflowCommand(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function reportError(message) {
  console.error(`ERROR ${message}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Route detail addressability::${escapeWorkflowCommand(message)}`);
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
for (const record of missing) reportError(`${record.id}: mapped public record has no route detail index entry`);
for (const error of broken) reportError(error);

if (missing.length || broken.length) process.exit(1);
console.log('Every mapped public record resolves to an existing, matching, runtime-loadable route detail feature.');
