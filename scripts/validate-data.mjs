import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const manifest = await readJson('data/catalog.json');
const schema = await readJson('data/event-schema.json');
const records = new Map();
const sourceById = new Map();
const problems = [];
const warnings = [];
const layeredMerges = [];
const absentTombstones = [];

for (const source of manifest.sources) {
  const payload = await readJson(source.path);
  for (const item of payload.adventures || []) {
    if (!item.id) { problems.push(`${source.path}: record missing id`); continue; }
    if (records.has(item.id)) layeredMerges.push(`${item.id}: ${sourceById.get(item.id)} → ${source.path}`);
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
  if (!records.has(id)) absentTombstones.push(id);
  records.delete(id);
}
for (const [id, override] of Object.entries(manifest.overrides || {})) {
  if (!records.has(id)) problems.push(`catalog override references unknown id ${id}`);
  else records.set(id, { ...records.get(id), ...override });
}

const allowedKinds = new Set(schema.kinds || []);
const allowedDisciplines = new Set(schema.disciplines || []);
const allowedConfidence = new Set(schema.confidence || []);
const allowedPrecision = new Set(schema.coordinatePrecision || []);
for (const record of records.values()) {
  const at = record.id;
  if (!record.name) problems.push(`${at}: missing name`);
  if (!allowedKinds.has(record.kind)) problems.push(`${at}: invalid kind ${record.kind}`);
  if ((record.kind === 'race' || record.kind === 'event') && !record.discipline) problems.push(`${at}: ${record.kind} missing discipline`);
  if (record.discipline && !allowedDisciplines.has(record.discipline)) warnings.push(`${at}: noncanonical discipline ${record.discipline}`);
  if (record.matchConfidence && !allowedConfidence.has(record.matchConfidence)) warnings.push(`${at}: noncanonical confidence ${record.matchConfidence}`);
  if (record.coordinatePrecision && !allowedPrecision.has(record.coordinatePrecision)) warnings.push(`${at}: noncanonical coordinatePrecision ${record.coordinatePrecision}`);
  if (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) problems.push(`${at}: invalid date ${record.date}`);
  if (record.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(record.endDate)) problems.push(`${at}: invalid endDate ${record.endDate}`);
  if ((record.lat == null) !== (record.lon == null)) problems.push(`${at}: lat/lon must be provided together`);
  if (Number.isFinite(record.lat) && (record.lat < -90 || record.lat > 90)) problems.push(`${at}: latitude out of range`);
  if (Number.isFinite(record.lon) && (record.lon < -180 || record.lon > 180)) problems.push(`${at}: longitude out of range`);
  if (record.year && record.date && Number(record.date.slice(0,4)) !== Number(record.year)) warnings.push(`${at}: year does not match date`);
  if (record.distanceMi != null && (!Number.isFinite(record.distanceMi) || record.distanceMi < 0)) problems.push(`${at}: invalid distanceMi`);
  if (record.distanceKm != null && (!Number.isFinite(record.distanceKm) || record.distanceKm < 0)) problems.push(`${at}: invalid distanceKm`);
  if (record.kind === 'adventure' && record.discipline === 'mountain-bike') warnings.push(`${at}: mountain-bike event should normally be kind=race`);
  if (record.kind === 'event' && /race/i.test(record.note || '') && !/not a race|rather than a race/i.test(record.note || '')) warnings.push(`${at}: event note mentions race; review classification`);

  if (record.media != null && !Array.isArray(record.media)) problems.push(`${at}: media must be an array`);
  for (const [index, item] of (Array.isArray(record.media) ? record.media : []).entries()) {
    const where = `${at}: media[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) { problems.push(`${where} must be an object`); continue; }
    if (item.type && item.type !== 'image') warnings.push(`${where}: unsupported media type ${item.type}; only image currently renders`);
    if (typeof item.src !== 'string' || !item.src.trim()) problems.push(`${where}: missing src`);
    if (typeof item.alt !== 'string' || !item.alt.trim()) problems.push(`${where}: missing alt text`);
    if (item.caption != null && typeof item.caption !== 'string') problems.push(`${where}: caption must be a string`);
    if (item.credit != null && typeof item.credit !== 'string') problems.push(`${where}: credit must be a string`);
    if (typeof item.src === 'string' && item.src.trim() && !/^https?:\/\//i.test(item.src)) {
      const rel = item.src.replace(/^\.\//, '');
      if (path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) problems.push(`${where}: local src must stay inside the repository`);
      else {
        try { await fs.access(path.join(root, rel)); }
        catch { problems.push(`${where}: local image does not exist: ${rel}`); }
      }
    } else if (typeof item.src === 'string' && /^https?:\/\//i.test(item.src)) {
      warnings.push(`${where}: remote image URL is less durable than a repository-owned asset`);
    }
  }
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
    const inferred = props.provenance || props.provenanceType || (props.stravaActivityId || `${props.source || ''}`.toLowerCase().includes('strava') || `${routeId || ''}`.startsWith('strava-') ? 'personal-gps' : `${props.source || ''} ${props.routeType || ''}`.toLowerCase().match(/historical|official|published/) ? 'historical-course' : 'personal-gps');
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

const ingestState = await readJson('data/ingest-state.json');
if (Number(ingestState.schemaVersion) < 2) problems.push('ingest-state: expected schemaVersion >= 2');
if (!Number.isInteger(ingestState.activityCount) || ingestState.activityCount < 1) problems.push('ingest-state: invalid activityCount');
if (!/^\d{4}-\d{2}-\d{2}$/.test(ingestState.snapshotOn || '')) problems.push('ingest-state: snapshotOn must use YYYY-MM-DD');
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(ingestState.lastSeenActivityLocalDateTime || '')) problems.push('ingest-state: invalid lastSeenActivityLocalDateTime');
if (!Array.isArray(ingestState.seenAtWatermarkActivityIdHashes) || !ingestState.seenAtWatermarkActivityIdHashes.length) problems.push('ingest-state: missing watermark activity hashes');
for (const hash of ingestState.seenAtWatermarkActivityIdHashes || []) if (!/^[0-9a-f]{16}$/.test(hash)) problems.push(`ingest-state: invalid activity hash ${hash}`);

const updatePolicy = await readJson('data/update-policy.json');
const requiredUpdateCategories = ['run', 'bike', 'nordic', 'skiing'];
for (const category of requiredUpdateCategories) if (!updatePolicy.activityPolicies?.[category]) problems.push(`update-policy: missing ${category} policy`);
const allowedUpdateActions = new Set(['review-only', 'race-review', 'bike-review', 'candidate-outing', 'ski-passport']);
for (const [category, policy] of Object.entries(updatePolicy.activityPolicies || {})) {
  if (!allowedUpdateActions.has(policy.defaultAction)) problems.push(`update-policy: ${category} has invalid defaultAction ${policy.defaultAction}`);
  if (!Array.isArray(policy.publicDestinations) || !policy.publicDestinations.length) problems.push(`update-policy: ${category} has no publicDestinations`);
}

console.log(`Catalog records: ${records.size}`);
console.log(`Strava ingest watermark: ${ingestState.lastSeenActivityLocalDateTime} (${ingestState.activityCount} activities reviewed)`);
console.log(`Layered record merges: ${layeredMerges.length}`);
console.log(`Catalog tombstones: ${(manifest.removeIds || []).length}${absentTombstones.length ? ` (${absentTombstones.length} not present in current source layers)` : ''}`);
if (process.env.VERBOSE_VALIDATION === '1') {
  layeredMerges.forEach(x => console.log(`LAYER ${x}`));
  absentTombstones.forEach(x => console.log(`TOMBSTONE ${x}`));
}
console.log(`Review warnings: ${warnings.length}`);
warnings.forEach(x => console.warn(`WARN ${x}`));
if (problems.length) { problems.forEach(x => console.error(`ERROR ${x}`)); process.exitCode = 1; } else console.log('Catalog validation passed.');
