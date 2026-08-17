import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../', import.meta.url).pathname);
const INDEX_PATH = resolve(ROOT, 'data/route-detail-index.json');

const readJson = async path => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));

function geometryPointCount(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type === 'LineString') return (geometry.coordinates || []).length;
  if (geometry?.type === 'MultiLineString') return (geometry.coordinates || []).reduce((sum, line) => sum + (line || []).length, 0);
  return 0;
}

function detailScore(path, route, payload) {
  const file = path.toLowerCase();
  const density = String(route.density || route.routeResolution || payload.sampling || '').toLowerCase();
  if (file.includes('full-resolution') || density.includes('full-source') || density.includes('dense-source')) return 500;
  if (file.includes('rdp3') || density.includes('rdp-3m')) return 400;
  if (file.includes('story-route')) return 350;
  if (file.includes('backfill')) return 250;
  if (file.includes('activity-route-polylines')) return 150;
  return 200;
}

function qualityFor(score) {
  if (score >= 500) return 'full-source';
  if (score >= 400) return 'rdp-3m';
  if (score >= 350) return 'story-detail';
  if (score >= 250) return 'backfill';
  if (score <= 150) return 'activity-overview';
  return 'catalog-detail';
}

function candidateFor(path, route, payload, format, publishedPointCount = 0) {
  const score = detailScore(path, route, payload);
  return {
    file: path,
    featureId: route.id || route.featureId,
    format,
    score,
    quality: qualityFor(score),
    publishedPointCount: Number.isFinite(route.publishedPointCount) ? route.publishedPointCount
      : Number.isFinite(route.retainedPointCount) ? route.retainedPointCount
      : publishedPointCount,
    sourcePointCount: Number.isFinite(route.sourcePointCount) ? route.sourcePointCount : 0,
  };
}

function compareCandidates(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.publishedPointCount !== a.publishedPointCount) return b.publishedPointCount - a.publishedPointCount;
  if (b.sourcePointCount !== a.sourcePointCount) return b.sourcePointCount - a.sourcePointCount;
  return a.file.localeCompare(b.file) || a.featureId.localeCompare(b.featureId);
}

function publicCandidate(candidate) {
  return { file: candidate.file, featureId: candidate.featureId, format: candidate.format, quality: candidate.quality };
}

function publicRecordIds(payload) {
  const records = Array.isArray(payload) ? payload : payload?.records || [];
  const ids = new Set(records.map(record => String(record?.id || '')).filter(Boolean));
  if (!ids.size) throw new Error('Public record catalog is empty or invalid');
  return ids;
}

function ownerIds(route) {
  return [...new Set((Array.isArray(route?.adventureIds) ? route.adventureIds : []).map(String).filter(Boolean))];
}

function consider(records, publicIds, route, candidate) {
  const owners = ownerIds(route);
  if (!candidate.featureId || !owners.length) return;
  for (const adventureId of owners) {
    if (!publicIds.has(adventureId)) continue;
    const prior = records.get(adventureId);
    if (!prior || compareCandidates(candidate, prior) < 0) records.set(adventureId, candidate);
  }
}

function rememberFeatureOwners(ownerMap, featureId, owners) {
  if (!featureId || !owners.length) return;
  const prior = ownerMap.get(featureId) || [];
  ownerMap.set(featureId, [...new Set([...prior, ...owners])]);
}

export async function buildRouteDetailIndex() {
  const [catalog, publicRecords] = await Promise.all([readJson('data/route-catalog.json'), readJson('data/public-records.json')]);
  const publicIds = publicRecordIds(publicRecords);
  const records = new Map();
  const ownersByFeatureId = new Map();

  for (const path of catalog.routeFiles || []) {
    const payload = await readJson(path);
    for (const feature of payload.features || []) {
      const props = feature.properties || {};
      const route = { ...props, id: feature.id || props.featureId || props.id, adventureIds: props.adventureIds || [] };
      const owners = ownerIds(route);
      rememberFeatureOwners(ownersByFeatureId, route.id, owners);
      consider(records, publicIds, route, candidateFor(path, route, payload.metadata || {}, 'geojson', geometryPointCount(feature)));
    }
  }

  for (const path of catalog.polylineFiles || []) {
    const payload = await readJson(path);
    for (const route of payload.routes || []) {
      if (!route?.id) continue;
      const explicitOwners = ownerIds(route);
      if (explicitOwners.length) rememberFeatureOwners(ownersByFeatureId, String(route.id), explicitOwners);
      const inheritedOwners = explicitOwners.length ? explicitOwners : ownersByFeatureId.get(String(route.id)) || [];
      if (!inheritedOwners.length) continue;
      const linkedRoute = explicitOwners.length ? route : { ...route, adventureIds: inheritedOwners };
      consider(records, publicIds, linkedRoute, candidateFor(path, linkedRoute, payload, 'polyline'));
    }
  }

  const recordObject = {};
  for (const id of [...records.keys()].sort()) recordObject[id] = publicCandidate(records.get(id));
  const selectedFeatures = new Set(Object.values(recordObject).map(item => item.featureId));

  return {
    schemaVersion: 1, generatedFrom: 'data/route-catalog.json', publicRecordSource: 'data/public-records.json',
    routeCatalogUpdatedOn: catalog.updatedOn || null, recordCount: Object.keys(recordObject).length,
    featureCount: selectedFeatures.size, records: recordObject,
  };
}

const expected = `${JSON.stringify(await buildRouteDetailIndex(), null, 2)}\n`;
const args = new Set(process.argv.slice(2));

if (args.has('--write')) {
  await writeFile(INDEX_PATH, expected, 'utf8');
  console.log(`Wrote ${INDEX_PATH}`);
} else if (args.has('--stdout')) {
  process.stdout.write(expected);
} else {
  let actual = '';
  try { actual = await readFile(INDEX_PATH, 'utf8'); } catch {}
  if (actual !== expected) {
    console.error('Route detail index is stale or missing. Run npm run build:route-detail-index.');
    process.exit(1);
  }
  const parsed = JSON.parse(expected);
  console.log(`Route detail index is current: ${parsed.recordCount} records across ${parsed.featureCount} selected features.`);
}
