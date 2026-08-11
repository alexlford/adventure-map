window.AdventureSite = (() => {
  const fmt = new Intl.NumberFormat('en-US');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const formatDate = (value) => { if (!value) return ''; const [y,m,d] = value.split('-').map(Number); return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(y,m-1,d)); };
  const formatDuration = (seconds) => { if (!Number.isFinite(seconds)) return ''; const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=Math.floor(seconds%60); return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`; };
  const raceType = (a) => a.discipline === 'marathon' ? 'Marathon' : a.discipline === 'trail' ? 'Trail race' : a.discipline === 'nordic' ? 'Nordic ski race' : a.discipline === 'relay' ? 'Relay' : a.discipline === 'mountain-bike' ? 'Mountain bike race' : a.kind === 'race' ? (a.distance || 'Road race') : adventureType(a);
  const eventType = (a) => a.discipline === 'nordic' ? 'Nordic ski event' : a.discipline === 'ski' ? 'Ski event' : a.discipline === 'mountain-bike' ? 'Mountain bike event' : 'Event';
  const adventureType = (a) => a.discipline === 'ski-objective' ? 'Ski objective' : a.discipline === 'mountain-loop' ? 'Mountain loop' : a.discipline === 'trek' ? 'Trek / traverse' : a.discipline === 'challenge' ? 'Challenge' : a.kind === 'summit' ? 'Summit' : 'Adventure';
  const recordType = (a) => a.kind === 'race' ? raceType(a) : a.kind === 'event' ? eventType(a) : a.kind === 'summit' ? 'Summit' : adventureType(a);
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
  function ensureNav(){const nav=document.querySelector('.nav');if(!nav)return;if(!nav.querySelector('a[href="overview.html"]')){const a=document.createElement('a');a.href='overview.html';a.textContent='Overview';a.dataset.nav='overview';nav.insertBefore(a,nav.firstChild);}if(!nav.querySelector('a[href="skiing.html"]')){const a=document.createElement('a');a.href='skiing.html';a.textContent='Skiing';a.dataset.nav='skiing';const adventures=nav.querySelector('a[href="adventures.html"]');if(adventures)nav.insertBefore(a,adventures);else nav.appendChild(a);}if(!nav.querySelector('a[href="mountain-biking.html"]')){const a=document.createElement('a');a.href='mountain-biking.html';a.textContent='Mountain Biking';a.dataset.nav='mountain-biking';const adventures=nav.querySelector('a[href="adventures.html"]');if(adventures)nav.insertBefore(a,adventures);else nav.appendChild(a);}}
  function shell(active){ensureNav();document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('is-active',a.dataset.nav===active));}
  ensureNav(); return {load,loadRelationships,relationshipsFor,esc,formatDate,formatDuration,fmt,raceType,eventType,adventureType,recordType,shell};
})();
