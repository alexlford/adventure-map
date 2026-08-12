import { resolvePublicRecords } from './lib/resolve-public-records.mjs';

const records = await resolvePublicRecords();
const seen = new Map();
const problems = [];

for (const record of records) {
  const slug = record.slug;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) problems.push(`${record.id}: invalid slug ${slug || '(missing)'}`);
  if (seen.has(slug)) problems.push(`${record.id}: slug ${slug} duplicates ${seen.get(slug)}`);
  else seen.set(slug, record.id);
}

console.log(`Record slugs: ${seen.size}`);
if (problems.length) {
  problems.forEach(x => console.error(`ERROR ${x}`));
  process.exitCode = 1;
} else {
  console.log('Record slug validation passed.');
}
