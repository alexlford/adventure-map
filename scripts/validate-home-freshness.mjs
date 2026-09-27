import fs from 'node:fs/promises';

const [html, ledger, publicRecords] = await Promise.all([
  fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('../data/archive-additions.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/public-records.json', import.meta.url), 'utf8').then(JSON.parse)
]);

const recordsById = new Map((publicRecords.records || []).map(record => [record.id, record]));
const featured = (ledger.entries || []).find(entry => entry.featured) || ledger.entries?.[0];
const record = featured && recordsById.get(featured.recordId);
const problems = [];

if (!html.includes('id="recently-added-list"')) problems.push('index.html must contain #recently-added-list.');
if (!html.includes('id="archiveSnapshot"')) problems.push('index.html must contain #archiveSnapshot.');
if (!featured || !record) problems.push('Archive additions must resolve a featured homepage record.');
else {
  if (!html.includes(`data-record-id="${featured.recordId}"`)) problems.push(`Static homepage fallback is missing featured record ${featured.recordId}.`);
  if (!html.includes(`data-added-at="${featured.addedAt}"`)) problems.push(`Static homepage fallback is missing featured addedAt ${featured.addedAt}.`);
  if (!html.includes(`record/${record.slug}/`)) problems.push(`Static homepage fallback does not link to ${record.slug}.`);
}

if (problems.length) {
  problems.forEach(problem => console.error(`ERROR ${problem}`));
  process.exit(1);
}
console.log(`Homepage freshness fallback matches ${featured.recordId} added ${featured.addedAt}.`);
