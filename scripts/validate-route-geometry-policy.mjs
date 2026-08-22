import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVIDENCE_TYPE_SET,
  GEOMETRY_CLASS_SET,
  validateReviewedRoute,
} from './lib/route-geometry-quality.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = rel => fs.readFile(path.join(root, rel), 'utf8').then(JSON.parse);
const [policy, catalog] = await Promise.all([
  readJson('data/route-geometry-policy.json'),
  readJson('data/route-catalog.json'),
]);
const errors = [];

if (policy?.schemaVersion !== 1) errors.push('route geometry policy schemaVersion must be 1');
for (const value of policy?.geometryClasses || []) {
  if (!GEOMETRY_CLASS_SET.has(value)) errors.push(`policy declares unsupported geometry class ${value}`);
}
for (const value of policy?.evidenceTypes || []) {
  if (!EVIDENCE_TYPE_SET.has(value)) errors.push(`policy declares unsupported evidence type ${value}`);
}

const selectedByFeatureId = new Map();
for (const rel of catalog.polylineFiles || []) {
  const payload = await readJson(rel);
  for (const route of payload.routes || []) {
    errors.push(...validateReviewedRoute(route, payload).map(error => `${rel}: ${error}`));
    if (route.publicationSelected === true && route.id) {
      const prior = selectedByFeatureId.get(route.id);
      if (prior) errors.push(`${route.id}: multiple publicationSelected polyline sources (${prior}, ${rel})`);
      else selectedByFeatureId.set(route.id, rel);
    }
  }
}

for (const rel of catalog.routeFiles || []) {
  const payload = await readJson(rel);
  for (const feature of payload.features || []) {
    const props = feature.properties || {};
    const id = feature.id || props.featureId || props.id || '(missing id)';
    if (props.geometryClass && !GEOMETRY_CLASS_SET.has(props.geometryClass)) {
      errors.push(`${rel}: ${id}: unknown geometryClass ${props.geometryClass}`);
    }
    if (props.geometryEvidence && !EVIDENCE_TYPE_SET.has(props.geometryEvidence)) {
      errors.push(`${rel}: ${id}: unknown geometryEvidence ${props.geometryEvidence}`);
    }
    if (props.geometryEvidence === 'inferred') {
      if (!props.routeFeatureId) errors.push(`${rel}: ${id}: inferred geometry requires routeFeatureId`);
      if (!props.reconstructionConfidence) errors.push(`${rel}: ${id}: inferred geometry requires reconstructionConfidence`);
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exit(1);
}

console.log(`Route geometry policy passed: ${selectedByFeatureId.size} explicitly reviewed publication geometries.`);
