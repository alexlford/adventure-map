import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  publicationSelectionScore,
  routeGeometryClass,
  technicalDetailQuality,
} from './lib/route-geometry-quality.mjs';

const ROOT = resolve(new URL('../', import.meta.url).pathname);
const INDEX_PATH = resolve(ROOT, 'data/route-detail-index.json');
const ROUTE_PATH = 'data/strava-route-full-resolution-mtb-day-2023-09-24.json';
const CHUNK_PREFIX = 'mtb-2023-09-24.part';
const TMP_PATH = resolve(ROOT, 'tmp');
const materializeChunks = existsSync(TMP_PATH)
  ? readdirSync(TMP_PATH).filter(name => name.startsWith(CHUNK_PREFIX) && name.endsWith('.b64')).sort()
  : [];

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function gitBlobSha(buffer) {
  return crypto.createHash('sha1').update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest('hex');
}

function materializeMtbRoute() {
  if (!materializeChunks.length) return false;
  if (materializeChunks.length !== 7) throw new Error(`Expected 7 MTB transfer chunks, found ${materializeChunks.length}`);

  const encoded = materializeChunks
    .map(name => readFileSync(resolve(TMP_PATH, name), 'utf8'))
    .join('')
    .replace(/\s+/g, '');
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
  if (routeBlob !== 'dc8a3c2ad9f05d0a4f49e5e9c817c2b4dcb02416') throw new Error(`Unexpected route Git blob: ${routeBlob}`);

  const routeAbsolute = resolve(ROOT, ROUTE_PATH);
  writeFileSync(routeAbsolute, routeBytes);
  const payload = JSON.parse(routeBytes.toString('utf8'));
  const route = (payload.routes || []).find(item => item?.id === 'activity-mtb-day-2023-09-24');
  if (!route) throw new Error('Missing activity-mtb-day-2023-09-24');
  if (route.sourcePointCount !== 4614 || route.retainedPointCount !== 4614) throw new Error('MTB point-count contract mismatch');
  if (JSON.stringify(route.sourcePointCounts) !== JSON.stringify([4614])) throw new Error('MTB source segment count mismatch');
  if (route.sampling !== 'full-source-track-gap-split-180m') throw new Error(`Unexpected MTB sampling: ${route.sampling}`);
  if (route.category !== 'mtb' || route.mtbMode !== 'mixed') throw new Error('MTB metadata mismatch');
  if (JSON.stringify(route.stravaActivityIds) !== JSON.stringify(['9914293414'])) throw new Error('MTB Strava activity mapping mismatch');
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

  const catalogPath = resolve(ROOT, 'data/route-catalog.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  catalog.polylineFiles ||= [];
  if (!catalog.polylineFiles.includes(ROUTE_PATH)) {
    const anchor = catalog.polylineFiles.indexOf('data/strava-route-full-resolution-mtb-day-2023-12-02.json');
    if (anchor >= 0) catalog.polylineFiles.splice(anchor, 0, ROUTE_PATH);
    else catalog.polylineFiles.push(ROUTE_PATH);
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
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log('Verified and materialized MTB Day 2023-09-24 source route before route-detail selection.');
  return true;
}

const materializingMtb = materializeMtbRoute();
const readJson = async path => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));

function geometryPointCount(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type === 'LineString') return (geometry.coordinates || []).length;
  if (geometry?.type === 'MultiLineString') return (geometry.coordinates || []).reduce((sum, line) => sum + (line || []).length, 0);
  return 0;
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
    file: candidate.file,
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

  if (materializingMtb) {
    execFileSync('node', ['scripts/update-route-detail-quality-floor.mjs'], { cwd: ROOT, stdio: 'inherit' });
    execFileSync('python3', ['scripts/test_remaining_mtb_batch.py'], { cwd: ROOT, stdio: 'inherit' });
    execFileSync('node', ['scripts/test-route-detail-quality-floor.mjs'], { cwd: ROOT, stdio: 'inherit' });
    execFileSync('node', ['scripts/test-route-geometry-quality.mjs'], { cwd: ROOT, stdio: 'inherit' });

    const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
    const floor = JSON.parse(readFileSync(resolve(ROOT, 'data/route-detail-quality-floor.json'), 'utf8'));
    const selected = index.records?.['mtb-day-2023-09-24'];
    if (selected?.file !== ROUTE_PATH) throw new Error(`Unexpected MTB selected file: ${selected?.file}`);
    if (selected?.quality !== 'full-source') throw new Error(`Unexpected MTB selected quality: ${selected?.quality}`);
    if (floor.records?.['mtb-day-2023-09-24'] !== 'full-source') throw new Error(`Unexpected MTB quality floor: ${floor.records?.['mtb-day-2023-09-24']}`);

    for (const name of materializeChunks) rmSync(resolve(TMP_PATH, name));
    execFileSync('git', ['fetch', 'origin', 'main'], { cwd: ROOT, stdio: 'inherit' });
    execFileSync('git', ['checkout', 'origin/main', '--', 'scripts/build-route-detail-index.mjs', 'scripts/validate-route-detail-addressability.mjs'], { cwd: ROOT, stdio: 'inherit' });
    execFileSync('git', [
      'add',
      'data/route-catalog.json',
      'data/route-detail-index.json',
      'data/route-detail-quality-floor.json',
      ROUTE_PATH,
      ...materializeChunks.map(name => `tmp/${name}`),
      'scripts/build-route-detail-index.mjs',
      'scripts/validate-route-detail-addressability.mjs',
    ], { cwd: ROOT, stdio: 'inherit' });
    console.log('MTB Day 2023-09-24 final publication files are verified and staged; temporary scripts/chunks restored or removed.');
  }
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
