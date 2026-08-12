import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagingDir = path.join(root, 'data/strava-routes-hires3.parts');
const legacyStagingDir = path.join(root, 'data/strava-routes-hires.parts');
const outputPath = path.join(root, 'data/strava-routes-hires.json.gz.b64');

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function decodeArchive(encoded, label) {
  const trimmed = encoded.trim();
  if (!trimmed.startsWith('H4sI')) throw new Error(`${label}: expected gzip base64 payload beginning with H4sI`);
  let json;
  try {
    json = zlib.gunzipSync(Buffer.from(trimmed, 'base64')).toString('utf8');
  } catch (error) {
    throw new Error(`${label}: gzip decode failed: ${error.message}`);
  }
  let payload;
  try {
    payload = JSON.parse(json);
  } catch (error) {
    throw new Error(`${label}: JSON decode failed: ${error.message}`);
  }
  validatePayload(payload, label);
  return { encoded: trimmed, payload };
}

function routePointCount(route) {
  if (Number.isFinite(Number(route.publishedPointCount))) return Number(route.publishedPointCount);
  return null;
}

function validatePayload(payload, label) {
  if (!payload || !Array.isArray(payload.routes)) throw new Error(`${label}: routes array is missing`);
  if (payload.routes.length !== 117) throw new Error(`${label}: expected 117 high-resolution routes, found ${payload.routes.length}`);
  const quality = payload.quality || {};
  if (quality.mode !== 'source-rdp-3m') throw new Error(`${label}: quality.mode must be source-rdp-3m`);
  if (Number(quality.simplificationToleranceMeters) !== 3) throw new Error(`${label}: simplification tolerance must be exactly 3 m`);
  if (Number(quality.splitGapMeters) !== 180) throw new Error(`${label}: split-gap threshold must be exactly 180 m`);

  const ids = new Set();
  let publishedPoints = 0;
  for (const route of payload.routes) {
    if (!route.id || ids.has(route.id)) throw new Error(`${label}: route IDs must be present and unique`);
    ids.add(route.id);
    if (!Array.isArray(route.lines) || !route.lines.length || route.lines.some(line => typeof line !== 'string' || !line.length)) {
      throw new Error(`${label}: ${route.id} has invalid encoded line geometry`);
    }
    if (route.density !== 'source-rdp-3m') throw new Error(`${label}: ${route.id} is not marked source-rdp-3m`);
    if (Number(route.simplificationToleranceMeters ?? quality.simplificationToleranceMeters) !== 3) {
      throw new Error(`${label}: ${route.id} has a simplification tolerance above 3 m`);
    }
    if (Number(route.splitGapMeters ?? quality.splitGapMeters) !== 180) {
      throw new Error(`${label}: ${route.id} has the wrong source-gap threshold`);
    }
    const sourceCount = Number(route.sourcePointCount);
    const publishedCount = routePointCount(route);
    if (!Number.isFinite(sourceCount) || sourceCount < 2 || !Number.isFinite(publishedCount) || publishedCount < 2 || sourceCount < publishedCount) {
      throw new Error(`${label}: ${route.id} has invalid source/published point metadata`);
    }
    publishedPoints += publishedCount;
  }
  if (publishedPoints !== 39920) throw new Error(`${label}: expected 39,920 published source-derived points, found ${publishedPoints}`);
}

let archive;
if (await exists(stagingDir)) {
  const names = (await fs.readdir(stagingDir))
    .filter(name => /^part-\d+\.b64$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!names.length) throw new Error('High-resolution route staging directory exists but contains no route parts.');
  const chunks = await Promise.all(names.map(name => fs.readFile(path.join(stagingDir, name), 'utf8')));
  archive = decodeArchive(chunks.map(chunk => chunk.trim()).join(''), `${names.length} staged route parts`);
  await fs.writeFile(outputPath, `${archive.encoded}\n`);
  console.log(`Assembled ${names.length} route parts into data/strava-routes-hires.json.gz.b64.`);
} else {
  if (!(await exists(outputPath))) throw new Error('Neither staged nor assembled high-resolution Strava route archive exists.');
  archive = decodeArchive(await fs.readFile(outputPath, 'utf8'), 'assembled route archive');
  console.log('High-resolution route archive is already assembled and valid.');
}

if (await exists(stagingDir)) await fs.rm(stagingDir, { recursive: true, force: true });
if (await exists(legacyStagingDir)) await fs.rm(legacyStagingDir, { recursive: true, force: true });
console.log(`Validated ${archive.payload.routes.length} source-derived routes with 39,920 published points, 3 m maximum RDP deviation, and 180 m source-gap splitting.`);
