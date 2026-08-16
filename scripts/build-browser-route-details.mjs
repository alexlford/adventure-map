import { readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../', import.meta.url).pathname);
const OUTPUT_PATH = 'data/route-detail-browser-polylines.json';
const readJson = async path => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));

function decodedLines(route) {
  if (Array.isArray(route.lines) && route.lines.length) return route.lines;
  if (Array.isArray(route.linesBase64) && route.linesBase64.length) {
    return route.linesBase64.map(value => Buffer.from(value, 'base64').toString('utf8'));
  }
  if (Array.isArray(route.linesBrotliBase64) && route.linesBrotliBase64.length) {
    return route.linesBrotliBase64.map(value => brotliDecompressSync(Buffer.from(value, 'base64')).toString('utf8'));
  }
  return null;
}

export async function buildBrowserRouteDetails() {
  const catalog = await readJson('data/route-catalog.json');
  const routes = [];

  for (const sourceFile of catalog.polylineFiles || []) {
    const payload = await readJson(sourceFile);
    for (const route of payload.routes || []) {
      const needsMaterialization = !Array.isArray(route.lines) || !route.lines.length;
      if (!needsMaterialization) continue;
      const lines = decodedLines(route);
      if (!lines?.length) continue;
      const { linesBase64, linesBrotliBase64, ...metadata } = route;
      routes.push({ ...metadata, lines, materializedFrom: sourceFile });
    }
  }

  routes.sort((a, b) => String(a.id).localeCompare(String(b.id)) || String(a.materializedFrom).localeCompare(String(b.materializedFrom)));
  return {
    encoding: 'google-polyline5',
    source: 'Materialized browser route detail from canonical GPS shards',
    sampling: 'source-preserving-browser-materialization',
    generatedFrom: 'data/route-catalog.json',
    routes,
  };
}

const output = `${JSON.stringify(await buildBrowserRouteDetails())}\n`;
await writeFile(resolve(ROOT, OUTPUT_PATH), output, 'utf8');
console.log(`Wrote ${OUTPUT_PATH} with ${JSON.parse(output).routes.length} browser-loadable routes.`);
