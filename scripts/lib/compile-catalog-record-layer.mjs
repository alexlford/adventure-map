import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));

export async function loadEvidenceSourceManifest(catalog = null) {
  const activeCatalog = catalog || await readJson('data/catalog.json');
  if (!activeCatalog.evidenceManifest || typeof activeCatalog.evidenceManifest !== 'string') {
    throw new Error('Catalog is missing evidenceManifest');
  }
  if (activeCatalog.sources) throw new Error('Catalog must not define inline sources; use evidenceManifest');

  const manifest = await readJson(activeCatalog.evidenceManifest);
  if (!Array.isArray(manifest.sources) || !Array.isArray(manifest.loadOrder)) {
    throw new Error(`${activeCatalog.evidenceManifest}: expected sources and loadOrder arrays`);
  }

  const sourceById = new Map();
  for (const source of manifest.sources) {
    if (!source?.id || typeof source.id !== 'string') throw new Error(`${activeCatalog.evidenceManifest}: source missing id`);
    if (!source?.path || typeof source.path !== 'string') throw new Error(`${activeCatalog.evidenceManifest}: source ${source.id} missing path`);
    if (sourceById.has(source.id)) throw new Error(`${activeCatalog.evidenceManifest}: duplicate source id ${source.id}`);
    sourceById.set(source.id, source);
  }

  const orderedSources = [];
  const seenOrderIds = new Set();
  for (const id of manifest.loadOrder) {
    if (seenOrderIds.has(id)) throw new Error(`${activeCatalog.evidenceManifest}: loadOrder contains duplicate id ${id}`);
    const source = sourceById.get(id);
    if (!source) throw new Error(`${activeCatalog.evidenceManifest}: loadOrder references unknown source ${id}`);
    seenOrderIds.add(id);
    orderedSources.push(source);
  }
  for (const id of sourceById.keys()) {
    if (!seenOrderIds.has(id)) throw new Error(`${activeCatalog.evidenceManifest}: source ${id} is missing from loadOrder`);
  }

  return { catalog: activeCatalog, manifest, orderedSources };
}

export async function compileCatalogRecordLayer(catalog = null) {
  const { orderedSources } = await loadEvidenceSourceManifest(catalog);
  const records = new Map();
  const sourceTrailById = new Map();
  const sourcePaths = new Set();
  const layeredMerges = [];

  for (const source of orderedSources) {
    if (sourcePaths.has(source.path)) throw new Error(`evidence manifest contains duplicate path ${source.path}`);
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

export async function writeCatalogRecordLayer(catalog = null) {
  const activeCatalog = catalog || await readJson('data/catalog.json');
  const outputPath = activeCatalog.compiledRecordLayer || 'data/catalog-layers/records.json';
  const payload = await compileCatalogRecordLayer(activeCatalog);
  const absolute = path.join(root, outputPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`);
  return { outputPath, payload };
}
