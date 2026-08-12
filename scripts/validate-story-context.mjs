import { resolvePublicRecords } from './lib/resolve-public-records.mjs';

const records=await resolvePublicRecords();
const errors=[];
const warnings=[];

for(const record of records){
  const at=record.id;
  if(record.companions!=null&&!Array.isArray(record.companions))errors.push(`${at}: companions must be an array`);
  const companionNames=new Set();
  for(const [i,companion] of (Array.isArray(record.companions)?record.companions:[]).entries()){
    const where=`${at}: companions[${i}]`;
    if(!companion||typeof companion!=='object'||Array.isArray(companion)){errors.push(`${where} must be an object`);continue;}
    if(typeof companion.name!=='string'||!companion.name.trim())errors.push(`${where}: missing name`);
    if(companion.relationship!=null&&(typeof companion.relationship!=='string'||!companion.relationship.trim()))errors.push(`${where}: relationship must be a non-empty string when present`);
    const key=(companion.name||'').trim().toLowerCase();
    if(key&&companionNames.has(key))errors.push(`${at}: duplicate companion ${companion.name}`);
    if(key)companionNames.add(key);
  }

  if(record.mediaPending!=null&&!Array.isArray(record.mediaPending))errors.push(`${at}: mediaPending must be an array`);
  for(const [i,item] of (Array.isArray(record.mediaPending)?record.mediaPending:[]).entries()){
    const where=`${at}: mediaPending[${i}]`;
    if(!item||typeof item!=='object'||Array.isArray(item)){errors.push(`${where} must be an object`);continue;}
    if(item.type&&item.type!=='image')warnings.push(`${where}: unsupported pending media type ${item.type}`);
    if(typeof item.targetPath!=='string'||!item.targetPath.trim())errors.push(`${where}: missing targetPath`);
    if(typeof item.alt!=='string'||!item.alt.trim())errors.push(`${where}: missing alt text`);
    if(item.caption!=null&&typeof item.caption!=='string')errors.push(`${where}: caption must be a string`);
    if(item.source!=null&&typeof item.source!=='string')errors.push(`${where}: source must be a string`);
    const target=item.targetPath||'';
    if(target.startsWith('/')||target.split(/[\\/]/).includes('..'))errors.push(`${where}: targetPath must stay inside the repository`);
    if(target&&!/^media\/[a-z0-9][a-z0-9/_-]*\.(jpe?g|png|webp)$/i.test(target))warnings.push(`${where}: targetPath should use the media/ tree and a web image extension`);
  }
}

if(errors.length){errors.forEach(x=>console.error(`ERROR ${x}`));process.exit(1)}
warnings.forEach(x=>console.warn(`WARN ${x}`));
console.log(`Story context validation passed for ${records.length} public records.`);
