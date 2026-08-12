import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceSourceManifest } from './lib/compile-catalog-record-layer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const catalog = await readJson('data/catalog.json');
const { manifest, orderedSources } = await loadEvidenceSourceManifest(catalog);
const problems = [];

if (catalog.sources) problems.push('data/catalog.json must not contain inline sources');
if (manifest.schemaVersion !== 1) problems.push(`${catalog.evidenceManifest}: expected schemaVersion 1`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.updatedOn || '')) problems.push(`${catalog.evidenceManifest}: updatedOn must use YYYY-MM-DD`);

const requiredLayers = ['base', 'recovered', 'confirmed', 'editorial', 'activity', 'official'];
const definitions = manifest.layerDefinitions || {};
for (const layer of requiredLayers) {
  if (typeof definitions[layer] !== 'string' || !definitions[layer].trim()) problems.push(`${catalog.evidenceManifest}: missing layer definition ${layer}`);
}

const sourceIds = new Set();
const sourcePaths = new Set();
for (const source of manifest.sources || []) {
  if (!source.id || sourceIds.has(source.id)) problems.push(`${catalog.evidenceManifest}: duplicate or missing source id ${source.id || '(missing)'}`);
  if (!source.path || sourcePaths.has(source.path)) problems.push(`${catalog.evidenceManifest}: duplicate or missing source path ${source.path || '(missing)'}`);
  if (!definitions[source.layer]) problems.push(`${source.id || source.path}: unknown evidence layer ${source.layer || '(missing)'}`);
  if (typeof source.description !== 'string' || !source.description.trim()) problems.push(`${source.id || source.path}: missing source description`);
  sourceIds.add(source.id);
  sourcePaths.add(source.path);

  try {
    const payload = await readJson(source.path);
    if (!Array.isArray(payload.adventures)) problems.push(`${source.path}: expected adventures array`);
  } catch (error) {
    problems.push(`${source.path}: cannot read evidence source (${error.message})`);
  }
}

if (orderedSources.length !== sourceIds.size) problems.push(`${catalog.evidenceManifest}: loadOrder does not cover every source exactly once`);
if (orderedSources[0]?.layer !== 'base') problems.push(`${catalog.evidenceManifest}: first source must be a base layer`);
const firstOfficialIndex = orderedSources.findIndex(source => source.layer === 'official');
if (firstOfficialIndex < 0) problems.push(`${catalog.evidenceManifest}: no official-result sources are defined`);
else {
  for (const source of orderedSources.slice(firstOfficialIndex)) {
    if (source.layer !== 'official') problems.push(`${catalog.evidenceManifest}: non-official source ${source.id} appears after official-result precedence begins`);
  }
}

const layerCounts = Object.fromEntries(requiredLayers.map(layer => [layer, orderedSources.filter(source => source.layer === layer).length]));
console.log(`Evidence sources: ${orderedSources.length}`);
console.log(`Evidence layers: ${requiredLayers.map(layer => `${layer}=${layerCounts[layer]}`).join(', ')}`);
console.log(`Official precedence begins at source ${firstOfficialIndex + 1} of ${orderedSources.length}.`);
if (problems.length) {
  problems.forEach(problem => console.error(`ERROR ${problem}`));
  process.exitCode = 1;
} else {
  console.log('Evidence source manifest validation passed.');
}
