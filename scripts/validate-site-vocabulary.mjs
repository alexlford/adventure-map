import fs from 'node:fs/promises';
import vm from 'node:vm';

const failures=[];
const source=await fs.readFile('site-routes.js','utf8');
const context={};
context.globalThis=context;
vm.runInNewContext(source,context,{filename:'site-routes.js'});
const routes=context.AdventureSiteRoutes?.routes||[];
const byKey=new Map(routes.map(route=>[route.key,route]));

const canonicalRoutes={
  home:['Home','Home'],
  explore:['Explore','Explore'],
  map:['Map','Map'],
  stories:['Stories','Stories'],
  timeline:['Timeline','Timeline'],
  races:['Races','Races'],
  summits:['Summits','Summits'],
  skiing:['Alpine Skiing','Alpine Skiing'],
  nordic:['Nordic Skiing','Nordic Skiing'],
  mtb:['Mountain Biking','Mountain Biking']
};

for(const [key,[label,navLabel]] of Object.entries(canonicalRoutes)){
  const route=byKey.get(key);
  if(!route){failures.push(`Missing canonical route: ${key}`);continue;}
  if(route.label!==label)failures.push(`${key} label must be “${label}”, found “${route.label}”`);
  if(route.navLabel!==navLabel)failures.push(`${key} navLabel must be “${navLabel}”, found “${route.navLabel}”`);
}

const primary=routes.filter(route=>route.navGroup==='primary').map(route=>route.navLabel);
const expectedPrimary=['Home','Explore','Map','Stories'];
if(JSON.stringify(primary)!==JSON.stringify(expectedPrimary)){
  failures.push(`Primary navigation must be ${expectedPrimary.join(' · ')}, found ${primary.join(' · ')}`);
}

const explore=await fs.readFile('activities.html','utf8');
for(const heading of ['Races','Summits','Alpine Skiing','Nordic Skiing','Mountain Biking','Timeline']){
  if(!explore.includes(`<h3>${heading}</h3>`))failures.push(`Explore is missing canonical chapter heading “${heading}”`);
}
for(const stale of ['<h3>Skiing</h3>','<h3>Nordic</h3>','>Explore MTB →<','>Explore skiing →<','>Explore Nordic →<']){
  if(explore.includes(stale))failures.push(`Explore still contains stale vocabulary: ${stale}`);
}

const chapterTitles={
  'skiing.html':'<title>Alpine Skiing | Alex Ford Adventures</title>',
  'nordic.html':'<title>Nordic Skiing | Alex Ford Adventures</title>',
  'mountain-biking.html':'<title>Mountain Biking | Alex Ford Adventures</title>',
  'adventures.html':'<title>Stories | Alex Ford Adventures</title>'
};
for(const [file,title] of Object.entries(chapterTitles)){
  const html=await fs.readFile(file,'utf8');
  if(!html.includes(title))failures.push(`${file} must use canonical title “${title.replace(/<\/?title>/g,'')}”`);
}

if(failures.length){
  console.error('Site vocabulary validation failed:');
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Site vocabulary is consistent.');
