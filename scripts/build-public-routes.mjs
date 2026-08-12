import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const output = path.resolve(root, outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : 'tmp/public-routes.geojson');
const readText = rel => fs.readFile(path.join(root, rel), 'utf8');
const fingerprint = values => crypto.createHash('sha256').update(values.join('\n')).digest('hex').slice(0,16);

const catalogText = await readText('data/route-catalog.json');
const catalog = JSON.parse(catalogText);
const sourceTexts = [catalogText];
const features = [];
const seenIds = new Set();
const repairs = [];

function featureId(feature) {
  return feature.id || feature.properties?.featureId || feature.properties?.id || null;
}

function inferProvenance(feature) {
  const props = feature.properties || {};
  const source = `${props.source || ''} ${props.routeType || ''}`.toLowerCase();
  if (source.includes('historical') || source.includes('official') || source.includes('published')) return 'historical-course';
  if (props.stravaActivityId || source.includes('strava') || feature.id?.startsWith('strava-')) return 'personal-gps';
  return 'personal-gps';
}

function normalizeFeature(feature) {
  const id = featureId(feature);
  const override = id ? catalog.featureOverrides?.[id] : null;
  const properties = { ...(feature.properties || {}), ...(override || {}) };
  properties.provenance ||= inferProvenance({ ...feature, properties });
  return { ...feature, properties };
}

function addFeature(feature) {
  const normalized = normalizeFeature(feature);
  const id = featureId(normalized);
  if (id && seenIds.has(id)) return false;
  if (id) seenIds.add(id);
  features.push(normalized);
  return true;
}

function decodeComponent(encoded, state, label) {
  let result = 0;
  let shift = 0;
  let b;
  do {
    if (state.index >= encoded.length) throw new Error(`truncated ${label}`);
    b = encoded.charCodeAt(state.index++) - 63;
    result |= (b & 0x1f) << shift;
    shift += 5;
  } while (b >= 0x20);
  return (result & 1) ? ~(result >> 1) : (result >> 1);
}

function decodePolyline(encoded, context) {
  const state = { index: 0 };
  let lat = 0;
  let lon = 0;
  const coordinates = [];
  while (state.index < encoded.length) {
    const coordinateStart = state.index;
    try {
      lat += decodeComponent(encoded, state, 'latitude');
      lon += decodeComponent(encoded, state, 'longitude');
      coordinates.push([lon / 1e5, lat / 1e5]);
    } catch (error) {
      const trimEnd = encoded.length - coordinateStart;
      if (!coordinates.length || trimEnd < 1 || trimEnd > 8 || state.index !== encoded.length) throw error;
      repairs.push({ ...context, trimEnd, reason: error.message });
      break;
    }
  }
  if (coordinates.length < 2) throw new Error(`${context.routeId} line ${context.lineIndex} decodes to fewer than two coordinates`);
  for (const [lonValue, latValue] of coordinates) {
    if (!Number.isFinite(latValue) || latValue < -90 || latValue > 90 || !Number.isFinite(lonValue) || lonValue < -180 || lonValue > 180) {
      throw new Error(`${context.routeId} line ${context.lineIndex} contains an out-of-range coordinate`);
    }
  }
  return coordinates;
}

async function readPolylinePayload(polylineFile) {
  const text = await readText(polylineFile);
  sourceTexts.push(text);
  if (polylineFile.endsWith('.gz.b64')) {
    const json = zlib.gunzipSync(Buffer.from(text.trim(), 'base64')).toString('utf8');
    return JSON.parse(json);
  }
  return JSON.parse(text);
}

async function addPolylineFile(polylineFile) {
  const payload = await readPolylinePayload(polylineFile);
  for (const route of payload.routes || []) {
    if (!route.id) throw new Error(`${polylineFile}: encoded route missing id`);
    // Preferred high-resolution sources are compiled first. Skip a duplicate route
    // before decoding its legacy geometry so the older simplified copy cannot win.
    if (seenIds.has(route.id)) continue;
    if (!Array.isArray(route.lines) || !route.lines.length) throw new Error(`${route.id}: encoded route has no lines`);
    const lines = route.lines.map((line, lineIndex) => decodePolyline(line, { routeId: route.id, lineIndex }));
    addFeature({
      type: 'Feature',
      id: route.id,
      properties: {
        featureId: route.id,
        adventureIds: route.adventureIds || [],
        provenance: 'personal-gps',
        category: route.category,
        source: payload.source || 'Strava GPS export',
        mtbMode: route.mtbMode || null,
        stravaActivityId: route.stravaActivityId || null,
        sourceActivityIds: route.sourceActivityIds || route.activityIds || [],
        density: route.density || payload.quality?.mode || null,
        sourcePointCount: route.sourcePointCount || null,
        publishedPointCount: route.publishedPointCount || null,
        splitGapMeters: route.splitGapMeters || payload.quality?.splitGapMeters || null,
      },
      geometry: lines.length === 1
        ? { type: 'LineString', coordinates: lines[0] }
        : { type: 'MultiLineString', coordinates: lines },
    });
  }
}

const preferredPolylineFiles = catalog.preferredPolylineFiles || [];
for (const polylineFile of preferredPolylineFiles) await addPolylineFile(polylineFile);

for (const routeFile of catalog.routeFiles || []) {
  const text = await readText(routeFile);
  sourceTexts.push(text);
  const collection = JSON.parse(text);
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error(`${routeFile}: expected FeatureCollection`);
  for (const feature of collection.features) addFeature(feature);
}

const polylineFiles = catalog.polylineFiles?.length ? catalog.polylineFiles : ['data/activity-route-polylines.json'];
for (const polylineFile of polylineFiles) await addPolylineFile(polylineFile);

const payload = {
  type: 'FeatureCollection',
  metadata: {
    schemaVersion: 1,
    sourceFingerprint: fingerprint(sourceTexts),
    featureCount: features.length,
    sourcePreferredPolylineFiles: preferredPolylineFiles,
    sourceRouteFiles: catalog.routeFiles || [],
    sourcePolylineFiles: polylineFiles,
    repairs,
    recordOverrides: catalog.recordOverrides || {},
  },
  features,
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(payload)}\n`);
console.log(`Compiled ${features.length} public route features.`);
console.log(`Recovered ${repairs.length} incomplete encoded-polyline tails.`);
for (const repair of repairs) console.log(`REPAIR ${repair.routeId} line ${repair.lineIndex}: trim ${repair.trimEnd} (${repair.reason})`);
console.log(`Public routes: ${path.relative(root, output)}`);
