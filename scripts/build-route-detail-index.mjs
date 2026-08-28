import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import {
  publicationSelectionScore,
  routeGeometryClass,
  technicalDetailQuality,
} from './lib/route-geometry-quality.mjs';

const ROOT = resolve(new URL('../', import.meta.url).pathname);
const INDEX_FILE = 'data/route-detail-index.json';
const BROWSER_CACHE_FILE = 'data/route-detail-browser-polylines.json';
const INDEX_PATH = resolve(ROOT, INDEX_FILE);
const BROWSER_CACHE_PATH = resolve(ROOT, BROWSER_CACHE_FILE);

const readJson = async path => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));

function geometryPointCount(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type === 'LineString') return (geometry.coordinates || []).length;
  if (geometry?.type === 'MultiLineString') return (geometry.coordinates || []).reduce((sum, line) => sum + (line || []).length, 0);
  return 0;
}

function isPolyline5Encoding(value) {
  return value === 'polyline5' || value === 'google-polyline5';
}

function needsBrowserMaterialization(route, payload, format) {
  if (format !== 'polyline') return false;
  if (Array.isArray(route?.segments) && route.segments.length) return false;
  if (Array.isArray(route?.lines) && route.lines.length) return false;
  return isPolyline5Encoding(payload?.encoding)
    && Array.isArray(route?.linesBrotliBase64)
    && route.linesBrotliBase64.length > 0;
}

function candidateFor(path, route, payload, format, publishedPointCount = 0) {
  const score = publicationSelectionScore({ route, payload, filePath: path });
  const quality = technicalDetailQuality({ route, payload, filePath: path });
  const geometryClass = routeGeometryClass(route, payload);
  return {
    file: path,
    featureId: route.id || route.featureId,
    format,
    score,
    quality,
    geometryClass,
    publicationSelected: route.publicationSelected === true,
    publishedPointCount: Number.isFinite(route.publishedPointCount) ? route.publishedPointCount
      : Number.isFinite(route.retainedPointCount) ? route.retainedPointCount
      : publishedPointCount,
    sourcePointCount: Number.isFinite(route.sourcePointCount) ? route.sourcePointCount : 0,
    browserMaterialized: needsBrowserMaterialization(route, payload, format),
    sourceRoute: route,
    sourcePayload: payload,
  };
}

function compareCandidates(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.publishedPointCount !== a.publishedPointCount) return b.publishedPointCount - a.publishedPointCount;
  if (b.sourcePointCount !== a.sourcePointCount) return b.sourcePointCount - a.sourcePointCount;
  return a.file.localeCompare(b.file) || a.featureId.localeCompare(b.featureId);
}

function publicCandidate(candidate) {
  return {
    file: candidate.browserMaterialized ? BROWSER_CACHE_FILE : candidate.file,
    ...(candidate.browserMaterialized ? { sourceFile: candidate.file } : {}),
    featureId: candidate.featureId,
    format: candidate.format,
    quality: candidate.quality,
    ...(candidate.geometryClass ? { geometryClass: candidate.geometryClass } : {}),
  };
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

function materializeBrowserRoute(candidate) {
  const route = candidate.sourceRoute || {};
  const payload = candidate.sourcePayload || {};
  const compressedLines = route.linesBrotliBase64 || [];
  const lines = compressedLines.map((value, index) => {
    if (typeof value !== 'string' || !value.length) {
      throw new Error(`${candidate.file}:${candidate.featureId}: invalid Brotli line ${index + 1}`);
    }
    return brotliDecompressSync(Buffer.from(value, 'base64')).toString('utf8');
  });
  if (!lines.length) throw new Error(`${candidate.file}:${candidate.featureId}: no Brotli lines to materialize`);

  const materialized = { ...route };
  delete materialized.linesBrotliBase64;
  return {
    ...materialized,
    id: candidate.featureId,
    lines,
    sampling: route.sampling || payload.sampling || null,
    geometryClass: route.geometryClass || payload.geometryClass || null,
    sourceFile: candidate.file,
    sourceEncoding: payload.encoding || null,
    sourceCompression: payload.compression || 'brotli-base64',
  };
}

function buildBrowserCache(selectedCandidates) {
  const byFeatureId = new Map();
  for (const candidate of selectedCandidates) {
    if (!candidate.browserMaterialized) continue;
    const featureId = String(candidate.featureId || '');
    const prior = byFeatureId.get(featureId);
    if (prior && prior.file !== candidate.file) {
      throw new Error(`Selected compressed feature ${featureId} comes from multiple source files: ${prior.file} and ${candidate.file}`);
    }
    if (!prior) byFeatureId.set(featureId, candidate);
  }

  const selected = [...byFeatureId.values()]
    .sort((a, b) => String(a.featureId).localeCompare(String(b.featureId)));
  const routes = selected.map(materializeBrowserRoute);
  return {
    schemaVersion: 1,
    encoding: 'google-polyline5',
    compression: 'none',
    materialization: 'build-time-brotli-decompression',
    source: 'Exact route detail materialized from compressed source archives',
    generatedFrom: [...new Set(selected.map(candidate => candidate.file))].sort(),
    routeCount: routes.length,
    routes,
  };
}

export async function buildRouteDetailArtifacts() {
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
  const selectedCandidates = [...records.values()];
  const browserCache = buildBrowserCache(selectedCandidates);

  return {
    index: {
      schemaVersion: 1, generatedFrom: 'data/route-catalog.json', publicRecordSource: 'data/public-records.json',
      routeCatalogUpdatedOn: catalog.updatedOn || null, recordCount: Object.keys(recordObject).length,
      featureCount: selectedFeatures.size, browserMaterializedFeatureCount: browserCache.routeCount, records: recordObject,
    },
    browserCache,
  };
}

export async function buildRouteDetailIndex() {
  return (await buildRouteDetailArtifacts()).index;
}

const artifacts = await buildRouteDetailArtifacts();
const expectedIndex = `${JSON.stringify(artifacts.index, null, 2)}\n`;
const expectedBrowserCache = `${JSON.stringify(artifacts.browserCache, null, 2)}\n`;
const args = new Set(process.argv.slice(2));

if (args.has('--write')) {
  await Promise.all([
    writeFile(INDEX_PATH, expectedIndex, 'utf8'),
    writeFile(BROWSER_CACHE_PATH, expectedBrowserCache, 'utf8'),
  ]);
  console.log(`Wrote ${INDEX_PATH}`);
  console.log(`Wrote ${BROWSER_CACHE_PATH} with ${artifacts.browserCache.routeCount} build-time materialized route(s).`);
} else if (args.has('--stdout')) {
  process.stdout.write(expectedIndex);
} else {
  let actualIndex = '';
  let actualBrowserCache = '';
  try { actualIndex = await readFile(INDEX_PATH, 'utf8'); } catch {}
  try { actualBrowserCache = await readFile(BROWSER_CACHE_PATH, 'utf8'); } catch {}

  const problems = [];
  if (actualIndex !== expectedIndex) problems.push('Route detail index is stale or missing. Run npm run build:route-detail-index.');
  if (actualBrowserCache !== expectedBrowserCache) problems.push('Browser route detail cache is stale or missing. Run npm run build:route-detail-index.');
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }

  console.log(`Route detail index is current: ${artifacts.index.recordCount} records across ${artifacts.index.featureCount} selected features; ${artifacts.browserCache.routeCount} compressed feature(s) materialized for browsers.`);
}
