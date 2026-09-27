import fs from 'node:fs/promises';

const manifestPath = 'data/event-photo-manifest.json';
const outputPath = 'data/photo-index.json';

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const photos = Array.isArray(manifest.photos) ? manifest.photos : [];

const clean = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const finite = value => Number.isFinite(value) ? value : null;

function publicPhoto(photo) {
  const width = finite(photo.pixelWidth);
  const height = finite(photo.pixelHeight);
  return {
    path: clean(photo.path),
    caption: clean(photo.caption),
    eventName: clean(photo.eventName),
    date: clean(photo.date),
    width,
    height,
    aspectRatio: width && height ? Number((width / height).toFixed(4)) : null
  };
}

const grouped = new Map();
for (const photo of photos) {
  if (photo?.status !== 'canonical' || !photo.eventId || !photo.path) continue;
  if (!grouped.has(photo.eventId)) grouped.set(photo.eventId, []);
  grouped.get(photo.eventId).push(publicPhoto(photo));
}

const records = Object.fromEntries(
  [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([recordId, recordPhotos]) => [recordId, {
      primary: recordPhotos[0],
      photos: recordPhotos
    }])
);

const payload = {
  schemaVersion: 1,
  generatedFrom: manifestPath,
  photoCount: Object.values(records).reduce((sum, record) => sum + record.photos.length, 0),
  recordCount: Object.keys(records).length,
  records
};

const serialized = `${JSON.stringify(payload, null, 2)}\n`;
const write = process.argv.includes('--write');
const check = process.argv.includes('--check');

if (write) {
  await fs.writeFile(outputPath, serialized);
  console.log(`Wrote ${outputPath}: ${payload.photoCount} photos across ${payload.recordCount} records.`);
}

if (check) {
  let current = '';
  try { current = await fs.readFile(outputPath, 'utf8'); } catch {}
  if (current !== serialized) {
    console.error(`${outputPath} is stale. Run npm run build:photo-index.`);
    process.exitCode = 1;
  } else {
    console.log(`Photo index is current: ${payload.photoCount} photos across ${payload.recordCount} records.`);
  }
}

if (!write && !check) process.stdout.write(serialized);
