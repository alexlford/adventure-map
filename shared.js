window.AdventureSite = (() => {
  const fmt = new Intl.NumberFormat('en-US');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const formatDate = (value) => {
    if (!value) return '';
    const [y,m,d] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(y,m-1,d));
  };
  const formatDuration = (seconds) => {
    if (!Number.isFinite(seconds)) return '';
    const h=Math.floor(seconds/3600), m=Math.floor((seconds%3600)/60), s=Math.floor(seconds%60);
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
  };
  const raceType = (a) => a.discipline === 'marathon' ? 'Marathon' : a.discipline === 'trail' ? 'Trail race' : a.discipline === 'nordic' ? 'Nordic' : a.discipline === 'relay' ? 'Relay' : (a.distance || 'Road race');
  const verificationLabel = (a) => {
    if (a.matchConfidence === 'verified') return 'Official result';
    if (a.matchConfidence === 'confirmed') return 'User confirmed';
    if (a.matchConfidence === 'high') return 'GPS + event match';
    if (a.matchConfidence === 'probable') return 'Probable match';
    if (a.stravaActivityId) return 'GPS matched';
    return 'Archive record';
  };
  async function load() {
    const urls=['data/adventures.json','data/strava-matches.json','data/discovered-races.json','data/mined-races.json','data/notable-adventures.json','data/user-confirmed-races.json'];
    const [base,strava,discovered,mined,notable,confirmed]=await Promise.all(urls.map(u=>fetch(u).then(r=>{if(!r.ok)throw new Error(`Failed to load ${u}`);return r.json();})));
    const merged=base.adventures.map(a=>({...a,...(strava.matches?.[a.id]||{})}));
    const seen=new Set(merged.map(a=>a.id));
    [...(discovered.adventures||[]),...(mined.adventures||[]),...(confirmed.adventures||[]),...(notable.adventures||[])].forEach(a=>{if(!seen.has(a.id)){merged.push(a);seen.add(a.id);}});
    const northStar=merged.find(a=>a.id==='north-star-mountain');
    if(northStar) Object.assign(northStar,{date:'2020-09-12',stravaActivityId:'4312782595',stravaActivityName:'Quartzville',distanceKm:12.25,distanceMi:7.61,elapsedSeconds:19132,movingSeconds:12935,elevationGainM:938.1,matchConfidence:'confirmed'});
    return merged;
  }
  function ensureOverviewNav(){
    const nav=document.querySelector('.nav');
    if(nav && !nav.querySelector('a[href="overview.html"]')){
      const a=document.createElement('a');a.href='overview.html';a.textContent='Overview';a.dataset.nav='overview';nav.insertBefore(a,nav.firstChild);
    }
  }
  function shell(active){ensureOverviewNav();document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('is-active',a.dataset.nav===active));}
  ensureOverviewNav();
  return {load,esc,formatDate,formatDuration,fmt,raceType,verificationLabel,shell};
})();