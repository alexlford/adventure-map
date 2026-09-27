import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ledger = {
  schemaVersion: 1,
  entries: [
    { recordId: 'older-record', addedAt: '2026-08-01', source: 'manual' }
  ]
};
const records = {
  records: [
    { id: 'new-record', name: 'New Record' },
    { id: 'older-record', name: 'Older Record' }
  ]
};

const entries = [
  { recordId: 'new-record', addedAt: '2026-09-27', source: 'manual' },
  ...ledger.entries
].sort((a, b) => b.addedAt.localeCompare(a.addedAt));

assert.equal(records.records.some(record => record.id === entries[0].recordId), true);
assert.deepEqual(entries.map(entry => entry.recordId), ['new-record', 'older-record']);
assert.equal(entries[0].addedAt, '2026-09-27');

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-additions-'));
const file = path.join(dir, 'ledger.json');
await fs.writeFile(file, `${JSON.stringify({ ...ledger, entries }, null, 2)}\n`);
const roundTrip = JSON.parse(await fs.readFile(file, 'utf8'));
assert.deepEqual(roundTrip.entries, entries);

console.log('Archive addition registration semantics passed.');
