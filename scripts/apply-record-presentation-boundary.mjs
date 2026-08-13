import fs from 'node:fs/promises';

const path = new URL('../record-renderer.js', import.meta.url);
let source = await fs.readFile(path, 'utf8');

const startMarker = "  const provenanceLabel = value => value === 'personal-gps' ? 'Personal GPS route'";
const endMarker = "    : record.region || record.location || 'Adventure';\n";
const start = source.indexOf(startMarker);
const endStart = source.indexOf(endMarker, start);
if (start < 0 || endStart < 0) throw new Error('Renderer presentation helper block was not found.');
const end = endStart + endMarker.length;

const replacement = `  const P = window.AdventureRecordPresentation;\n  if (!P) return;\n  const {\n    provenanceLabel, groupFor, labelFor, dateKey, placementText, feet, inclusiveDays, uniq,\n    mediaFor, companionsFor, captionFor, typeForStory, storyThemeFor, storySpanFor,\n    storyHeadlineFor, storySecondaryFor, fmtValue, dayType\n  } = P;\n\n`;

source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;

const fmtLine = "  const fmtValue = (value, suffix = '') => Number.isFinite(value) ? `${A.fmt.format(Math.round(value * 100) / 100)}${suffix}` : '—';\n";
const dayLine = "  const dayType = record => record.mtbMode === 'downhill' ? 'Downhill MTB' : record.mtbMode === 'mixed' ? 'MTB + Downhill MTB' : 'MTB';\n";
if (!source.includes(fmtLine) || !source.includes(dayLine)) throw new Error('Renderer secondary helper declarations were not found.');
source = source.replace(fmtLine, '').replace(dayLine, '');

for (const duplicate of [
  'const provenanceLabel =', 'const groupFor =', 'const labelFor =', 'const dateKey =',
  'const placementText =', 'const feet =', 'const inclusiveDays =', 'const uniq =',
  'const mediaFor =', 'const companionsFor =', 'const captionFor =', 'const typeForStory =',
  'const storyThemeFor =', 'const storySpanFor =', 'const storyHeadlineFor =',
  'const storySecondaryFor =', 'const fmtValue =', 'const dayType ='
]) {
  if (source.includes(duplicate)) throw new Error(`Duplicate presentation helper remains: ${duplicate}`);
}

if (!source.includes('const P = window.AdventureRecordPresentation;')) throw new Error('Presentation boundary dependency was not installed.');
await fs.writeFile(path, source);
console.log('record-renderer.js now consumes AdventureRecordPresentation.');
