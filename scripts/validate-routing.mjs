import fs from 'node:fs';
const shared=fs.readFileSync('shared.js','utf8');
const fallback=fs.readFileSync('404.html','utf8');
const normalizer=fs.readFileSync('clean-route-normalizer.js','utf8');
const errors=[];
if(!shared.includes("productionHost='almanac.alexlford.com'"))errors.push('shared.js production host is not almanac.alexlford.com');
if(!shared.includes('`/record/${encodeURIComponent(record.slug || record.id)}/`'))errors.push('shared.js does not emit clean production record routes');
if(!fallback.includes("clean.match(/^record\\/([^/]+)$/)"))errors.push('404.html does not recognize /record/<slug>/ routes');
for(const [route,file] of Object.entries({map:'index.html',timeline:'timeline.html',activities:'activities.html',races:'races.html',summits:'summits.html',skiing:'skiing.html',nordic:'nordic.html',mtb:'mountain-biking.html',adventures:'adventures.html',overview:'overview.html'}))if(!fallback.includes(`${route}:'${file}'`))errors.push(`404.html missing route mapping for ${route}`);
if(!normalizer.includes('history.replaceState'))errors.push('clean route normalizer does not restore clean browser URL');
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('Routing validation passed.');
