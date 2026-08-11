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

const routeCatalog = await readJson('data/route-catalog.json');
const seenPolylineIds = new Set();
const usedRepairRoutes = new Set();

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

for (const polylineFile of routeCatalog.polylineFiles || []) {
  const payload = await readJson(polylineFile);
  if (!Array.isArray(payload.routes)) {
    problems.push(`${polylineFile}: expected routes array`);
    continue;
  }
  for (const route of payload.routes) {
    const at = `${polylineFile}:${route.id || 'unnamed-route'}`;
    if (!route.id) problems.push(`${at}: missing stable route id`);
    if (route.id && seenPolylineIds.has(route.id)) problems.push(`${at}: duplicate route id`);
    if (route.id) seenPolylineIds.add(route.id);
    const repair = route.id ? routeCatalog.polylineRepairs?.[route.id] : null;
    if (repair) {
      usedRepairRoutes.add(route.id);
      if (typeof repair.note !== 'string' || !repair.note.trim()) problems.push(`${at}: declared polyline repair must include a note`);
      for (const [lineIndex, trimValue] of Object.entries(repair.trimEndByLine || {})) {
        const index = Number(lineIndex);
        const trim = Number(trimValue);
        if (!Number.isInteger(index) || index < 0 || index >= (route.lines || []).length) problems.push(`${at}: repair references nonexistent line ${lineIndex}`);
        if (!Number.isInteger(trim) || trim < 1) problems.push(`${at}: repair trim for line ${lineIndex} must be a positive integer`);
      }
    }
    if (!Array.isArray(route.lines) || !route.lines.length) {
      problems.push(`${at}: missing encoded route lines`);
    } else {
      for (const [index, line] of route.lines.entries()) {
        if (typeof line !== 'string' || !line.length) {
          problems.push(`${at}: line ${index} is not an encoded polyline string`);
          continue;
        }
        const trim = Number(repair?.trimEndByLine?.[String(index)] || 0);
        let encoded = line;
        if (trim > 0) {
          if (trim >= line.length) {
            problems.push(`${at}: repair trim for line ${index} removes the entire segment`);
            continue;
          }
          try {
            decodePolyline(line);
            problems.push(`${at}: line ${index} decodes without repair; declared trim is stale or unnecessary`);
          } catch {
            encoded = line.slice(0, -trim);
          }
        }
        try {
          const coordinates = decodePolyline(encoded);
          if (coordinates.length < 2) problems.push(`${at}: line ${index} decodes to fewer than two coordinates`);
          for (const [lon, lat] of coordinates) {
            if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
              problems.push(`${at}: line ${index} contains an out-of-range coordinate`);
              break;
            }
          }
        } catch (error) {
          problems.push(`${at}: line ${index} cannot be decoded${trim ? ' after declared repair' : ''} (${error.message})`);
        }
      }
    }
    for (const id of route.adventureIds || []) if (!publicIds.has(id)) warnings.push(`${at}: references non-public/unknown record ${id}`);
  }
}
for (const routeId of Object.keys(routeCatalog.polylineRepairs || {})) {
  if (!usedRepairRoutes.has(routeId)) problems.push(`route-catalog polylineRepairs references unknown route ${routeId}`);
}

const skiing = await readJson('data/skiing.json');
const resorts = skiing.resorts || [];
if (!Array.isArray(skiing.resorts) || !resorts.length) problems.push('data/skiing.json: resorts must be a non-empty array');
if (Number(skiing.summary?.resortCount) !== resorts.length) problems.push(`data/skiing.json: summary resortCount ${skiing.summary?.resortCount} does not match ${resorts.length} resort rows`);
const resortIds = new Set();
let resortDayTotal = 0;
for (const resort of resorts) {
  const at = `ski resort ${resort.name || '(unnamed)'}`;
  if (!resort.name) problems.push(`${at}: missing name`);
  if (!resort.region) problems.push(`${at}: missing region`);
  if (!Number.isInteger(resort.days) || resort.days < 1) problems.push(`${at}: days must be a positive integer`);
  else resortDayTotal += resort.days;
  if (!Number.isFinite(resort.lat) || resort.lat < -90 || resort.lat > 90) problems.push(`${at}: invalid latitude`);
  if (!Number.isFinite(resort.lon) || resort.lon < -180 || resort.lon > 180) problems.push(`${at}: invalid longitude`);
  const id = `map-ski-resort-${String(resort.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  if (resortIds.has(id)) problems.push(`${at}: generated map entity id collides with another resort (${id})`);
  resortIds.add(id);
}
const distinctSkiDays = Number(skiing.summary?.recordedDays);
if (Number.isFinite(distinctSkiDays) && resortDayTotal < distinctSkiDays) problems.push(`data/skiing.json: resort day memberships ${resortDayTotal} cannot cover ${distinctSkiDays} distinct recorded ski days`);

console.log(`Map polyline routes: ${seenPolylineIds.size}`);
console.log(`Declared polyline endpoint repairs: ${usedRepairRoutes.size}`);
console.log(`Ski resort map entities: ${resorts.length}`);
console.log(`Ski resort day memberships: ${resortDayTotal} across ${Number.isFinite(distinctSkiDays) ? distinctSkiDays : 'unknown'} distinct ski days`);
warnings.forEach(message => console.warn(`WARN ${message}`));
if (problems.length) {
  problems.forEach(message => console.error(`ERROR ${message}`));
  process.exitCode = 1;
} else {
  console.log('Map data validation passed.');
}
