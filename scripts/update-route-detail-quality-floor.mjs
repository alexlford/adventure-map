import fs from 'node:fs';
import { buildMonotonicQualityFloor } from './lib/route-detail-quality.mjs';

const INDEX_PATH = 'data/route-detail-index.json';
const FLOOR_PATH = 'data/route-detail-quality-floor.json';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));

const index = readJson(INDEX_PATH);
const existing = fs.existsSync(FLOOR_PATH)
  ? readJson(FLOOR_PATH)
  : { schemaVersion: 1, generatedFrom: INDEX_PATH, records: {} };

if (existing.schemaVersion !== 1) {
  throw new Error(`Unsupported route detail quality floor schemaVersion: ${existing.schemaVersion}`);
}

const records = buildMonotonicQualityFloor(index.records || {}, existing.records || {});
const payload = {
  schemaVersion: 1,
  generatedFrom: INDEX_PATH,
  policy: 'Minimum route-detail quality for source-backed public records. Floors may improve but must not be weakened.',
  records,
};

fs.writeFileSync(FLOOR_PATH, `${JSON.stringify(payload, null, 2)}\n`);

const fullSource = Object.values(records).filter(quality => quality === 'full-source').length;
const rdp3 = Object.values(records).filter(quality => quality === 'rdp-3m').length;
console.log(`Route detail quality floor updated: ${records.length || Object.keys(records).length} protected records (${fullSource} full-source, ${rdp3} rdp-3m).`);
