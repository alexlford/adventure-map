import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const absolute = rel => path.join(root, rel);
const readJson = async rel => JSON.parse(await fs.readFile(absolute(rel), 'utf8'));
const problems = [];

const [publicPayload, routeCatalog, relationshipPayload, detailIndex] = await Promise.all([
  readJson('data/public-records.json'),
  readJson('data/route-catalog.json'),
  readJson('data/relationships.json'),
  readJson('data/route-detail-index.json')
]);
const publicIds = new Set((publicPayload.records || []).map(record => record.id).filter(Boolean));
const relationships = (relationshipPayload.relationships || [])
  .filter(rel => rel?.adventureId && Array.isArray(rel.memberIds) && rel.memberIds.length);
const routeIds = new Set();
const routeFiles = new Set();
const initialOwnerIds = new Set();
let featureCount = 0;
let referenceCount = 0;

function effectiveOwners(routeId, owners = []) {
  const override = routeCatalog.featureOverrides?.[routeId] || {};
  const effective = Array.isArray(override.adventureIds) ? override.adventureIds : owners;
  const expanded = new Set(Array.isArray(effective) ? effective : []);
  // Match route-catalog.js: relationships can promote a member route to a
  // story/challenge owner so the overview feature can anchor lazy detail.
  for (const rel of relationships) {
    if (rel.memberIds.some(memberId => expanded.has(memberId))) expanded.add(rel.adventureId);
  }
  return expanded;
}

for (const routeFile of routeCatalog.routeFiles || []) {
  if (routeFiles.has(routeFile)) {
    problems.push(`route-catalog lists ${routeFile} more than once`);
    continue;
  }
  routeFiles.add(routeFile);

  let payload;
  try {
    payload = await readJson(routeFile);
  } catch (error) {
    problems.push(`${routeFile}: unable to read route collection (${error.message})`);
    continue;
  }

  for (const [index, feature] of (payload.features || []).entries()) {
    featureCount += 1;
    const rawId = feature?.id || feature?.properties?.featureId || feature?.properties?.id;
    const where = rawId || `${routeFile} feature[${index}]`;
    if (!rawId) {
      problems.push(`${where}: route feature is missing a stable id`);
      continue;
    }
    if (routeIds.has(rawId)) problems.push(`${where}: duplicate route feature id`);
    routeIds.add(rawId);

    const override = routeCatalog.featureOverrides?.[rawId] || {};
    const effective = { ...(feature.properties || {}), ...override };
    if (!Array.isArray(effective.adventureIds)) {
      problems.push(`${where}: adventureIds must be an array`);
      continue;
    }
    if (!effective.adventureIds.length) {
      problems.push(`${where}: route feature is not linked to a public record`);
      continue;
    }
    if (new Set(effective.adventureIds).size !== effective.adventureIds.length) {
      problems.push(`${where}: adventureIds contains duplicates`);
    }
    for (const recordId of effective.adventureIds) {
      referenceCount += 1;
      if (!publicIds.has(recordId)) problems.push(`${where}: references non-public or unknown record ${recordId}`);
    }
    for (const recordId of effectiveOwners(rawId, effective.adventureIds)) {
      if (publicIds.has(recordId)) initialOwnerIds.add(recordId);
    }
  }
}

for (const routeId of Object.keys(routeCatalog.featureOverrides || {})) {
  if (!routeIds.has(routeId)) problems.push(`route-catalog featureOverrides references unknown route ${routeId}`);
}
for (const recordId of Object.keys(routeCatalog.recordOverrides || {})) {
  if (!publicIds.has(recordId)) problems.push(`route-catalog recordOverrides references non-public or unknown record ${recordId}`);
}

const allPolylineFiles = Array.isArray(routeCatalog.polylineFiles) ? routeCatalog.polylineFiles : [];
const allPolylineSet = new Set(allPolylineFiles);
const initialPolylineFiles = routeCatalog.initialPolylineFiles;
let initialPolylineBytes = 0;
let totalPolylineBytes = 0;

if (!Array.isArray(initialPolylineFiles) || !initialPolylineFiles.length) {
  problems.push('route-catalog initialPolylineFiles must be a non-empty array so full detail is not eagerly loaded');
} else {
  const initialSet = new Set();
  for (const routeFile of initialPolylineFiles) {
    if (initialSet.has(routeFile)) {
      problems.push(`route-catalog initialPolylineFiles lists ${routeFile} more than once`);
      continue;
    }
    initialSet.add(routeFile);
    if (!allPolylineSet.has(routeFile)) {
      problems.push(`route-catalog initialPolylineFiles references ${routeFile}, which is not in polylineFiles`);
      continue;
    }

    let payload;
    try {
      payload = await readJson(routeFile);
    } catch (error) {
      problems.push(`${routeFile}: unable to read initial polyline collection (${error.message})`);
      continue;
    }
    for (const [index, route] of (payload.routes || []).entries()) {
      const routeId = route?.id;
      if (!routeId) {
        problems.push(`${routeFile} route[${index}]: route is missing a stable id`);
        continue;
      }
      for (const recordId of effectiveOwners(routeId, route.adventureIds || [])) {
        if (publicIds.has(recordId)) initialOwnerIds.add(recordId);
      }
    }
  }

  if (initialSet.size >= allPolylineSet.size && allPolylineSet.size > 0) {
    problems.push('route-catalog initialPolylineFiles must defer at least one detailed polyline source');
  }

  for (const routeFile of allPolylineFiles) {
    try {
      const stats = await fs.stat(absolute(routeFile));
      totalPolylineBytes += stats.size;
      if (initialSet.has(routeFile)) initialPolylineBytes += stats.size;
    } catch (error) {
      problems.push(`${routeFile}: unable to stat polyline source (${error.message})`);
    }
  }

  for (const [recordId, detail] of Object.entries(detailIndex.records || {})) {
    if (!initialOwnerIds.has(recordId)) {
      problems.push(`${recordId}: lazy detail ${detail.file} has no initial overview route to anchor viewport loading`);
    }
  }
}

const deferredBytes = Math.max(0, totalPolylineBytes - initialPolylineBytes);
const deferredPercent = totalPolylineBytes > 0 ? (deferredBytes / totalPolylineBytes) * 100 : 0;
console.log(`Public route reference audit: ${featureCount} route features, ${referenceCount} record links`);
console.log(
  `Initial route manifest: ${initialPolylineFiles?.length || 0}/${allPolylineFiles.length} polyline files, ` +
  `${initialPolylineBytes.toLocaleString()}/${totalPolylineBytes.toLocaleString()} bytes eager, ` +
  `${deferredBytes.toLocaleString()} bytes (${deferredPercent.toFixed(1)}%) deferred`
);
if (problems.length) {
  problems.forEach(problem => console.error(`ERROR ${problem}`));
  process.exitCode = 1;
} else {
  console.log('Route reference integrity passed.');
}
