import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'data/event-photo-manifest.json');
const recordsPath = path.join(root, 'data/public-records.json');
const problems = [];

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const exists = async file => {
  try { await fs.access(file); return true; }
  catch { return false; }
};

const manifest = await readJson(manifestPath);
const publicRecords = await readJson(recordsPath);
const photos = Array.isArray(manifest.photos) ? manifest.photos : [];
const records = Array.isArray(publicRecords.records) ? publicRecords.records : [];
const recordIds = new Set(records.map(record => record.id).filter(Boolean));
const seenPaths = new Set();
const counts = { canonical: 0, candidate: 0, unresolved: 0 };

if (!Array.isArray(manifest.photos)) problems.push('Manifest photos must be an array.');
if (!manifest.meta || typeof manifest.meta !== 'object') problems.push('Manifest meta object is required.');

for (const [index, photo] of photos.entries()) {
  const label = photo?.source || `photo ${index + 1}`;
  const status = photo?.status;
  if (!Object.hasOwn(counts, status)) problems.push(`${label}: unsupported status ${status || '(missing)'}.`);
  else counts[status] += 1;

  if (!photo?.source) problems.push(`${label}: source filename is required.`);
  if (!photo?.path || !String(photo.path).startsWith('assets/event-photos/')) {
    problems.push(`${label}: path must live under assets/event-photos/.`);
  } else {
    if (seenPaths.has(photo.path)) problems.push(`${label}: duplicate repository path ${photo.path}.`);
    seenPaths.add(photo.path);
    if (!await exists(path.join(root, photo.path))) problems.push(`${label}: repository asset is missing at ${photo.path}.`);
  }

  if (!/^[0-9a-f]{40}$/i.test(String(photo?.repositoryBlobSha || ''))) {
    problems.push(`${label}: repositoryBlobSha must be a 40-character Git blob SHA.`);
  }

  if (status === 'canonical') {
    if (!photo.eventId) problems.push(`${label}: canonical photo requires eventId.`);
    else if (!recordIds.has(photo.eventId)) problems.push(`${label}: canonical eventId ${photo.eventId} is absent from data/public-records.json.`);
    for (const relatedId of Array.isArray(photo.relatedEventIds) ? photo.relatedEventIds : []) {
      if (!recordIds.has(relatedId)) problems.push(`${label}: relatedEventId ${relatedId} is absent from data/public-records.json.`);
    }
  }
}

const expectedCounts = {
  photoCount: photos.length,
  canonicalCount: counts.canonical,
  candidateCount: counts.candidate,
  unresolvedCount: counts.unresolved
};
for (const [field, actual] of Object.entries(expectedCounts)) {
  if (manifest.meta?.[field] !== actual) problems.push(`meta.${field} is ${manifest.meta?.[field]} but should be ${actual}.`);
}

console.log(`Event photos checked: ${photos.length} (${counts.canonical} canonical, ${counts.candidate} candidate, ${counts.unresolved} unresolved)`);
if (problems.length) {
  problems.forEach(problem => console.error(`ERROR ${problem}`));
  process.exitCode = 1;
} else {
  console.log('Event photo manifest validation passed.');
}
