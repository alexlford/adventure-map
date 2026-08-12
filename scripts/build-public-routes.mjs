import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const output = path.resolve(root, outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : 'tmp/public-routes.geojson');
const readText = rel => fs.readFile(path.join(root, rel), 'utf8');
const fingerprint = values => crypto.createHash('sha256').update(values.join('\n')).digest('hex').slice(0,16);

const catalogText = await readText('data/route-catalog.json');
const catalog = JSON.parse(catalogText);
const relationshipsText = await readText('data/relationships.json');
const relationships = JSON.parse(relationshipsText).relationships || [];
const sourceTexts = [catalogText, relationshipsText];
const features = [];
const featureIndexById = new Map();
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

function featurePriority(feature) {
  const props = feature.properties || {};
  if (props.density === 'dense') return 30;
  if (props.provenance === 'personal-gps') return 20;
  if (props.provenance === 'historical-course') return 10;
  return 0;
}

function unionAdventureIds(a, b) {
  return [...new Set([...(a || []), ...(b || [])])];
}

function addFeature(feature) {
  const normalized = normalizeFeature(feature);
  const id = featureId(normalized);
  if (!id) {
    features.push(normalized);
    return;
  }
  const existingIndex = featureIndexById.get(id);
  if (existingIndex === undefined) {
    featureIndexById.set(id, features.length);
    features.push(normalized);
    return;
  }
  const current = features[existingIndex];
  const adventureIds = unionAdventureIds(current.properties?.adventureIds, normalized.properties?.adventureIds);
  const preferred = featurePriority(normalized) > featurePriority(current) ? normalized : current;
  features[existingIndex] = {
    ...preferred,
    properties: { ...(preferred.properties || {}), adventureIds }
  };
}

function expandCombinedStoryIds(feature) {
  const ids = new Set(feature.properties?.adventureIds || []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const rel of relationships) {
      if (!rel.adventureId || ids.has(rel.adventureId)) continue;
      if ((rel.memberIds || []).some(id => ids.has(id))) {
        ids.add(rel.adventureId);
        changed = true;
      }
    }
  }
  feature.properties = { ...(feature.properties || {}), adventureIds: [...ids] };
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

for (const routeFile of catalog.routeFiles || []) {
  const text = await readText(routeFile);
  sourceTexts.push(text);
  const collection = JSON.parse(text);
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error(`${routeFile}: expected FeatureCollection`);
  for (const feature of collection.features) addFeature(feature);
}

const polylineFiles = catalog.polylineFiles?.length ? catalog.polylineFiles : ['data/activity-route-polylines.json'];
for (const polylineFile of polylineFiles) {
  const text = await readText(polylineFile);
  sourceTexts.push(text);
  const payload = JSON.parse(text);
  for (const route of payload.routes || []) {
    if (!route.id) throw new Error(`${polylineFile}: encoded route missing id`);
    if (!Array.isArray(route.lines) || !route.lines.length) throw new Error(`${route.id}: encoded route has no lines`);
    const lines = route.lines.map((line, lineIndex) => decodePolyline(line, { routeId: route.id, lineIndex }));
    const activityIds = (route.activityIds || []).map(String);
    addFeature({
      type: 'Feature',
      id: route.id,
      properties: {
        featureId: route.id,
        adventureIds: route.adventureIds || [],
        provenance: 'personal-gps',
        category: route.category,
        source: 'Strava GPS export',
        density: route.density || null,
        mtbMode: route.mtbMode || null,
        stravaActivityIds: activityIds,
        stravaActivityId: activityIds.length === 1 ? activityIds[0] : null,
      },
      geometry: lines.length === 1
        ? { type: 'LineString', coordinates: lines[0] }
        : { type: 'MultiLineString', coordinates: lines },
    });
  }
}

for (const feature of features) expandCombinedStoryIds(feature);

const payload = {
  type: 'FeatureCollection',
  metadata: {
    schemaVersion: 2,
    sourceFingerprint: fingerprint(sourceTexts),
    featureCount: features.length,
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