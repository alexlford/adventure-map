import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));

export const slugify = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-+/g, '-');

export const recordSlug = record => record.slug || [record.date || record.year, record.name]
  .filter(Boolean)
  .map(slugify)
  .filter(Boolean)
  .join('-') || slugify(record.id);

const sportFor = record => {
  if (record.kind === 'summit') return 'mountaineering';
  if (record.discipline === 'nordic') return 'nordic-skiing';
  if (record.discipline === 'mountain-bike') return 'mountain-biking';
  if (record.discipline === 'ski-objective' || record.discipline === 'ski') return 'alpine-skiing';
  if (record.discipline === 'mountain-loop' || record.discipline === 'trek' || record.discipline === 'hike') return 'hiking';
  if (record.kind === 'race') return 'running';
  return 'adventure';
};

export const normalizeRecord = record => {
  const startDate = record.date || (record.year ? `${record.year}-01-01` : null);
  const finishDate = record.endDate || startDate;
  const officialKm = Number(record.officialDistanceKm);
  const officialMi = Number(record.officialDistanceMi);
  const recordedKm = Number(record.distanceKm);
  const recordedMi = Number(record.distanceMi);
  const hasOfficialDistance = Number.isFinite(officialKm) || Number.isFinite(officialMi) || Boolean(record.officialDistance);
  return {
    ...record,
    slug: recordSlug(record),
    recordClass: record.kind,
    sport: sportFor(record),
    startDate,
    finishDate,
    distanceInfo: {
      km: Number.isFinite(officialKm) ? officialKm : (Number.isFinite(recordedKm) ? recordedKm : null),
      mi: Number.isFinite(officialMi) ? officialMi : (Number.isFinite(recordedMi) ? recordedMi : null),
      label: record.officialDistance || record.distance || null,
      source: hasOfficialDistance ? 'official' : 'recorded'
    },
    locationInfo: {
      label: record.location || null,
      region: record.region || null,
      lat: Number.isFinite(record.lat) ? record.lat : null,
      lon: Number.isFinite(record.lon) ? record.lon : null,
      precision: record.coordinatePrecision || (Number.isFinite(record.lat) && Number.isFinite(record.lon) ? 'unknown' : null)
    },
    evidence: {
      source: record.resultSource || record.matchSource || null,
      matchSource: record.matchSource || null,
      resultSource: record.resultSource || null,
      confidence: record.matchConfidence || 'unknown'
    },
    routeInfo: {
      status: record.routeStatus || null,
      provenance: record.routeProvenance || null
    }
  };
};

export async function resolvePublicRecords() {
  const manifest = await readJson('data/catalog.json');
  const sourcePayloads = await Promise.all((manifest.sources || []).map(async source => ({ source, payload: await readJson(source.path) })));
  const records = new Map();
  for (const { source, payload } of sourcePayloads) {
    for (const item of payload.adventures || []) {
      if (!item.id) throw new Error(`${source.path}: record missing id`);
      records.set(item.id, { ...(records.get(item.id) || {}), ...item, _catalogSource: source.path });
    }
  }
  const matches = await readJson(manifest.matchLayer);
  for (const [id, match] of Object.entries(matches.matches || {})) {
    if (records.has(id)) records.set(id, { ...records.get(id), ...match });
  }
  for (const id of manifest.removeIds || []) records.delete(id);
  for (const [id, override] of Object.entries(manifest.overrides || {})) {
    if (!records.has(id)) throw new Error(`Catalog override references unknown id: ${id}`);
    records.set(id, { ...records.get(id), ...override });
  }

  // A single GPS activity can legitimately represent several public records, such as
  // multiple summits reached on one hike. Identity decisions belong in the canonical
  // catalog (layered IDs, tombstones, and explicit overrides), never in the publisher.
  const publicRecords = [...records.values()].map(normalizeRecord);
  const ids = new Set();
  const slugs = new Set();
  for (const record of publicRecords) {
    if (!record.id || ids.has(record.id)) throw new Error(`Duplicate or missing public record id: ${record.id || '(missing)'}`);
    if (!record.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug) || slugs.has(record.slug)) throw new Error(`Duplicate or invalid public record slug: ${record.slug || '(missing)'}`);
    ids.add(record.id);
    slugs.add(record.slug);
  }
  return publicRecords;
}
