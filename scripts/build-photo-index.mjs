import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'data/event-photo-manifest.json');
const assetRoot = path.join(root, 'assets/event-photos');
const outputPath = path.join(root, 'data/photo-index.json');
const checkOnly = process.argv.includes('--check');
const imageExtensions = new Set(['.jpg', '.jpeg', '.png']);

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;

  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;

    const marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 1 >= buffer.length) break;

    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (sofMarkers.has(marker) && length >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5)
      };
    }
    offset += length;
  }
  return null;
}

function pngDimensions(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function imageDimensions(buffer, file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return jpegDimensions(buffer);
  if (extension === '.png') return pngDimensions(buffer);
  return null;
}

async function discoverImages(directory) {
  const found = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await discoverImages(file));
    else if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) found.push(file);
  }
  return found;
}

const toRepoPath = file => path.relative(root, file).split(path.sep).join('/');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const manifestPhotos = Array.isArray(manifest.photos) ? manifest.photos : [];
const manifestByPath = new Map(manifestPhotos.filter(photo => photo?.path).map(photo => [photo.path, photo]));
const assetFiles = await discoverImages(assetRoot);
const assetPaths = new Set(assetFiles.map(toRepoPath));
const output = [];
const failures = [];

for (const photo of manifestPhotos) {
  if (photo?.path && !assetPaths.has(photo.path)) failures.push(`${photo.source || photo.path}: manifest asset is missing at ${photo.path}`);
}

for (const file of assetFiles) {
  const assetPath = toRepoPath(file);
  const photo = manifestByPath.get(assetPath) || null;
  try {
    const buffer = await fs.readFile(file);
    const dimensions = imageDimensions(buffer, file);
    if (!dimensions?.width || !dimensions?.height) throw new Error('unsupported or unreadable image dimensions');

    if (photo && Number.isFinite(photo.pixelWidth) && photo.pixelWidth !== dimensions.width) {
      throw new Error(`manifest pixelWidth ${photo.pixelWidth} does not match asset width ${dimensions.width}`);
    }
    if (photo && Number.isFinite(photo.pixelHeight) && photo.pixelHeight !== dimensions.height) {
      throw new Error(`manifest pixelHeight ${photo.pixelHeight} does not match asset height ${dimensions.height}`);
    }

    output.push({
      path: assetPath,
      manifested: Boolean(photo),
      eventId: photo?.eventId || null,
      eventName: photo?.eventName || null,
      date: photo?.date || null,
      status: photo?.status || null,
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio: Number((dimensions.width / dimensions.height).toFixed(6)),
      ...(photo?.caption ? { caption: photo.caption } : {}),
      ...(photo?.photographer ? { photographer: photo.photographer } : {})
    });
  } catch (error) {
    failures.push(`${photo?.source || assetPath}: ${error.message}`);
  }
}

if (failures.length) {
  throw new Error(`Photo index build failed (${failures.length})\n${failures.map(item => `- ${item}`).join('\n')}`);
}

output.sort((a, b) => a.path.localeCompare(b.path));
const payload = {
  schemaVersion: 1,
  generatedFrom: ['assets/event-photos', 'data/event-photo-manifest.json'],
  photoCount: output.length,
  manifestPhotoCount: manifestPhotos.length,
  unmanifestedCount: output.length - manifestPhotos.length,
  photos: output
};
const serialized = `${JSON.stringify(payload, null, 2)}\n`;

if (checkOnly) {
  let existing = '';
  try { existing = await fs.readFile(outputPath, 'utf8'); }
  catch { throw new Error('data/photo-index.json is missing; run npm run build:photo-index.'); }
  if (existing !== serialized) throw new Error('data/photo-index.json is stale; run npm run build:photo-index.');
  console.log(`Photo index validation passed for ${output.length} event-photo assets (${manifestPhotos.length} manifest-backed).`);
} else {
  await fs.writeFile(outputPath, serialized);
  console.log(`Photo index built for ${output.length} event-photo assets (${manifestPhotos.length} manifest-backed).`);
}