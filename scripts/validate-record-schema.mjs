import { resolvePublicRecords } from './lib/resolve-public-records.mjs';
import { validatePublicRecords } from './lib/record-schema.mjs';

const records = await resolvePublicRecords();
const errors = validatePublicRecords(records);
if (errors.length) {
  errors.forEach(error => console.error(`ERROR ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Public record schema validation passed for ${records.length} resolved records.`);
}
