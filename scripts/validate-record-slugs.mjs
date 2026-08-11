import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const slugify = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-');
const recordSlug = record => record.slug || [record.date || record.year, record.name].filter(Boolean).map(slugify).filter(Boolean).join('-') || slugify(record.id);

const manifest = await readJson('data/catalog.json');
const records = new Map();
for (const source of manifest.sources) {
  const payload = await readJson(source.path);
  for (const item of payload.adventures || []) records.set(item.id, { ...(records.get(item.id) || {}), ...item });
}
const matches = await readJson(manifest.matchLayer);
for (const [id, match] of Object.entries(matches.matches || {})) if (records.has(id)) records.set(id, { ...records.get(id), ...match });
for (const id of manifest.removeIds || []) records.delete(id);
for (const [id, override] of Object.entries(manifest.overrides || {})) if (records.has(id)) records.set(id, { ...records.get(id), ...override });

const seen = new Map();
const problems = [];
for (const record of records.values()) {
  const slug = recordSlug(record);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) problems.push(`${record.id}: invalid slug ${slug}`);
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
