import fs from 'node:fs/promises';

const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const catalog=await readJson('data/catalog.json');
const passport=await readJson('data/world-majors.json');
const records=new Map();
const errors=[];

for(const source of catalog.sources||[]){
  const payload=await readJson(source.path);
  for(const record of payload.adventures||[])if(record.id)records.set(record.id,{...(records.get(record.id)||{}),...record});
}
const matches=await readJson(catalog.matchLayer);
for(const [id,match] of Object.entries(matches.matches||{}))if(records.has(id))records.set(id,{...records.get(id),...match});
for(const id of catalog.removeIds||[])records.delete(id);
for(const [id,override] of Object.entries(catalog.overrides||{}))if(records.has(id))records.set(id,{...records.get(id),...override});

const majors=passport.majors||[],candidates=passport.candidates||[];
const ids=new Set();
for(const major of majors){
  if(!major.id)errors.push('Major missing id');
  else if(ids.has(major.id))errors.push(`Duplicate Major id ${major.id}`);
  else ids.add(major.id);
  if(!major.name||!major.city)errors.push(`${major.id||'Major'} missing name/city`);
  if(!['completed','registered','future'].includes(major.status))errors.push(`${major.id}: invalid status ${major.status}`);
  if(!Number.isFinite(major.lat)||!Number.isFinite(major.lon))errors.push(`${major.id}: missing map coordinates`);
  if(major.status==='completed'&&!major.recordId)errors.push(`${major.id}: completed Major must link to a canonical recordId`);
  if(major.recordId){
    const record=records.get(major.recordId);
    if(!record)errors.push(`${major.id}: recordId ${major.recordId} is not a public canonical record`);
    else if(record.kind!=='race')errors.push(`${major.id}: recordId ${major.recordId} is not kind=race`);
  }
}
for(const candidate of candidates){
  if(!candidate.id)errors.push('Candidate missing id');
  else if(ids.has(candidate.id))errors.push(`Candidate ${candidate.id} duplicates a confirmed Major id`);
  if(candidate.status!=='candidate')errors.push(`${candidate.id}: candidate must use status=candidate`);
  if(!Number.isFinite(candidate.lat)||!Number.isFinite(candidate.lon))errors.push(`${candidate.id}: missing candidate map coordinates`);
}
const currentCount=majors.filter(x=>x.membership==='current').length;
const confirmed2027=majors.filter(x=>x.membership==='current'||(x.membership==='joins-2027'&&Number(x.joinsYear)<=2027)).length;
if(Number(passport.meta?.currentMajorCount)!==currentCount)errors.push(`meta.currentMajorCount=${passport.meta?.currentMajorCount}; calculated ${currentCount}`);
if(Number(passport.meta?.confirmedMajorCountFor2027)!==confirmed2027)errors.push(`meta.confirmedMajorCountFor2027=${passport.meta?.confirmedMajorCountFor2027}; calculated ${confirmed2027}`);
if(passport.meta?.nextSeriesCheckpointOn&&!/^\d{4}-\d{2}-\d{2}$/.test(passport.meta.nextSeriesCheckpointOn))errors.push('meta.nextSeriesCheckpointOn must use YYYY-MM-DD');

if(errors.length){errors.forEach(x=>console.error(`ERROR ${x}`));process.exit(1)}
console.log(`World Majors passport validation passed: ${currentCount} current, ${confirmed2027} confirmed for 2027, ${candidates.length} candidate${candidates.length===1?'':'s'}.`);
