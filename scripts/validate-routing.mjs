import fs from 'node:fs';
const shared=fs.readFileSync('shared.js','utf8');
const fallback=fs.readFileSync('404.html','utf8');
const normalizer=fs.readFileSync('clean-route-normalizer.js','utf8');
const mapApp=fs.readFileSync('app.js','utf8');
const detail=fs.readFileSync('detail.html','utf8');
const publicPages=['index.html','map.html','activities.html','timeline.html','races.html','summits.html','skiing.html','nordic.html','mountain-biking.html','adventures.html','detail.html','404.html'];
const errors=[];
if(!shared.includes("productionHost='adventures.alexlford.com'"))errors.push('shared.js production host is not adventures.alexlford.com');
if(!shared.includes('`/record/${encodeURIComponent(record.slug || record.id)}/`'))errors.push('shared.js does not emit clean production record routes');
if(!shared.includes('const pageHref'))errors.push('shared.js does not root production page links');
if(!fallback.includes("clean.match(/^record\\/([^/]+)$/)"))errors.push('404.html does not recognize /record/<slug>/ routes');
for(const [route,file] of Object.entries({home:'index.html',map:'map.html',explore:'activities.html',timeline:'timeline.html',races:'races.html',summits:'summits.html',skiing:'skiing.html',nordic:'nordic.html',mtb:'mountain-biking.html',stories:'adventures.html'}))if(!fallback.includes(`${route}:'${file}'`))errors.push(`404.html missing route mapping for ${route}`);
if(normalizer.includes('history.replaceState'))errors.push('record normalizer must not change browser history before relative data/map fetches finish');
if(!normalizer.includes('link[rel="canonical"]')||!normalizer.includes("meta[property=\"og:url\"]"))errors.push('record normalizer does not publish clean canonical/share URLs');
if(!mapApp.includes("location.hostname==='adventures.alexlford.com'"))errors.push('map app does not emit clean production record links');
if(!detail.includes("A.pageHref('map.html')"))errors.push('detail page map action is not production-safe');
if(!detail.includes("history.replaceState(null,'',A.recordHref(a))"))errors.push('detail page does not restore the clean record URL after data and map loading');
for(const file of publicPages){const text=fs.readFileSync(file,'utf8');if(text.includes('Personal Adventure Almanac'))errors.push(`${file} still exposes the old Personal Adventure Almanac branding`);}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('Routing and Adventures branding validation passed.');
