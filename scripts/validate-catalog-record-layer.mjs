import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { compileCatalogRecordLayer } from './lib/compile-catalog-record-layer.mjs';

const manifest = JSON.parse(await fs.readFile('data/catalog.json', 'utf8'));
const outputPath = manifest.compiledRecordLayer || 'data/catalog-layers/records.json';
const committed = JSON.parse(await fs.readFile(outputPath, 'utf8'));
const expected = await compileCatalogRecordLayer(manifest);

try {
  assert.deepStrictEqual(committed, expected);
} catch {
  console.error(`Compiled catalog record layer is stale or inconsistent: ${outputPath}`);
  console.error('Run npm run build:catalog-layer and commit the generated layer.');
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log(`Compiled catalog record layer validated: ${expected.recordCount} records from ${expected.sourceCount} evidence files with ${expected.layeredMergeCount} layered merges.`);
}
