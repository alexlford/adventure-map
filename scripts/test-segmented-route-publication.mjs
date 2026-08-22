import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const compiler = await readFile(new URL('./build-public-routes.mjs', import.meta.url), 'utf8');
const catalogRuntime = await readFile(new URL('../route-catalog.js', import.meta.url), 'utf8');

for (const source of [compiler, catalogRuntime]) {
  assert.match(source, /Array\.isArray\(route\.segments\)/);
  assert.match(source, /routeFeatureId/);
  assert.match(source, /geometryEvidence/);
  assert.match(source, /segment\.confidence/);
}
assert.match(catalogRuntime, /feature\.properties\?\.routeFeatureId === entry\.featureId/);

console.log('Segmented route publication boundary tests passed.');
