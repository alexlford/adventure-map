import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
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
const featureIndexById = new Map();
const repairs = [];
const duplicateSelections = [];

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

function geometryPointCount(feature) {
  const geometry = feature.geometry;
  if (!geometry) return 0;
  if (geometry.type === 'LineString') return geometry.coordinates?.length || 0;
  if (geometry.type === 'MultiLineString') return (geometry.coordinates || []).reduce((sum, line) => sum + (line?.length || 0), 0);
  return 0;
}

function publicationRank(feature) {
  return feature?.properties?.publicationSelected === true ? 1 : 0;
}

function mergePreferredGpsFeature(existing, candidate) {
  const existingProps = existing.properties || {};
  const candidateProps = candidate.properties || {};
  const adventureIds = [...new Set([...(existingProps.adventureIds || []), ...(candidateProps.adventureIds || [])])];
  return {
    ...candidate,
    properties: {
      ...existingProps,
      ...candidateProps,
      adventureIds,
      category: candidateProps.category ?? existingProps.category,
      mtbMode: candidateProps.mtbMode ?? existingProps.mtbMode ?? null,
    },
  };
}

function addFeature(feature, sourceFile = null) {
  const normalized = normalizeFeature(feature);
  const id = featureId(normalized);
  if (!id) {
    features.push(normalized);
    return;
  }

  const existingIndex = featureIndexById.get(id);
  if (existingIndex == null) {
    featureIndexById.set(id, features.length);
    features.push(normalized);
    return;
  }

  const existing = features[existingIndex];
  const existingPoints = geometryPointCount(existing);
  const candidatePoints = geometryPointCount(normalized);
  const existingRank = publicationRank(existing);
  const candidateRank = publicationRank(normalized);
  const bothPersonalGps = existing.properties?.provenance === 'personal-gps' && normalized.properties?.provenance === 'personal-gps';

  // Reviewed publication geometry wins before density. Point count remains a
  // compatibility fallback for legacy personal-GPS duplicates that have not yet
  // been reviewed under the reconstruction policy.
  if (bothPersonalGps && (candidateRank > existingRank || (candidateRank === existingRank && candidatePoints > existingPoints))) {
    features[existingIndex] = mergePreferredGpsFeature(existing, normalized);
    duplicateSelections.push({
      id,
      reason: candidateRank > existingRank ? 'reviewed-publication' : 'denser-legacy-gps',
      replacedPointCount: existingPoints,
      selectedPointCount: candidatePoints,
      selectedSourceFile: sourceFile,
    });
  }
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
  for (const feature of collection.features) addFeature(feature, routeFile);
}

const polylineFiles = catalog.polylineFiles?.length ? catalog.polylineFiles : ['data/activity-route-polylines.json'];
for (const polylineFile of polylineFiles) {
  const text = await readText(polylineFile);
  sourceTexts.push(text);
  const payload = JSON.parse(text);
  for (const route of payload.routes || []) {
    if (!route.id) throw new Error(`${polylineFile}: encoded route missing id`);
    let encodedLines = Array.isArray(route.lines) && route.lines.length
      ? route.lines
      : (route.linesBase64 || []).map(value => Buffer.from(value, 'base64').toString('utf8'));
    if (!encodedLines.length && Array.isArray(route.linesBrotliBase64)) {
      encodedLines = route.linesBrotliBase64.map(value => brotliDecompressSync(Buffer.from(value, 'base64')).toString('utf8'));
    }
    if (!encodedLines.length) throw new Error(`${route.id}: encoded route has no lines`);
    const lines = encodedLines.map((line, lineIndex) => decodePolyline(line, { routeId: route.id, lineIndex }));
    const sourceActivityIds = Array.isArray(route.stravaActivityIds)
      ? route.stravaActivityIds.map(String)
      : route.stravaActivityId != null ? [String(route.stravaActivityId)] : [];
    addFeature({
      type: 'Feature',
      id: route.id,
      properties: {
        featureId: route.id,
        adventureIds: route.adventureIds || [],
        provenance: 'personal-gps',
        category: route.category,
        source: 'Strava GPS export',
        mtbMode: route.mtbMode || null,
        stravaActivityId: sourceActivityIds.length === 1 ? sourceActivityIds[0] : null,
        stravaActivityIds: sourceActivityIds,
        routeResolution: route.sampling || payload.sampling || null,
        sourcePointCount: route.sourcePointCount || null,
        geometryClass: route.geometryClass || payload.geometryClass || null,
        geometryEvidence: route.geometryEvidence || 'recorded',
        publicationSelected: route.publicationSelected === true,
      },
      geometry: lines.length === 1
        ? { type: 'LineString', coordinates: lines[0] }
        : { type: 'MultiLineString', coordinates: lines },
    }, polylineFile);
  }
}

const payload = {
  type: 'FeatureCollection',
  metadata: {
    schemaVersion: 1,
    sourceFingerprint: fingerprint(sourceTexts),
    featureCount: features.length,
    sourceRouteFiles: catalog.routeFiles || [],
    sourcePolylineFiles: polylineFiles,
    repairs,
    duplicateSelections,
    recordOverrides: catalog.recordOverrides || {},
  },
  features,
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(payload)}\n`);
console.log(`Compiled ${features.length} public route features.`);
console.log(`Recovered ${repairs.length} incomplete encoded-polyline tails.`);
console.log(`Selected ${duplicateSelections.length} preferred duplicate GPS geometries.`);
for (const repair of repairs) console.log(`REPAIR ${repair.routeId} line ${repair.lineIndex}: trim ${repair.trimEnd} (${repair.reason})`);
for (const selection of duplicateSelections) console.log(`SELECT ${selection.id}: ${selection.reason}, ${selection.replacedPointCount} -> ${selection.selectedPointCount} points (${selection.selectedSourceFile})`);
console.log(`Public routes: ${path.relative(root, output)}`);