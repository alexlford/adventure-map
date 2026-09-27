import fs from 'node:fs/promises';

const outputPath = 'data/media-coverage.json';
const checkOnly = process.argv.includes('--check');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

const [publicPayload, manifest] = await Promise.all([
  readJson('data/public-records.json'),
  readJson('data/event-photo-manifest.json')
]);
const records = publicPayload.records || [];
const photos = (manifest.photos || []).filter(photo => photo.status === 'canonical' && photo.eventId && photo.path);
const byId = new Map(records.map(record => [record.id, record]));
const mediaFor = record => (record.media || []).filter(item => item?.src && item?.alt);
const normalized = value => String(value || '').replace(/^https?:\/\/[^/]+/i, '');

let publishedManifestPhotos = 0;
let dimensionedManifestPhotos = 0;
for (const photo of photos) {
  const record = byId.get(photo.eventId);
  const item = mediaFor(record || {}).find(media => normalized(media.src).endsWith(photo.path));
  if (item) publishedManifestPhotos += 1;
  if (item && Number.isInteger(photo.pixelWidth) && Number.isInteger(photo.pixelHeight)) dimensionedManifestPhotos += 1;
}

const sportMap = new Map();
for (const record of records) {
  const sport = record.sport || 'adventure';
  const row = sportMap.get(sport) || { records: 0, recordsWithMedia: 0, photos: 0 };
  const media = mediaFor(record);
  row.records += 1;
  row.photos += media.length;
  if (media.length) row.recordsWithMedia += 1;
  sportMap.set(sport, row);
}
const sports = Object.fromEntries([...sportMap.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([sport,row]) => [sport, {
  ...row,
  coveragePercent: row.records ? Number((row.recordsWithMedia / row.records * 100).toFixed(1)) : 0
}]));
const recordsWithMedia = records.filter(record => mediaFor(record).length).length;
const photoCount = records.reduce((sum, record) => sum + mediaFor(record).length, 0);

const report = {
  schemaVersion: 1,
  recordCount: records.length,
  recordsWithMedia,
  recordsWithoutMedia: records.length - recordsWithMedia,
  recordCoveragePercent: records.length ? Number((recordsWithMedia / records.length * 100).toFixed(1)) : 0,
  publishedPhotoCount: photoCount,
  canonicalManifestPhotoCount: photos.length,
  publishedManifestPhotoCount: publishedManifestPhotos,
  dimensionedManifestPhotoCount: dimensionedManifestPhotos,
  sports,
  priorityWithoutMedia: records
    .filter(record => !mediaFor(record).length)
    .sort((a,b) => String(b.startDate || b.date || '').localeCompare(String(a.startDate || a.date || '')))
    .slice(0, 50)
    .map(record => ({ id: record.id, slug: record.slug || null, name: record.name, sport: record.sport, date: record.startDate || record.date || null }))
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (checkOnly) {
  const current = await fs.readFile(outputPath, 'utf8').catch(() => '');
  if (current !== serialized) {
    console.error(`${outputPath} is stale. Run npm run build:media-coverage and commit the result.`);
    process.exit(1);
  }
  if (publishedManifestPhotos !== photos.length) {
    console.error(`Only ${publishedManifestPhotos} of ${photos.length} canonical manifest photos are published on their records.`);
    process.exit(1);
  }
  console.log(`Published media is current: ${photoCount} photos across ${recordsWithMedia}/${records.length} records; ${publishedManifestPhotos}/${photos.length} canonical manifest photos connected.`);
} else {
  await fs.writeFile(outputPath, serialized);
  console.log(`Wrote ${outputPath}: ${photoCount} photos across ${recordsWithMedia}/${records.length} records.`);
}
