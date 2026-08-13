import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../', import.meta.url).pathname);
const INDEX_PATH = resolve(ROOT, 'data/route-detail-index.json');

const readJson = async path => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));

function detailScore(path, route, payload) {
  const file = path.toLowerCase();
  const density = String(route.density || payload.sampling || '').toLowerCase();
  if (file.includes('full-resolution') || density.includes('full-source') || density.includes('dense-source')) return 500;
  if (file.includes('rdp3') || density.includes('rdp-3m')) return 400;
  if (file.includes('story-route')) return 350;
  if (file.includes('backfill')) return 250;
  if (file.includes('activity-route-polylines')) return 150;
  return 200;
}

function candidateFor(path, route, payload) {
  return {
    file: path,
    featureId: route.id,
    score: detailScore(path, route, payload),
    density: route.density || payload.sampling || null,
    sourcePointCount: Number.isFinite(route.sourcePointCount) ? route.sourcePointCount : null,
    publishedPointCount: Number.isFinite(route.publishedPointCount) ? route.publishedPointCount : null,
  };
}

function compareCandidates(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const aPublished = a.publishedPointCount || 0;
  const bPublished = b.publishedPointCount || 0;
  if (bPublished !== aPublished) return bPublished - aPublished;
  const aSource = a.sourcePointCount || 0;
  const bSource = b.sourcePointCount || 0;
  if (bSource !== aSource) return bSource - aSource;
  return a.file.localeCompare(b.file) || a.featureId.localeCompare(b.featureId);
}

function stripNulls(candidate) {
  return Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== null));
}

export async function buildRouteDetailIndex() {
  const catalog = await readJson('data/route-catalog.json');
  const records = new Map();
  const featureFiles = new Map();

  for (const path of catalog.polylineFiles || []) {
    const payload = await readJson(path);
    for (const route of payload.routes || []) {
      if (!route?.id || !Array.isArray(route.adventureIds) || !route.adventureIds.length) continue;
      const candidate = candidateFor(path, route, payload);
      const priorFeature = featureFiles.get(route.id);
      if (!priorFeature || compareCandidates(candidate, priorFeature) < 0) featureFiles.set(route.id, candidate);
      for (const adventureId of route.adventureIds) {
        if (!records.has(adventureId)) records.set(adventureId, []);
        const list = records.get(adventureId);
        const duplicate = list.find(item => item.file === candidate.file && item.featureId === candidate.featureId);
        if (!duplicate) list.push(candidate);
      }
    }
  }

  const recordObject = {};
  for (const id of [...records.keys()].sort()) {
    recordObject[id] = records.get(id).sort(compareCandidates).map(stripNulls);
  }

  const featureObject = {};
  for (const id of [...featureFiles.keys()].sort()) featureObject[id] = stripNulls(featureFiles.get(id));

  return {
    schemaVersion: 1,
    generatedFrom: 'data/route-catalog.json',
    routeCatalogUpdatedOn: catalog.updatedOn || null,
    recordCount: Object.keys(recordObject).length,
    featureCount: Object.keys(featureObject).length,
    records: recordObject,
    features: featureObject,
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
    console.error('Route detail index is stale or missing. Generated content follows:');
    process.stderr.write(expected);
    process.exit(1);
  }
  const parsed = JSON.parse(expected);
  console.log(`Route detail index is current: ${parsed.recordCount} records across ${parsed.featureCount} features.`);
}
