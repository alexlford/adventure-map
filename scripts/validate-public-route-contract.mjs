import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const compiledPath=path.resolve(root,process.argv[2]||'tmp/public-routes.geojson');
const [payload,catalog]=await Promise.all([
  fs.readFile(compiledPath,'utf8').then(JSON.parse),
  fs.readFile(path.join(root,'data/route-catalog.json'),'utf8').then(JSON.parse)
]);
const errors=[];
const quality=catalog.qualityExpectations||{};

if(payload.type!=='FeatureCollection')errors.push('compiled routes are not a FeatureCollection');
if(payload.metadata?.featureCount!==payload.features?.length)errors.push('compiled route feature count is inconsistent');
if(!payload.features?.length)errors.push('compiled route collection is empty');

const featureId=feature=>feature.id||feature.properties?.featureId||feature.properties?.id||null;
const ids=(payload.features||[]).map(featureId).filter(Boolean);
if(new Set(ids).size!==ids.length)errors.push('compiled route collection contains duplicate feature ids');
const byId=new Map((payload.features||[]).map(feature=>[featureId(feature),feature]).filter(([id])=>id));
const pointCount=feature=>feature?.geometry?.type==='LineString'
  ? (feature.geometry.coordinates||[]).length
  : feature?.geometry?.type==='MultiLineString'
    ? (feature.geometry.coordinates||[]).reduce((sum,line)=>sum+(line||[]).length,0)
    : 0;

const actualRepairs=payload.metadata?.repairs||[];
const expectedRepairs=quality.allowedTailRecoveries||[];
const key=repair=>`${repair.routeId}#${repair.lineIndex}`;
const expectedByKey=new Map(expectedRepairs.map(repair=>[key(repair),repair]));
const actualByKey=new Map(actualRepairs.map(repair=>[key(repair),repair]));

for(const repair of actualRepairs){
  const expected=expectedByKey.get(key(repair));
  if(!expected){errors.push(`${key(repair)}: unexpected incomplete-tail recovery`);continue;}
  const maxTrim=Number(expected.maxTrimEnd??8);
  if(!Number.isInteger(repair.trimEnd)||repair.trimEnd<1||repair.trimEnd>maxTrim)errors.push(`${key(repair)}: trimEnd ${repair.trimEnd} is outside 1–${maxTrim}`);
}
for(const expected of expectedRepairs){
  if(!actualByKey.has(key(expected)))errors.push(`${key(expected)}: expected incomplete-tail recovery is missing`);
}

for(const expectation of quality.denseRoutes||[]){
  const feature=byId.get(expectation.id);
  if(!feature){errors.push(`${expectation.id}: protected dense route is missing`);continue;}
  const points=pointCount(feature);
  if(points<Number(expectation.minPoints||0))errors.push(`${expectation.id}: route regressed to ${points} points; expected at least ${expectation.minPoints}`);
  if(expectation.resolutionPrefix&&!String(feature.properties?.routeResolution||'').startsWith(expectation.resolutionPrefix))errors.push(`${expectation.id}: route resolution ${feature.properties?.routeResolution||'(missing)'} does not start with ${expectation.resolutionPrefix}`);
}

const actionsEscape=value=>String(value).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
if(errors.length){
  errors.forEach(error=>{
    console.error(`ERROR ${error}`);
    if(process.env.GITHUB_ACTIONS==='true')console.error(`::error title=Compiled route contract::${actionsEscape(error)}`);
  });
  process.exit(1);
}
console.log(`Compiled route contract passed with ${payload.features.length} features, ${actualRepairs.length} cataloged recoveries, and ${(quality.denseRoutes||[]).length} protected dense routes.`);
