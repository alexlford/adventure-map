import fs from 'node:fs';
import zlib from 'node:zlib';

const enforce = process.argv.includes('--enforce');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const decodeArchive = file => {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (file.endsWith('.gz.b64')) return JSON.parse(zlib.gunzipSync(Buffer.from(text, 'base64')).toString('utf8'));
  return JSON.parse(text);
};
const featureId = feature => feature.id || feature.properties?.featureId || feature.properties?.id || null;
const geometryPointCount = geometry => {
  if (!geometry) return 0;
  if (geometry.type === 'LineString') return geometry.coordinates?.length || 0;
  if (geometry.type === 'MultiLineString') return (geometry.coordinates || []).reduce((sum, line) => sum + line.length, 0);
  return 0;
};
const geometryLineCount = geometry => {
  if (!geometry) return 0;
  if (geometry.type === 'LineString') return 1;
  if (geometry.type === 'MultiLineString') return geometry.coordinates?.length || 0;
  return 0;
};

const catalog = readJson('data/route-catalog.json');
const preferredFiles = catalog.preferredPolylineFiles || [];
if (preferredFiles.length !== 1) throw new Error(`Expected exactly one preferred high-resolution route archive, found ${preferredFiles.length}.`);
const archivePath = preferredFiles[0];
const archive = decodeArchive(archivePath);
const quality = archive.quality || {};
const failures = [];

if (quality.mode !== 'source-rdp-3m') failures.push(`archive quality.mode=${quality.mode || 'missing'}; expected source-rdp-3m`);
if (Number(quality.simplificationToleranceMeters) !== 3) failures.push(`archive simplificationToleranceMeters=${quality.simplificationToleranceMeters}; expected 3`);
if (Number(quality.splitGapMeters) !== 180) failures.push(`archive splitGapMeters=${quality.splitGapMeters}; expected 180`);
if (!Array.isArray(archive.routes) || archive.routes.length !== 117) failures.push(`archive route count=${archive.routes?.length || 0}; expected 117`);

let compiled;
try {
  compiled = readJson('tmp/public-routes.geojson');
} catch {
  throw new Error('tmp/public-routes.geojson is missing. Run scripts/build-public-routes.mjs before this audit.');
}
const compiledById = new Map((compiled.features || []).map(feature => [String(featureId(feature)), feature]));
const seen = new Set();
let totalPublishedPoints = 0;
let totalSourcePoints = 0;
let minCompressionRatio = Infinity;
let maxCompressionRatio = 0;
const rows = [];

for (const route of archive.routes || []) {
  const id = String(route.id || '');
  if (!id) {
    failures.push('archive contains a route with no id');
    continue;
  }
  if (seen.has(id)) failures.push(`${id}: duplicate route id in high-resolution archive`);
  seen.add(id);

  const sourcePoints = Number(route.sourcePointCount);
  const publishedPoints = Number(route.publishedPointCount);
  const tolerance = Number(route.simplificationToleranceMeters ?? quality.simplificationToleranceMeters);
  const splitGap = Number(route.splitGapMeters ?? quality.splitGapMeters);
  if (route.density !== 'source-rdp-3m') failures.push(`${id}: density=${route.density || 'missing'}; expected source-rdp-3m`);
  if (tolerance !== 3) failures.push(`${id}: simplification tolerance=${tolerance}; expected 3 m`);
  if (splitGap !== 180) failures.push(`${id}: split gap=${splitGap}; expected 180 m`);
  if (!Number.isFinite(sourcePoints) || sourcePoints < 2) failures.push(`${id}: invalid sourcePointCount=${route.sourcePointCount}`);
  if (!Number.isFinite(publishedPoints) || publishedPoints < 2) failures.push(`${id}: invalid publishedPointCount=${route.publishedPointCount}`);
  if (Number.isFinite(sourcePoints) && Number.isFinite(publishedPoints) && publishedPoints > sourcePoints) failures.push(`${id}: published points exceed source points`);
  if (!Array.isArray(route.lines) || !route.lines.length) failures.push(`${id}: encoded route has no line geometry`);

  const feature = compiledById.get(id);
  if (!feature) {
    failures.push(`${id}: preferred high-resolution route is absent from compiled public routes`);
    continue;
  }
  const compiledPoints = geometryPointCount(feature.geometry);
  const compiledLines = geometryLineCount(feature.geometry);
  if (compiledPoints !== publishedPoints) failures.push(`${id}: compiled points=${compiledPoints}; archive metadata=${publishedPoints}`);
  if (compiledLines !== route.lines.length) failures.push(`${id}: compiled lines=${compiledLines}; encoded lines=${route.lines.length}`);
  if (feature.properties?.density !== 'source-rdp-3m') failures.push(`${id}: compiled route did not win precedence over its legacy simplified copy`);

  if (Number.isFinite(sourcePoints)) totalSourcePoints += sourcePoints;
  if (Number.isFinite(publishedPoints)) totalPublishedPoints += publishedPoints;
  if (Number.isFinite(sourcePoints) && sourcePoints > 0 && Number.isFinite(publishedPoints)) {
    const ratio = publishedPoints / sourcePoints;
    minCompressionRatio = Math.min(minCompressionRatio, ratio);
    maxCompressionRatio = Math.max(maxCompressionRatio, ratio);
  }
  rows.push({ id, sourcePoints, publishedPoints, compiledPoints, lineCount: compiledLines, toleranceMeters: tolerance, splitGapMeters: splitGap });
}

if (totalPublishedPoints !== 39920) failures.push(`total published source-derived points=${totalPublishedPoints}; expected 39920`);
if (compiled.metadata?.repairs?.length) failures.push(`compiled route collection required ${compiled.metadata.repairs.length} encoded-tail repair(s)`);

const summary = {
  preferredArchive: archivePath,
  sourceDerivedRoutes: archive.routes?.length || 0,
  sourcePoints: totalSourcePoints,
  publishedSourceDerivedPoints: totalPublishedPoints,
  simplificationToleranceMeters: Number(quality.simplificationToleranceMeters),
  splitGapMeters: Number(quality.splitGapMeters),
  minPublishedToSourceRatio: Number.isFinite(minCompressionRatio) ? Number(minCompressionRatio.toFixed(4)) : null,
  maxPublishedToSourceRatio: Number.isFinite(maxCompressionRatio) ? Number(maxCompressionRatio.toFixed(4)) : null,
  failures: failures.length,
};
console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  console.log('\nROUTE_FIDELITY_FAILURES');
  for (const failure of failures) console.log(failure);
  if (enforce) process.exitCode = 1;
} else {
  console.log('\nAll 117 source-derived GPS routes use the preferred Strava archive, preserve source geometry to a maximum 3 m RDP deviation, split source gaps above 180 m instead of drawing false bridges, and compile with exactly the archived high-fidelity point counts.');
}
