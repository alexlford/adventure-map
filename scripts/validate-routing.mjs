import fs from 'node:fs';
const shared=fs.readFileSync('shared.js','utf8');
const fallback=fs.readFileSync('404.html','utf8');
const mapApp=fs.readFileSync('app.js','utf8');
const mapPage=fs.readFileSync('map.html','utf8');
const chapterMap=fs.readFileSync('chapter-map.js','utf8');
const detail=fs.readFileSync('detail.html','utf8');
const recordRenderer=fs.readFileSync('record-renderer.js','utf8');
const sitemap=fs.readFileSync('sitemap.xml','utf8');
const publicPages=['index.html','map.html','activities.html','timeline.html','races.html','summits.html','skiing.html','nordic.html','mountain-biking.html','adventures.html','detail.html','404.html'];
const cleanRoutes={home:'/',map:'/map',explore:'/explore',timeline:'/timeline',races:'/races',summits:'/summits',skiing:'/skiing',nordic:'/nordic',mtb:'/mtb',stories:'/stories'};
const errors=[];
if(!shared.includes("productionHost='adventures.alexlford.com'"))errors.push('shared.js production host is not adventures.alexlford.com');
if(!shared.includes('`/record/${encodeURIComponent(record.slug || record.id)}/`'))errors.push('shared.js does not emit clean production record routes');
if(!shared.includes('const PUBLIC_PATHS='))errors.push('shared.js does not define clean production page routes');
for(const route of Object.values(cleanRoutes))if(!shared.includes(`'${route}'`)&&!shared.includes(`:${JSON.stringify(route)}`))errors.push(`shared.js missing clean public route ${route}`);
if(/location\.(replace|assign)|detail\.html\?record=|clean\.match\(\/\^record/.test(fallback))errors.push('404.html must be a normal not-found page, not a clean-route resolver');
if(!fallback.includes('That page is not in the archive'))errors.push('404.html missing normal not-found message');
if(!mapApp.includes("location.hostname==='adventures.alexlford.com'"))errors.push('map app does not emit clean production record links');
if(!mapPage.includes('href="index.html"')||!mapPage.includes("'index.html':'/'"))errors.push('map page must keep relative staging links and rewrite them only on production');
if(!chapterMap.includes('const A = window.AdventureSite')||!chapterMap.includes('const esc = A.esc'))errors.push('chapter map must use AdventureSite shared helpers');
if(!chapterMap.includes("A.pageHref('map.html')")||!chapterMap.includes('A.recordHref(item)'))errors.push('chapter map must use shared page and record URL helpers');
if(chapterMap.includes("location.hostname === 'adventures.alexlford.com'")||chapterMap.includes('const production ='))errors.push('chapter map must not duplicate production-host routing logic');
if(!chapterMap.includes('options?.mapLayer || pageLayer')||!chapterMap.includes('?layer=${encodeURIComponent(layer)}'))errors.push('chapter map must preserve chapter-aware full-map deep links');
if(!chapterMap.includes('const passiveMobile =')||!chapterMap.includes('dragging:!passiveMobile')||!chapterMap.includes('fitAll(){ fitRecords(currentRecords); }')||!chapterMap.includes('focus(item,zoom='))errors.push('chapter map must preserve passive-mobile, fit-all, and focus behavior');
if(!detail.includes('src="record-renderer.js"'))errors.push('detail page must load the single-pass record renderer');
if(!detail.includes('href="detail-phase4.css"')||!detail.includes('href="story-themes.css"')||!detail.includes('href="record-media.css"'))errors.push('detail page must load detail presentation styles directly');
for(const legacy of ['detail-phase4.js','story-detail.js','world-major-detail.js','record-media.js','clean-route-normalizer.js']){
  if(detail.includes(`src="${legacy}"`))errors.push(`detail page still loads legacy patch script ${legacy}`);
  if(shared.includes(`src='${legacy}'`)||shared.includes(`src="${legacy}"`))errors.push(`shared.js still injects legacy patch script ${legacy}`);
}
if(recordRenderer.includes('MutationObserver'))errors.push('record renderer must not depend on MutationObserver DOM patching');
if(!recordRenderer.includes("A.pageHref('map.html')"))errors.push('record renderer map action is not production-safe');
if(!recordRenderer.includes('await renderRecordMap(record)'))errors.push('record renderer must finish relative route loading before URL canonicalization');
if(!recordRenderer.includes("history.replaceState(null, '', A.recordHref(record))"))errors.push('record renderer does not restore the clean record URL after data and map loading');
if(!recordRenderer.includes('A.refreshMeta(description)'))errors.push('record renderer does not refresh canonical/share metadata');
if(/https:\/\/adventures\.alexlford\.com\/[a-z-]+\.html/.test(sitemap))errors.push('sitemap still publishes .html URLs');
for(const route of Object.values(cleanRoutes).filter(x=>x!=='/'))if(!sitemap.includes(`https://adventures.alexlford.com${route}`))errors.push(`sitemap missing clean route ${route}`);
for(const file of publicPages){
  const text=fs.readFileSync(file,'utf8');
  if(/\bAlmanac\b/.test(text))errors.push(`${file} exposes retired Almanac branding; use Adventures, Stories, Explore, records, or archive as appropriate`);
}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('Direct clean routing, single-pass record rendering, and Adventures branding validation passed.');
