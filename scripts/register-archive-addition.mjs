import fs from 'node:fs/promises';

const ledgerPath = new URL('../data/archive-additions.json', import.meta.url);
const recordsPath = new URL('../data/public-records.json', import.meta.url);
const recordId = String(process.argv[2] || '').trim();
const dateArg = String(process.argv[3] || '').trim();

if (!recordId) {
  console.error('Usage: node scripts/register-archive-addition.mjs <recordId> [YYYY-MM-DD]');
  process.exit(1);
}

const [ledger, publicRecords] = await Promise.all([
  fs.readFile(ledgerPath, 'utf8').then(JSON.parse),
  fs.readFile(recordsPath, 'utf8').then(JSON.parse)
]);
const record = (publicRecords.records || []).find(item => item.id === recordId);
if (!record) {
  console.error(`Unknown public record: ${recordId}`);
  process.exit(1);
}
if ((ledger.entries || []).some(entry => entry.recordId === recordId)) {
  console.error(`${recordId} already exists in data/archive-additions.json.`);
  process.exit(1);
}

const addedAt = dateArg || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(addedAt) || Number.isNaN(Date.parse(`${addedAt}T00:00:00Z`))) {
  console.error(`Invalid date: ${addedAt}`);
  process.exit(1);
}

ledger.entries = [
  { recordId, addedAt, source: 'manual' },
  ...(ledger.entries || [])
].sort((a, b) => b.addedAt.localeCompare(a.addedAt));

await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(`Registered ${record.name} (${recordId}) as added ${addedAt}.`);
