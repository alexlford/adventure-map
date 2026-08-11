import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const manifest = await readJson('data/catalog.json');
const records = new Map();
const sourceById = new Map();
const problems = [];
const warnings = [];

for (const source of manifest.sources) {
  const payload = await readJson(source.path);
  for (const item of payload.adventures || []) {
    if (!item.id) { problems.push(`${source.path}: record missing id`); continue; }
    if (records.has(item.id)) warnings.push(`${item.id}: appears in both ${sourceById.get(item.id)} and ${source.path}; later source wins`);
    records.set(item.id, { ...(records.get(item.id) || {}), ...item });
    sourceById.set(item.id, source.path);
  }
}

const matchPayload = await readJson(manifest.matchLayer);
for (const [id, match] of Object.entries(matchPayload.matches || {})) {
  if (!records.has(id)) warnings.push(`${manifest.matchLayer}: match references unknown id ${id}`);
  else records.set(id, { ...records.get(id), ...match });
}
for (const id of manifest.removeIds || []) {
  if (!records.has(id)) warnings.push(`catalog removeIds references unknown id ${id}`);
  records.delete(id);
}
for (const [id, override] of Object.entries(manifest.overrides || {})) {
  if (!records.has(id)) problems.push(`catalog override references unknown id ${id}`);
  else records.set(id, { ...records.get(id), ...override });
}

const allowedKinds = new Set(['summit','race','adventure']);
for (const record of records.values()) {
  const at = record.id;
  if (!record.name) problems.push(`${at}: missing name`);
  if (!allowedKinds.has(record.kind)) problems.push(`${at}: invalid kind ${record.kind}`);
  if (record.kind === 'race' && !record.discipline) problems.push(`${at}: race missing discipline`);
  if (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) problems.push(`${at}: invalid date ${record.date}`);
  if (record.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(record.endDate)) problems.push(`${at}: invalid endDate ${record.endDate}`);
  if ((record.lat == null) !== (record.lon == null)) problems.push(`${at}: lat/lon must be provided together`);
  if (Number.isFinite(record.lat) && (record.lat < -90 || record.lat > 90)) problems.push(`${at}: latitude out of range`);
  if (Number.isFinite(record.lon) && (record.lon < -180 || record.lon > 180)) problems.push(`${at}: longitude out of range`);
  if (record.year && record.date && Number(record.date.slice(0,4)) !== Number(record.year)) warnings.push(`${at}: year does not match date`);
  if (record.kind === 'adventure' && record.discipline === 'mountain-bike') warnings.push(`${at}: mountain-bike event should normally be kind=race`);
}

if (manifest.relationshipLayer) {
  const payload = await readJson(manifest.relationshipLayer);
  const seenRelationships = new Set();
  for (const rel of payload.relationships || []) {
    if (!rel.id) { problems.push(`${manifest.relationshipLayer}: relationship missing id`); continue; }
    if (seenRelationships.has(rel.id)) problems.push(`${manifest.relationshipLayer}: duplicate relationship id ${rel.id}`);
    seenRelationships.add(rel.id);
    if (!rel.name) problems.push(`${rel.id}: relationship missing name`);
    if (!Array.isArray(rel.memberIds) || !rel.memberIds.length) problems.push(`${rel.id}: relationship has no memberIds`);
    for (const id of rel.memberIds || []) if (!records.has(id)) problems.push(`${rel.id}: member references unknown/non-public record ${id}`);
    if (rel.adventureId && !records.has(rel.adventureId)) problems.push(`${rel.id}: adventureId references unknown/non-public record ${rel.adventureId}`);
    if (rel.adventureId && records.get(rel.adventureId)?.kind !== 'adventure') warnings.push(`${rel.id}: adventureId ${rel.adventureId} is not kind=adventure`);
  }
}

const routeCatalog = await readJson('data/route-catalog.json');
const allowedProvenance = new Set(Object.keys(routeCatalog.provenanceTypes || {}));
const seenRouteIds = new Set();
for (const routeFile of routeCatalog.routeFiles || []) {
  const payload = await readJson(routeFile);
  for (const feature of payload.features || []) {
    const routeId = feature.id || feature.properties?.featureId || feature.properties?.id;
    if (!routeId) warnings.push(`${routeFile}: route is missing a stable feature id`);
    if (routeId && seenRouteIds.has(routeId)) warnings.push(`${routeFile}: duplicate route feature id ${routeId}`);
    if (routeId) seenRouteIds.add(routeId);
    const override = routeId ? routeCatalog.featureOverrides?.[routeId] : null;
    const props = { ...(feature.properties || {}), ...(override || {}) };
    const inferred = props.provenance || (props.stravaActivityId || `${props.source || ''}`.toLowerCase().includes('strava') || `${routeId || ''}`.startsWith('strava-') ? 'personal-gps' : `${props.source || ''} ${props.routeType || ''}`.toLowerCase().match(/historical|official|published/) ? 'historical-course' : 'personal-gps');
    if (!allowedProvenance.has(inferred)) problems.push(`${routeId || routeFile}: invalid route provenance ${inferred}`);
    for (const id of props.adventureIds || []) if (!records.has(id)) warnings.push(`${routeFile}: route ${routeId || 'unnamed'} references non-public/unknown id ${id}`);
  }
}
for (const [routeId, override] of Object.entries(routeCatalog.featureOverrides || {})) {
  if (!seenRouteIds.has(routeId)) problems.push(`route-catalog featureOverrides references unknown route ${routeId}`);
  if (override.provenance && !allowedProvenance.has(override.provenance)) problems.push(`${routeId}: invalid override provenance ${override.provenance}`);
}
for (const [recordId, override] of Object.entries(routeCatalog.recordOverrides || {})) {
  if (!records.has(recordId)) problems.push(`route-catalog recordOverrides references unknown record ${recordId}`);
  if (override.provenance && !allowedProvenance.has(override.provenance)) problems.push(`${recordId}: invalid record provenance ${override.provenance}`);
}

console.log(`Catalog records: ${records.size}`);
console.log(`Warnings: ${warnings.length}`);
warnings.forEach(x => console.warn(`WARN ${x}`));
if (problems.length) {
  problems.forEach(x => console.error(`ERROR ${x}`));
  process.exitCode = 1;
} else {
  console.log('Catalog validation passed.');
}
