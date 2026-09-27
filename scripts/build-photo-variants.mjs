import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const manifestPath = 'data/event-photo-manifest.json';
const outputManifestPath = 'data/photo-variants.json';
const outputRoot = 'assets/generated/event-photos';
const widths = [480, 960, 1440];

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const photos = Array.isArray(manifest.photos) ? manifest.photos : [];
const canonical = photos.filter(photo => photo?.status === 'canonical' && photo.eventId && photo.path && Number.isFinite(photo.pixelWidth) && Number.isFinite(photo.pixelHeight));

const tool = (() => {
  for (const candidate of ['magick', 'convert']) {
    const probe = spawnSync(candidate, ['-version'], { stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  return null;
})();

if (!tool) {
  console.error('Responsive photo variants require ImageMagick (`magick` or `convert`).');
  process.exit(1);
}

const slug = value => String(value || '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'photo';
const variantPath = (photo, width) => {
  const base = path.basename(photo.path, path.extname(photo.path));
  return `${outputRoot}/${slug(photo.eventId)}/${slug(base)}-w${width}.webp`;
};

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });

const records = {};
let variantCount = 0;
for (const photo of canonical) {
  const availableWidths = widths.filter(width => width < photo.pixelWidth);
  if (!availableWidths.length) continue;
  const variants = [];
  for (const width of availableWidths) {
    const output = variantPath(photo, width);
    await fs.mkdir(path.dirname(output), { recursive: true });
    const resize = `${width}x>`;
    const args = tool === 'magick'
      ? [photo.path, '-auto-orient', '-resize', resize, '-strip', '-quality', '82', '-define', 'webp:method=6', output]
      : [photo.path, '-auto-orient', '-resize', resize, '-strip', '-quality', '82', '-define', 'webp:method=6', output];
    const result = spawnSync(tool, args, { encoding: 'utf8' });
    if (result.status !== 0) {
      console.error(`Failed to generate ${output}: ${result.stderr || result.stdout || `exit ${result.status}`}`);
      process.exit(1);
    }
    const height = Math.max(1, Math.round(photo.pixelHeight * (width / photo.pixelWidth)));
    variants.push({ path: output, width, height, format: 'webp' });
    variantCount += 1;
  }
  records[photo.path] = variants;
}

const payload = {
  schemaVersion: 1,
  generatedFrom: manifestPath,
  widths,
  quality: 82,
  photoCount: Object.keys(records).length,
  variantCount,
  records
};

await fs.writeFile(outputManifestPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Generated ${variantCount} responsive WebP variants for ${payload.photoCount} photos.`);
