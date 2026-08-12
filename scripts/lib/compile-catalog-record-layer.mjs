import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));

export async function compileCatalogRecordLayer(manifest = await readJson('data/catalog.json')) {
  const records = new Map();
  const sourceTrailById = new Map();
  const sourcePaths = new Set();
  const layeredMerges = [];

  for (const source of manifest.sources || []) {
    if (!source?.path || typeof source.path !== 'string') throw new Error('catalog source missing path');
    if (sourcePaths.has(source.path)) throw new Error(`catalog sources contains duplicate path ${source.path}`);
    sourcePaths.add(source.path);
    const payload = await readJson(source.path);
    const localIds = new Set();
    for (const item of payload.adventures || []) {
      if (!item.id) throw new Error(`${source.path}: record missing id`);
      if (localIds.has(item.id)) throw new Error(`${source.path}: duplicate record id ${item.id} within one source`);
      localIds.add(item.id);
      if (records.has(item.id)) layeredMerges.push(`${item.id}: ${records.get(item.id)._catalogSource} → ${source.path}`);
      const trail = sourceTrailById.get(item.id) || [];
      trail.push(source.path);
      sourceTrailById.set(item.id, trail);
      records.set(item.id, { ...(records.get(item.id) || {}), ...item, _catalogSource: source.path });
    }
  }

  return {
    schemaVersion: 1,
    sourceCount: sourcePaths.size,
    recordCount: records.size,
    layeredMergeCount: layeredMerges.length,
    adventures: [...records.values()],
    sourceTrailById: Object.fromEntries(sourceTrailById),
    audit: {
      sourcePaths: [...sourcePaths],
      layeredMerges
    }
  };
}

export async function writeCatalogRecordLayer(manifest = await readJson('data/catalog.json')) {
  const outputPath = manifest.compiledRecordLayer || 'data/catalog-layers/records.json';
  const payload = await compileCatalogRecordLayer(manifest);
  const absolute = path.join(root, outputPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`);
  return { outputPath, payload };
}
