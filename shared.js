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
  const PRIMARY=[['overview.html','Overview','overview'],['index.html','Map','map'],['timeline.html','Timeline','timeline'],['activities.html','Activities','activities'],['adventures.html','Adventures','adventures']];
  const ACTIVITIES=[['races.html','Races','races'],['summits.html','Summits','summits'],['skiing.html','Skiing','skiing'],['nordic.html','Nordic','nordic'],['mountain-biking.html','MTB','mountain-biking']];
  const activityKeys=new Set(ACTIVITIES.map(x=>x[2]));
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
  function inferActive(){const p=location.pathname.split('/').pop()||'overview.html';const hit=[...PRIMARY,...ACTIVITIES].find(x=>x[0]===p);return hit?.[2]||null;}
  function primaryKey(active){return activityKeys.has(active)?'activities':active;}
  function ensureNav(active=inferActive()){
    const nav=document.querySelector('.nav'); if(!nav)return;
    const top=primaryKey(active);
    nav.setAttribute('aria-label','Primary navigation');
    nav.innerHTML=PRIMARY.map(([href,text,key])=>`<a data-nav="${key}" href="${href}"${top===key?' class="is-active"':''}>${text}</a>`).join('');
    document.querySelector('.activity-subnav-wrap')?.remove();
    if(active==='activities'||activityKeys.has(active)){
      const header=document.querySelector('.site-header');if(!header)return;
      const wrap=document.createElement('div');wrap.className='activity-subnav-wrap';
      wrap.innerHTML=`<nav class="activity-subnav" aria-label="Activity chapters"><span class="activity-subnav-label">Activity chapters</span>${ACTIVITIES.map(([href,text,key])=>`<a href="${href}"${active===key?' class="is-active"':''}>${text}</a>`).join('')}</nav>`;
      header.insertAdjacentElement('afterend',wrap);
    }
  }
  function ensureFlow(active){
    document.querySelector('.chapter-flow-nav')?.remove();
    if(!activityKeys.has(active))return;
    const page=document.querySelector('.page');if(!page)return;
    const idx=ACTIVITIES.findIndex(x=>x[2]===active);const next=ACTIVITIES[idx+1];
    const nav=document.createElement('nav');nav.className='chronology-nav chapter-flow-nav';nav.setAttribute('aria-label','Continue exploring activity chapters');
    nav.innerHTML=`<a class="chronology-link" href="activities.html"><small>Activity hub</small><strong>← All activity chapters</strong></a>${next?`<a class="chronology-link next" href="${next[0]}"><small>Next chapter</small><strong>${next[1]} →</strong></a>`:`<a class="chronology-link next" href="adventures.html"><small>Continue exploring</small><strong>Adventures →</strong></a>`}`;
    page.appendChild(nav);
  }
  function shell(active){ensureNav(active);ensureFlow(active);}
  ensureNav(); return {load,loadRelationships,relationshipsFor,esc,formatDate,formatDuration,fmt,raceType,eventType,outingType,adventureType,recordType,shell};
})();

if (/detail\.html$/.test(location.pathname)) {
  const style=document.createElement('link'); style.rel='stylesheet'; style.href='detail-phase4.css'; document.head.appendChild(style);
  const script=document.createElement('script'); script.src='detail-phase4.js'; script.defer=true; document.head.appendChild(script);
}
