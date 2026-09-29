import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeImageSrc, readImageDimensions } from './lib/image-dimensions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const problems = [];
const dimensionsPayload = await readJson('data/image-dimensions.json');
const photoManifest = await readJson('data/event-photo-manifest.json');
const supplementalDimensions = dimensionsPayload.images || {};

if (dimensionsPayload.schemaVersion !== 1 || typeof supplementalDimensions !== 'object' || Array.isArray(supplementalDimensions)) {
  throw new Error('data/image-dimensions.json must contain schemaVersion 1 and an images object.');
}

const manifestDimensions = {};
for (const photo of photoManifest.photos || []) {
  if (photo?.path && Number.isInteger(photo.pixelWidth) && photo.pixelWidth > 0 && Number.isInteger(photo.pixelHeight) && photo.pixelHeight > 0) {
    manifestDimensions[photo.path] = { width: photo.pixelWidth, height: photo.pixelHeight };
  }
}
const dimensionMap = { ...manifestDimensions, ...supplementalDimensions };

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] ?? null;
const parseSrcset = value => String(value || '')
  .split(',')
  .map(candidate => candidate.trim())
  .filter(Boolean)
  .map(candidate => {
    const match = candidate.match(/^(\S+)\s+(\d+)w$/i);
    return match ? { src: match[1], width: Number(match[2]) } : null;
  });
const localFileFor = src => {
  const key = normalizeImageSrc(src);
  return key ? { key, file: path.join(root, ...key.split('/')) } : null;
};
const describe = size => size ? `${size.width}x${size.height}` : 'unreadable dimensions';

async function actualDimensions(src, label) {
  const local = localFileFor(src);
  if (!local) return null;
  try {
    const size = await readImageDimensions(local.file);
    if (!size) problems.push(`${label}: unable to read dimensions from ${local.key}.`);
    return { ...local, size };
  } catch {
    problems.push(`${label}: local image is missing at ${local.key}.`);
    return { ...local, size: null };
  }
}

async function validateDimensionEntry(src, label) {
  const actual = await actualDimensions(src, label);
  if (!actual?.size) return;
  const expected = dimensionMap[actual.key];
  if (!expected) {
    problems.push(`${label}: ${actual.key} is missing dimension metadata; actual size is ${describe(actual.size)}.`);
    return;
  }
  if (expected.width !== actual.size.width || expected.height !== actual.size.height) {
    problems.push(`${label}: ${actual.key} metadata is ${expected.width}x${expected.height}, actual size is ${describe(actual.size)}.`);
  }
}

let dynamicPhotoCount = 0;
for (const [index, photo] of (photoManifest.photos || []).entries()) {
  const label = `data/event-photo-manifest.json:photo-${index + 1}`;
  if (!photo?.path) continue;
  dynamicPhotoCount += 1;
  if (manifestDimensions[photo.path] && supplementalDimensions[photo.path]) {
    problems.push(`${label}: ${photo.path} duplicates canonical manifest dimensions in data/image-dimensions.json.`);
  }
  await validateDimensionEntry(photo.path, label);
}

const memorySources = [
  'data/race-memories.json',
  'data/race-memories-archive.json',
  'data/race-memories-turkey-trots.json'
];
for (const source of memorySources) {
  const payload = await readJson(source);
  for (const [recordId, memory] of Object.entries(payload.records || {})) {
    for (const [index, photo] of (memory.photos || []).entries()) {
      const label = `${source}:${recordId}:photo-${index + 1}`;
      dynamicPhotoCount += 1;
      if (!String(photo?.src || '').trim()) problems.push(`${label}: src is required.`);
      if (!String(photo?.alt || '').trim()) problems.push(`${label}: meaningful alt text is required.`);
      if (!String(photo?.caption || '').trim()) problems.push(`${label}: a visible caption is required for archive photos.`);
      if (photo?.src) await validateDimensionEntry(photo.src, label);
    }
  }
}

const publicRecords = await readJson('data/public-records.json');
for (const record of publicRecords.records || []) {
  for (const [index, media] of (record.media || []).entries()) {
    if (!media || (media.type && media.type !== 'image')) continue;
    const label = `data/public-records.json:${record.id}:media-${index + 1}`;
    dynamicPhotoCount += 1;
    if (!String(media.src || '').trim()) problems.push(`${label}: src is required.`);
    if (!String(media.alt || '').trim()) problems.push(`${label}: meaningful alt text is required.`);
    if (media.src) await validateDimensionEntry(media.src, label);
  }
}

const rootEntries = await fs.readdir(root, { withFileTypes: true });
const htmlFiles = rootEntries.filter(entry => entry.isFile() && entry.name.endsWith('.html')).map(entry => entry.name).sort();
let staticPhotoCount = 0;
let responsivePhotoCount = 0;
for (const file of htmlFiles) {
  const html = await fs.readFile(path.join(root, file), 'utf8');
  const tags = html.match(/<img\b[^>]*>/gi) || [];
  for (const [index, tag] of tags.entries()) {
    const label = `${file}:img-${index + 1}`;
    staticPhotoCount += 1;
    const src = attr(tag, 'src');
    const alt = attr(tag, 'alt');
    const decorative = attr(tag, 'aria-hidden') === 'true' || attr(tag, 'role') === 'presentation';
    if (alt == null) problems.push(`${label}: alt attribute is required.`);
    else if (!alt.trim() && !decorative) problems.push(`${label}: meaningful alt text is required unless the image is explicitly decorative.`);
    if (attr(tag, 'decoding') !== 'async') problems.push(`${label}: decoding="async" is required.`);

    const priority = String(attr(tag, 'fetchpriority') || '').toLowerCase() === 'high';
    const loading = String(attr(tag, 'loading') || '').toLowerCase();
    if (priority && loading === 'lazy') problems.push(`${label}: high-priority images must not be lazy-loaded.`);
    if (!priority && loading !== 'lazy') problems.push(`${label}: non-priority images must use loading="lazy".`);

    const srcset = attr(tag, 'srcset');
    if (srcset) {
      responsivePhotoCount += 1;
      if (!String(attr(tag, 'sizes') || '').trim()) problems.push(`${label}: sizes is required when srcset is present.`);
      const candidates = parseSrcset(srcset);
      if (candidates.length < 2) problems.push(`${label}: srcset must contain at least two valid width-descriptor candidates.`);
      for (const [candidateIndex, candidate] of candidates.entries()) {
        if (!candidate) {
          problems.push(`${label}: srcset candidate ${candidateIndex + 1} must use a local URL and a width descriptor such as 800w.`);
          continue;
        }
        const actualCandidate = await actualDimensions(candidate.src, `${label}:srcset-${candidateIndex + 1}`);
        if (actualCandidate?.size && candidate.width !== actualCandidate.size.width) {
          problems.push(`${label}: ${actualCandidate.key} is declared as ${candidate.width}w but is actually ${actualCandidate.size.width}px wide.`);
        }
      }
    }

    if (!src) {
      problems.push(`${label}: src is required.`);
      continue;
    }
    const actual = await actualDimensions(src, label);
    if (!actual?.size) continue;
    const width = Number(attr(tag, 'width'));
    const height = Number(attr(tag, 'height'));
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      problems.push(`${label}: width and height are required for ${actual.key}; actual size is ${describe(actual.size)}.`);
    } else if (width !== actual.size.width || height !== actual.size.height) {
      problems.push(`${label}: markup is ${width}x${height}, actual ${actual.key} size is ${describe(actual.size)}.`);
    }
  }
}

console.log(`Image markup checked: ${staticPhotoCount} static images, ${responsivePhotoCount} responsive static images, ${dynamicPhotoCount} dynamic archive photos, ${Object.keys(manifestDimensions).length} manifest dimensions, ${Object.keys(supplementalDimensions).length} supplemental dimensions.`);
if (problems.length) {
  problems.forEach(problem => console.error(`ERROR ${problem}`));
  process.exitCode = 1;
} else {
  console.log('Image markup validation passed.');
}
