import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const manifest = await readJson('data/catalog.json');

const records = new Map();
for (const source of manifest.sources || []) {
  const payload = await readJson(source.path);
  for (const item of payload.adventures || []) {
    if (!item?.id) continue;
    records.set(item.id, { ...(records.get(item.id) || {}), ...item, _catalogSource: source.path });
  }
}

const matches = await readJson(manifest.matchLayer);
for (const [id, match] of Object.entries(matches.matches || {})) {
  if (records.has(id)) records.set(id, { ...records.get(id), ...match });
}
for (const id of manifest.removeIds || []) records.delete(id);
for (const [id, override] of Object.entries(manifest.overrides || {})) {
  if (records.has(id)) records.set(id, { ...records.get(id), ...override });
}

const races = [...records.values()].filter(record => record.kind === 'race');
const errors = [];
const warnings = [];

const normalize = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const genericNameTokens = new Set([
  'race','run','running','event','classic','challenge','festival','the',
  '5k','8k','10k','15k','25k','50k','half','marathon','mile','miler','miles',
  'turkey','trot','virtual'
]);
const nameTokens = record => new Set(normalize(record.name).split(/\s+/).filter(token => token && !genericNameTokens.has(token)));
const jaccard = (a,b) => {
  const union = new Set([...a,...b]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / union.size;
};
const distanceMi = record => {
  const official = Number(record.officialDistanceMi);
  if (Number.isFinite(official)) return official;
  const recorded = Number(record.distanceMi);
  return Number.isFinite(recorded) ? recorded : null;
};
const locationKey = record => normalize(record.location || record.region);

const byActivity = new Map();
for (const race of races) {
  if (race.stravaActivityId == null) continue;
  const key = String(race.stravaActivityId);
  if (!byActivity.has(key)) byActivity.set(key, []);
  byActivity.get(key).push(race);
}
for (const [activityId, group] of byActivity) {
  if (group.length < 2) continue;
  errors.push(`Strava activity ${activityId} is assigned to multiple public race records: ${group.map(x => x.id).join(', ')}`);
}

const exactFingerprints = new Map();
for (const race of races) {
  const key = [race.date || race.year || '', normalize(race.name), locationKey(race)].join('|');
  if (!exactFingerprints.has(key)) exactFingerprints.set(key, []);
  exactFingerprints.get(key).push(race);
}
for (const [fingerprint, group] of exactFingerprints) {
  if (group.length < 2) continue;
  errors.push(`Exact race fingerprint ${fingerprint} is represented by multiple ids: ${group.map(x => x.id).join(', ')}`);
}

for (let i = 0; i < races.length; i += 1) {
  const a = races[i];
  for (let j = i + 1; j < races.length; j += 1) {
    const b = races[j];
    if (!a.date || a.date !== b.date) continue;
    if (!locationKey(a) || locationKey(a) !== locationKey(b)) continue;
    const da = distanceMi(a), db = distanceMi(b);
    if (da == null || db == null || Math.abs(da - db) > 0.2) continue;
    const similarity = jaccard(nameTokens(a), nameTokens(b));
    if (similarity >= 0.72) warnings.push(`Possible duplicate race on ${a.date}: ${a.id} (${a.name}) vs ${b.id} (${b.name}); same location, similar distance, name similarity ${similarity.toFixed(2)}`);
  }
}

console.log(`Duplicate audit: ${races.length} public race records`);
console.log(`Shared Strava activity conflicts: ${errors.filter(x => x.startsWith('Strava activity')).length}`);
console.log(`Exact fingerprint conflicts: ${errors.filter(x => x.startsWith('Exact race fingerprint')).length}`);
console.log(`Fuzzy duplicate candidates: ${warnings.length}`);
warnings.forEach(message => console.warn(`WARN ${message}`));
if (errors.length) {
  errors.forEach(message => console.error(`ERROR ${message}`));
  process.exitCode = 1;
} else {
  console.log('Duplicate race validation passed.');
}
