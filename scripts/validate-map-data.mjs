import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const problems = [];
const warnings = [];

const manifest = await readJson('data/catalog.json');
const publicIds = new Set();
for (const source of manifest.sources || []) {
  const payload = await readJson(source.path);
  for (const record of payload.adventures || []) if (record.id) publicIds.add(record.id);
}
for (const id of manifest.removeIds || []) publicIds.delete(id);

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

const routeCatalog = await readJson('data/route-catalog.json');
const routeIds = new Set();
for (const routeFile of routeCatalog.routeFiles || []) {
  const payload = await readJson(routeFile);
  if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    problems.push(`${routeFile}: expected GeoJSON FeatureCollection`);
    continue;
  }
  for (const feature of payload.features) {
    const id = feature.id || feature.properties?.featureId || feature.properties?.id || null;
    if (id && routeIds.has(id)) problems.push(`${routeFile}: duplicate route feature id ${id}`);
    if (id) routeIds.add(id);
    for (const recordId of feature.properties?.adventureIds || []) if (!publicIds.has(recordId)) warnings.push(`${routeFile}: route ${id || '(unnamed)'} references non-public/unknown record ${recordId}`);
  }
}

const polylineFile = 'data/activity-route-polylines.json';
let encodedRouteCount = 0;
try {
  const payload = await readJson(polylineFile);
  const encodedIds = new Set();
  const repairs = routeCatalog.polylineRepairs || {};
  for (const route of payload.routes || []) {
    encodedRouteCount += 1;
    const at = `${polylineFile}:${route.id || 'unnamed-route'}`;
    if (!route.id) problems.push(`${at}: missing stable route id`);
    if (route.id && encodedIds.has(route.id)) problems.push(`${at}: duplicate route id`);
    if (route.id) encodedIds.add(route.id);
    if (!Array.isArray(route.lines) || !route.lines.length) {
      problems.push(`${at}: missing encoded route lines`);
      continue;
    }
    for (const [lineIndex, rawLine] of route.lines.entries()) {
      if (typeof rawLine !== 'string' || !rawLine.length) {
        problems.push(`${at}: line ${lineIndex} is not an encoded polyline string`);
        continue;
      }
      const trim = Number(repairs?.[route.id]?.trimEndByLine?.[String(lineIndex)] || 0);
      const line = trim > 0 ? rawLine.slice(0, -trim) : rawLine;
      try {
        const coordinates = decodePolyline(line);
        if (coordinates.length < 2) problems.push(`${at}: line ${lineIndex} decodes to fewer than two coordinates`);
        for (const [lon, lat] of coordinates) {
          if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
            problems.push(`${at}: line ${lineIndex} contains an out-of-range coordinate`);
            break;
          }
        }
        if (trim > 0) {
          try {
            decodePolyline(rawLine);
            problems.push(`${at}: declared repair for line ${lineIndex} is stale because the raw line now decodes successfully`);
          } catch {}
        }
      } catch (error) {
        if (trim > 0) problems.push(`${at}: declared repair does not produce valid geometry (${error.message})`);
        else warnings.push(`${at}: encoded line ${lineIndex} needs an explicit route-catalog repair (${error.message})`);
      }
    }
    for (const id of route.adventureIds || []) if (!publicIds.has(id)) warnings.push(`${at}: references non-public/unknown record ${id}`);
  }
  for (const [routeId, repair] of Object.entries(repairs)) {
    if (!encodedIds.has(routeId)) problems.push(`route-catalog polylineRepairs references unknown route ${routeId}`);
    for (const [lineIndex, trim] of Object.entries(repair.trimEndByLine || {})) if (!Number.isInteger(Number(trim)) || Number(trim) < 1) problems.push(`${routeId}: invalid trim count for line ${lineIndex}`);
  }
} catch (error) {
  problems.push(`${polylineFile}: unable to validate (${error.message})`);
}

const skiing = await readJson('data/skiing.json');
const resorts = skiing.resorts || [];
if (!Array.isArray(skiing.resorts) || !resorts.length) problems.push('data/skiing.json: resorts must be a non-empty array');
if (Number(skiing.summary?.resortCount) !== resorts.length) problems.push(`data/skiing.json: summary resortCount ${skiing.summary?.resortCount} does not match ${resorts.length} resort rows`);
const resortIds = new Set();
for (const resort of resorts) {
  const at = `ski resort ${resort.name || '(unnamed)'}`;
  if (!resort.name) problems.push(`${at}: missing name`);
  if (!resort.region) problems.push(`${at}: missing region`);
  if (!Number.isInteger(resort.days) || resort.days < 1) problems.push(`${at}: days must be a positive integer`);
  if (!Number.isFinite(resort.lat) || resort.lat < -90 || resort.lat > 90) problems.push(`${at}: invalid latitude`);
  if (!Number.isFinite(resort.lon) || resort.lon < -180 || resort.lon > 180) problems.push(`${at}: invalid longitude`);
  const id = `map-ski-resort-${String(resort.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  if (resortIds.has(id)) problems.push(`${at}: generated map entity id collides with another resort (${id})`);
  resortIds.add(id);
}

console.log(`GeoJSON route features: ${routeIds.size}`);
console.log(`Encoded activity routes: ${encodedRouteCount}`);
console.log(`Ski resort map entities: ${resorts.length}`);
console.log(`Map-data review warnings: ${warnings.length}`);
warnings.forEach(message => console.warn(`WARN ${message}`));
if (problems.length) {
  problems.forEach(message => console.error(`ERROR ${message}`));
  process.exitCode = 1;
} else {
  console.log('Map data validation passed.');
}
