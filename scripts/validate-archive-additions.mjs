import fs from 'node:fs/promises';

const ledgerPath = new URL('../data/archive-additions.json', import.meta.url);
const recordsPath = new URL('../data/public-records.json', import.meta.url);

const [ledger, publicRecords] = await Promise.all([
  fs.readFile(ledgerPath, 'utf8').then(JSON.parse),
  fs.readFile(recordsPath, 'utf8').then(JSON.parse)
]);

const errors = [];
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const commitSha = /^[0-9a-f]{40}$/i;
const today = new Date().toISOString().slice(0, 10);
const recordIds = new Set((publicRecords.records || []).map(record => record.id));
const seen = new Set();

if (ledger?.schemaVersion !== 1) errors.push('data/archive-additions.json must use schemaVersion 1.');
if (!Array.isArray(ledger?.entries) || ledger.entries.length === 0) errors.push('data/archive-additions.json must contain at least one entry.');

let previousAddedAt = null;
let featuredCount = 0;
for (const [index, entry] of (ledger.entries || []).entries()) {
  const label = `entries[${index}]`;
  if (!entry || typeof entry !== 'object') {
    errors.push(`${label} must be an object.`);
    continue;
  }

  if (!entry.recordId || typeof entry.recordId !== 'string') errors.push(`${label}.recordId must be a non-empty string.`);
  else {
    if (seen.has(entry.recordId)) errors.push(`${label}.recordId duplicates ${entry.recordId}.`);
    seen.add(entry.recordId);
    if (!recordIds.has(entry.recordId)) errors.push(`${label}.recordId ${entry.recordId} does not exist in data/public-records.json.`);
  }

  if (!isoDate.test(entry.addedAt || '') || Number.isNaN(Date.parse(`${entry.addedAt}T00:00:00Z`))) {
    errors.push(`${label}.addedAt must be a valid YYYY-MM-DD date.`);
  } else {
    if (entry.addedAt > today) errors.push(`${label}.addedAt ${entry.addedAt} cannot be in the future.`);
    if (previousAddedAt && entry.addedAt > previousAddedAt) errors.push(`${label}.addedAt must not be newer than the preceding entry; keep the ledger newest-first.`);
    previousAddedAt = entry.addedAt;
  }

  if (entry.source !== 'git-history' && entry.source !== 'manual') errors.push(`${label}.source must be "git-history" or "manual".`);
  if (entry.source === 'git-history' && !commitSha.test(entry.sourceCommit || '')) errors.push(`${label}.sourceCommit must be a full 40-character commit SHA for git-history entries.`);
  if (entry.source === 'manual' && entry.sourceCommit != null && !commitSha.test(entry.sourceCommit)) errors.push(`${label}.sourceCommit must be omitted or a full 40-character commit SHA.`);

  if (entry.featured != null && typeof entry.featured !== 'boolean') errors.push(`${label}.featured must be boolean when present.`);
  if (entry.featured === true) featuredCount += 1;
}

if (featuredCount > 1) errors.push('data/archive-additions.json may mark at most one entry as featured.');

if (errors.length) {
  console.error(`Archive additions validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Archive additions validation passed for ${ledger.entries.length} entr${ledger.entries.length === 1 ? 'y' : 'ies'}.`);
