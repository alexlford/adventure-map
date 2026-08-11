window.AdventureSite = (() => {
  const fmt = new Intl.NumberFormat('en-US');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const formatDate = (value) => { if (!value) return ''; const [y,m,d] = value.split('-').map(Number); return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(y,m-1,d)); };
  const formatDuration = (seconds) => { if (!Number.isFinite(seconds)) return ''; const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=Math.floor(seconds%60); return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`; };
  const raceType = (a) => a.discipline === 'marathon' ? 'Marathon' : a.discipline === 'trail' ? 'Trail race' : a.discipline === 'nordic' ? 'Nordic ski race' : a.discipline === 'relay' ? 'Relay' : a.discipline === 'mountain-bike' ? 'Mountain bike race' : a.kind === 'race' ? (a.distance || 'Road race') : adventureType(a);
  const eventType = (a) => a.discipline === 'nordic' ? 'Nordic ski event' : a.discipline === 'ski' ? 'Ski event' : a.discipline === 'mountain-bike' ? 'Mountain bike event' : 'Event';
  const outingType = (a) => a.discipline === 'nordic' ? 'Nordic outing' : a.discipline === 'mountain-bike' ? (a.mtbMode === 'downhill' ? 'Downhill MTB' : a.mtbMode === 'mixed' ? 'MTB + Downhill MTB' : 'MTB') : 'Outing';
  const adventureType = (a) => a.discipline === 'ski-objective' ? 'Ski objective' : a.discipline === 'mountain-loop' ? 'Mountain loop' : a.discipline === 'trek' ? 'Trek / traverse' : a.discipline === 'challenge' ? 'Challenge' : a.kind === 'summit' ? 'Summit' : 'Adventure';
  const recordType = (a) => a.kind === 'race' ? raceType(a) : a.kind === 'event' ? eventType(a) : a.kind === 'outing' ? outingType(a) : a.kind === 'summit' ? 'Summit' : adventureType(a);
  const productionHost='adventures.alexlford.com';
  const isProduction=()=>location.hostname===productionHost;
  const PUBLIC_PATHS={
    'index.html':'/','activities.html':'/explore','map.html':'/map','adventures.html':'/stories','timeline.html':'/timeline',
    'races.html':'/races','summits.html':'/summits','skiing.html':'/skiing','nordic.html':'/nordic','mountain-biking.html':'/mtb'
  };
  const pageHref = (href) => {
    if(!isProduction())return href;
    const raw=String(href||'');const match=raw.match(/^([^?#]+)(\?[^#]*)?(#.*)?$/);if(!match)return raw;
    const file=match[1].replace(/^\.\//,'').replace(/^\//,'');const clean=PUBLIC_PATHS[file];
    return clean?`${clean}${match[2]||''}${match[3]||''}`:raw;
  };
  const recordHref = (record) => isProduction()?`/record/${encodeURIComponent(record.slug || record.id)}/`:`detail.html?record=${encodeURIComponent(record.slug || record.id)}`;
  const PRIMARY=[['index.html','Home','home'],['activities.html','Explore','explore'],['map.html','Map','map'],['adventures.html','Stories','stories']];
  const AUX=[['timeline.html','Timeline','timeline']];
  const ACTIVITIES=[['races.html','Races','races'],['summits.html','Summits','summits'],['skiing.html','Skiing','skiing'],['nordic.html','Nordic','nordic'],['mountain-biking.html','MTB','mountain-biking']];
  const activityKeys=new Set(ACTIVITIES.map(x=>x[2]));
  const allNav=[...PRIMARY,...AUX,...ACTIVITIES];
  function normalizePublicUrl(){
    if(!isProduction())return;
    const file=location.pathname.split('/').pop();const clean=PUBLIC_PATHS[file];
    if(clean&&location.pathname!==clean)history.replaceState(null,'',`${clean}${location.search}${location.hash}`);
  }
  function rewritePublicLinks(){
    if(!isProduction())return;
    document.querySelectorAll('a[href]').forEach(a=>{const raw=a.getAttribute('href');const clean=pageHref(raw);if(clean!==raw)a.setAttribute('href',clean)});
  }
  function inferActive(){
    const path=location.pathname.replace(/\/+$/,'')||'/';
    if(isProduction()){
      const file=Object.keys(PUBLIC_PATHS).find(k=>(PUBLIC_PATHS[k].replace(/\/+$/,'')||'/')===path);
      const hit=file&&allNav.find(x=>x[0]===file);if(hit)return hit[2];
    }
    const p=location.pathname.split('/').pop()||'index.html';const hit=allNav.find(x=>x[0]===p);return hit?.[2]||null;
  }
  let catalogPromise;
  const ensureCatalog = () => {
    if (window.AdventureCatalog) return Promise.resolve(window.AdventureCatalog);
    if (!catalogPromise) catalogPromise = new Promise((resolve,reject) => {
      const script=document.createElement('script'); script.src='catalog.js'; script.onload=()=>resolve(window.AdventureCatalog); script.onerror=()=>reject(new Error('Adventure catalog loader is unavailable.')); document.head.appendChild(script);
    });
    return catalogPromise;
  };
  const load = () => ensureCatalog().then(catalog => catalog.load());
  const loadRelationships = () => ensureCatalog().then(catalog => catalog.loadRelationships());
  const relationshipsFor = (id) => ensureCatalog().then(catalog => catalog.relationshipsFor(id));
  function primaryKey(active){return active==='activities'||active==='timeline'||activityKeys.has(active)?'explore':active==='adventures'?'stories':active;}
  function applyPageIdentity(active=inferActive()){
    const primary=primaryKey(active)||'home';
    document.body.dataset.page=active||'detail';
    document.body.dataset.primary=primary;
    document.body.classList.toggle('is-activity-chapter',activityKeys.has(active));
  }
  function ensureMeta(descriptionOverride=''){
    const description=descriptionOverride||document.querySelector('meta[name="description"]')?.content||document.querySelector('.hero p')?.textContent?.trim()||'Alex Ford Adventures: races, mountains, skiing, biking and the stories behind them.';
    const detail=/detail\.html$/.test(location.pathname);
    const canonicalUrl=`${location.origin}${location.pathname}${detail?location.search:''}`;
    const set=(selector,attrs)=>{let node=document.head.querySelector(selector);if(!node){node=document.createElement(attrs.tag||'meta');document.head.appendChild(node)}Object.entries(attrs).forEach(([k,v])=>{if(k!=='tag')node.setAttribute(k,v)})};
    set('meta[name="description"]',{name:'description',content:description});
    set('link[rel="canonical"]',{tag:'link',rel:'canonical',href:canonicalUrl});
    set('meta[name="theme-color"]',{name:'theme-color',content:'#f7f4ee'});
    set('meta[property="og:site_name"]',{property:'og:site_name',content:'Alex Ford Adventures'});
    set('meta[property="og:title"]',{property:'og:title',content:document.title});
    set('meta[property="og:description"]',{property:'og:description',content:description});
    set('meta[property="og:type"]',{property:'og:type',content:'website'});
    set('meta[property="og:url"]',{property:'og:url',content:canonicalUrl});
    set('meta[name="twitter:card"]',{name:'twitter:card',content:'summary'});
    set('meta[name="twitter:title"]',{name:'twitter:title',content:document.title});
    set('meta[name="twitter:description"]',{name:'twitter:description',content:description});
  }
  function ensureAccessibility(){
    const main=document.querySelector('main');if(main&&!main.id)main.id='main-content';
    if(main&&!document.querySelector('.skip-link')){const a=document.createElement('a');a.className='skip-link';a.href='#main-content';a.textContent='Skip to content';document.body.insertAdjacentElement('afterbegin',a)}
  }
  function ensureBranding(){const footer=document.querySelector('.footer span:first-child');if(footer)footer.textContent='Alex Ford Adventures';}
  function ensureNav(active=inferActive()){
    applyPageIdentity(active);ensureBranding();rewritePublicLinks();
    const nav=document.querySelector('.nav'); if(!nav)return;
    const top=primaryKey(active);
    nav.setAttribute('aria-label','Primary navigation');
    nav.innerHTML=PRIMARY.map(([href,text,key])=>`<a data-nav="${key}" href="${pageHref(href)}"${top===key?' class="is-active" aria-current="page"':''}>${text}</a>`).join('');
    document.querySelector('.activity-subnav-wrap')?.remove();
    if(active==='timeline'||activityKeys.has(active)){
      const header=document.querySelector('.site-header');if(!header)return;
      const wrap=document.createElement('div');wrap.className='activity-subnav-wrap';
      wrap.innerHTML=`<nav class="activity-subnav" aria-label="Explore Adventures"><span class="activity-subnav-label">Explore</span>${ACTIVITIES.map(([href,text,key])=>`<a href="${pageHref(href)}"${active===key?' class="is-active" aria-current="page"':''}>${text}</a>`).join('')}<a href="${pageHref('timeline.html')}"${active==='timeline'?' class="is-active" aria-current="page"':''}>Timeline</a></nav>`;
      header.insertAdjacentElement('afterend',wrap);
    }
    requestAnimationFrame(()=>document.querySelector('.nav .is-active,.activity-subnav .is-active')?.scrollIntoView({block:'nearest',inline:'center'}));
  }
  function ensureFlow(active){
    document.querySelector('.chapter-flow-nav')?.remove();
    if(!activityKeys.has(active))return;
    const page=document.querySelector('.page');if(!page)return;
    const idx=ACTIVITIES.findIndex(x=>x[2]===active);const next=ACTIVITIES[idx+1];
    const nav=document.createElement('nav');nav.className='chronology-nav chapter-flow-nav';nav.setAttribute('aria-label','Continue exploring activity chapters');
    nav.innerHTML=`<a class="chronology-link" href="${pageHref('activities.html')}"><small>Explore</small><strong>← All activity chapters</strong></a>${next?`<a class="chronology-link next" href="${pageHref(next[0])}"><small>Next chapter</small><strong>${next[1]} →</strong></a>`:`<a class="chronology-link next" href="${pageHref('adventures.html')}"><small>Continue exploring</small><strong>Stories →</strong></a>`}`;
    page.appendChild(nav);
  }
  function shell(active){ensureNav(active);ensureFlow(active);rewritePublicLinks();}
  normalizePublicUrl();applyPageIdentity();ensureMeta();ensureAccessibility();ensureBranding();rewritePublicLinks();ensureNav(); return {load,loadRelationships,relationshipsFor,esc,formatDate,formatDuration,fmt,raceType,eventType,outingType,adventureType,recordType,recordHref,pageHref,shell,refreshMeta:ensureMeta,isProduction};
})();

if (/detail\.html$/.test(location.pathname)) {
  const style=document.createElement('link'); style.rel='stylesheet'; style.href='detail-phase4.css'; document.head.appendChild(style);
  const mediaStyle=document.createElement('link');mediaStyle.rel='stylesheet';mediaStyle.href='record-media.css';document.head.appendChild(mediaStyle);
  const script=document.createElement('script'); script.src='detail-phase4.js'; script.defer=true; document.head.appendChild(script);
  const story=document.createElement('script');story.src='story-detail.js';story.defer=true;document.head.appendChild(story);
  const major=document.createElement('script');major.src='world-major-detail.js';major.defer=true;document.head.appendChild(major);
  const media=document.createElement('script');media.src='record-media.js';media.defer=true;document.head.appendChild(media);
  const clean=document.createElement('script');clean.src='clean-route-normalizer.js';clean.defer=true;document.head.appendChild(clean);
}