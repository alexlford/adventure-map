import fs from 'node:fs/promises';
import { resolvePublicRecords } from './lib/resolve-public-records.mjs';

const records = await resolvePublicRecords();
const payload = {
  schemaVersion: 1,
  recordCount: records.length,
  records
};
await fs.writeFile('data/public-records.json', `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Compiled ${records.length} public records.`);
