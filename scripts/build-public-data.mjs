import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = path.resolve(root, outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : 'dist/data');

async function readText(rel) { return fs.readFile(path.join(root, rel), 'utf8'); }
const stableHash = values => crypto.createHash('sha256').update(values.join('\n')).digest('hex').slice(0, 16);
const slugify = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-');
const recordSlug = record => record.slug || [record.date || record.year, record.name].filter(Boolean).map(slugify).filter(Boolean).join('-') || slugify(record.id);

function inferProvenance(feature) {
  const p = feature.properties || {};
  const source = `${p.source || ''} ${p.routeType || ''}`.toLowerCase();
  if (source.includes('historical') || source.includes('official') || source.includes('published')) return 'historical-course';
  if (p.stravaActivityId || source.includes('strava') || feature.id?.startsWith('strava-')) return 'personal-gps';
  return 'personal-gps';
}

function decodePolyline(encoded) {
  let index = 0, lat = 0, lon = 0;
  const coordinates = [];
  while (index < encoded.length) {
    let result = 0, shift = 0, b;
    do {
      if (index >= encoded.length) throw new Error('truncated latitude');
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0; shift = 0;
    do {
      if (index >= encoded.length) throw new Error('truncated longitude');
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lon += (result & 1) ? ~(result >> 1) : (result >> 1);
    coordinates.push([lon / 1e5, lat / 1e5]);
  }
  return coordinates;
}

async function compileRecords() {
  const manifestText = await readText('data/catalog.json');
  const manifest = JSON.parse(manifestText);
  const sourceTexts = [];
  const records = new Map();
  for (const source of manifest.sources || []) {
    const text = await readText(source.path);
    sourceTexts.push(text);
    const payload = JSON.parse(text);
    for (const item of payload.adventures || []) {
      if (!item.id) throw new Error(`${source.path}: record missing id`);
      records.set(item.id, { ...(records.get(item.id) || {}), ...item, _catalogSource: source.path });
    }
  }
  const matchText = await readText(manifest.matchLayer);
  const matches = JSON.parse(matchText);
  for (const [id, match] of Object.entries(matches.matches || {})) if (records.has(id)) records.set(id, { ...records.get(id), ...match });
  for (const id of manifest.removeIds || []) records.delete(id);
  for (const [id, override] of Object.entries(manifest.overrides || {})) {
    if (!records.has(id)) throw new Error(`Catalog override references unknown id: ${id}`);
    records.set(id, { ...records.get(id), ...override });
  }
  const relationshipText = manifest.relationshipLayer ? await readText(manifest.relationshipLayer) : '{"relationships":[]}';
  const relationshipPayload = JSON.parse(relationshipText);
  const list = [...records.values()].map(record => ({ ...record, slug: recordSlug(record) }));
  const ids = new Set(list.map(record => record.id));
  if (ids.size !== list.length) throw new Error('Compiled public records contain duplicate ids');
  const slugs = new Set();
  for (const record of list) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug || '')) throw new Error(`Compiled public record ${record.id} has invalid slug ${record.slug || '(missing)'}`);
    if (slugs.has(record.slug)) throw new Error(`Compiled public records contain duplicate slug ${record.slug}`);
    slugs.add(record.slug);
  }
  return {
    schemaVersion: 1,
    sourceFingerprint: stableHash([manifestText, ...sourceTexts, matchText, relationshipText]),
    sourceCount: (manifest.sources || []).length,
    recordCount: list.length,
    relationshipCount: (relationshipPayload.relationships || []).length,
    records: list,
    relationships: relationshipPayload.relationships || [],
  };
}

async function compileRoutes() {
  const catalogText = await readText('data/route-catalog.json');
  const catalog = JSON.parse(catalogText);
  const sourceTexts = [];
  const features = [];
  const seen = new Set();
  const addFeature = feature => {
    const id = feature.id || feature.properties?.featureId || feature.properties?.id || null;
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    const override = id ? catalog.featureOverrides?.[id] : null;
    const properties = { ...(feature.properties || {}), ...(override || {}) };
    properties.provenance ||= inferProvenance({ ...feature, properties });
    features.push({ ...feature, properties });
  };
  for (const routeFile of catalog.routeFiles || []) {
    const text = await readText(routeFile);
    sourceTexts.push(text);
    const payload = JSON.parse(text);
    for (const feature of payload.features || []) addFeature(feature);
  }
  for (const polylineFile of catalog.polylineFiles || []) {
    const text = await readText(polylineFile);
    sourceTexts.push(text);
    const payload = JSON.parse(text);
    for (const route of payload.routes || []) {
      const repair = catalog.polylineRepairs?.[route.id] || null;
      const lines = (route.lines || []).map((line, index) => {
        const trim = Number(repair?.trimEndByLine?.[String(index)] || 0);
        const encoded = trim > 0 ? line.slice(0, -trim) : line;
        return decodePolyline(encoded);
      });
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
          routeRepair: repair?.note || null,
        },
        geometry: lines.length === 1
          ? { type: 'LineString', coordinates: lines[0] }
          : { type: 'MultiLineString', coordinates: lines },
      });
    }
  }
  return {
    type: 'FeatureCollection',
    metadata: {
      schemaVersion: 1,
      sourceFingerprint: stableHash([catalogText, ...sourceTexts]),
      featureCount: features.length,
      recordOverrides: catalog.recordOverrides || {},
    },
    features,
  };
}

async function compileMapEntities() {
  const text = await readText('data/skiing.json');
  const skiing = JSON.parse(text);
  const entities = (skiing.resorts || []).map(resort => ({
    id: `map-ski-resort-${resort.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    kind: 'map-location',
    entityType: 'ski-resort',
    discipline: 'ski',
    mapCategory: 'ski',
    name: resort.name,
    skiDays: resort.days,
    location: resort.region,
    region: resort.region,
    lat: resort.lat,
    lon: resort.lon,
    coordinatePrecision: 'resort',
  }));
  if (new Set(entities.map(entity => entity.id)).size !== entities.length) throw new Error('Compiled map entities contain duplicate ids');
  return {
    schemaVersion: 1,
    sourceFingerprint: stableHash([text]),
    entityCount: entities.length,
    summary: skiing.summary || {},
    entities,
  };
}

const [records, routes, mapEntities] = await Promise.all([compileRecords(), compileRoutes(), compileMapEntities()]);
await fs.mkdir(outDir, { recursive: true });
const outputs = [
  ['public-records.json', records],
  ['public-routes.geojson', routes],
  ['public-map-entities.json', mapEntities],
];
for (const [name, payload] of outputs) await fs.writeFile(path.join(outDir, name), `${JSON.stringify(payload)}\n`);

console.log(`Compiled ${records.recordCount} public records from ${records.sourceCount} source layers.`);
console.log(`Compiled ${records.relationshipCount} public relationships.`);
console.log(`Compiled ${routes.metadata.featureCount} public route features.`);
console.log(`Compiled ${mapEntities.entityCount} public map entities.`);
console.log(`Public data output: ${path.relative(root, outDir) || '.'}`);
