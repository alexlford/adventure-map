import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const problems = [];

const publicPayload = await readJson('data/public-records.json');
const publicIds = new Set((publicPayload.records || []).map(record => record.id).filter(Boolean));
const routeCatalog = await readJson('data/route-catalog.json');
const routeIds = new Set();
const routeFiles = new Set();
const polylineFiles = new Set();
let featureCount = 0;
let referenceCount = 0;

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
  }
}

for (const polylineFile of routeCatalog.polylineFiles || []) {
  if (polylineFiles.has(polylineFile)) {
    problems.push(`route-catalog lists ${polylineFile} more than once`);
    continue;
  }
  polylineFiles.add(polylineFile);
  if (routeFiles.has(polylineFile)) problems.push(`route-catalog registers ${polylineFile} as both a route file and a polyline file`);
  try {
    await readJson(polylineFile);
  } catch (error) {
    problems.push(`${polylineFile}: unable to read polyline route collection (${error.message})`);
  }
}

const publishableRouteDetailFile = name =>
  /^(?:strava-route-|story-route-|activity-route-).+\.json$/.test(name) || name === 'ski-the-sky-runs.json';
const dataEntries = await fs.readdir(path.join(root, 'data'), { withFileTypes: true });
for (const entry of dataEntries) {
  if (!entry.isFile() || !publishableRouteDetailFile(entry.name)) continue;
  const rel = `data/${entry.name}`;
  if (!routeFiles.has(rel) && !polylineFiles.has(rel)) {
    problems.push(`${rel}: publishable route detail file is not registered in route-catalog`);
  }
}

for (const routeId of Object.keys(routeCatalog.featureOverrides || {})) {
  if (!routeIds.has(routeId)) problems.push(`route-catalog featureOverrides references unknown route ${routeId}`);
}
for (const recordId of Object.keys(routeCatalog.recordOverrides || {})) {
  if (!publicIds.has(recordId)) problems.push(`route-catalog recordOverrides references non-public or unknown record ${recordId}`);
}

console.log(`Public route reference audit: ${featureCount} route features, ${referenceCount} record links, ${polylineFiles.size} polyline files`);
if (problems.length) {
  problems.forEach(problem => console.error(`ERROR ${problem}`));
  process.exitCode = 1;
} else {
  console.log('Route reference integrity passed.');
}
