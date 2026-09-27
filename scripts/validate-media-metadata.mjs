import fs from 'node:fs/promises';

const manifest = JSON.parse(await fs.readFile(new URL('../data/event-photo-manifest.json', import.meta.url), 'utf8'));
const problems = [];
let dimensioned = 0;

for (const [index, photo] of (manifest.photos || []).entries()) {
  const label = photo?.source || `photo ${index + 1}`;
  const hasWidth = photo.pixelWidth != null;
  const hasHeight = photo.pixelHeight != null;
  if (hasWidth !== hasHeight) problems.push(`${label}: pixelWidth and pixelHeight must be supplied together.`);
  if (hasWidth && hasHeight) {
    if (!Number.isInteger(photo.pixelWidth) || photo.pixelWidth <= 0) problems.push(`${label}: pixelWidth must be a positive integer.`);
    if (!Number.isInteger(photo.pixelHeight) || photo.pixelHeight <= 0) problems.push(`${label}: pixelHeight must be a positive integer.`);
    if (Number.isInteger(photo.pixelWidth) && photo.pixelWidth > 0 && Number.isInteger(photo.pixelHeight) && photo.pixelHeight > 0) dimensioned += 1;
  }
}

if (problems.length) {
  problems.forEach(problem => console.error(`ERROR ${problem}`));
  process.exit(1);
}
console.log(`Media metadata validation passed; ${dimensioned} photo${dimensioned === 1 ? '' : 's'} have verified dimensions.`);
