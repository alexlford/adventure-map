(() => {
  const skiColor=window.AdventureMapTheme?.colors?.skiing||'#2f8ca6';
  CATEGORY.ski = { label: 'Ski resort', color: skiColor };
  if(CATEGORY.skiing)CATEGORY.skiing.color=skiColor;
  const priorPopupCard=window.popupCard,priorItemMeta=window.itemMeta,priorItemValue=window.itemValue;
  window.itemMeta=function(a){if(a.kind==='ski')return[a.region,`${a.skiDays} recorded day${a.skiDays===1?'':'s'}`].filter(Boolean).join(' · ');return priorItemMeta(a)};
  window.itemValue=function(a){if(a.kind==='ski')return`${a.skiDays} day${a.skiDays===1?'':'s'}`;return priorItemValue(a)};
  window.popupCard=function(a){if(a.kind!=='ski')return priorPopupCard(a);const href=location.hostname==='adventures.alexlford.com'?'/skiing':'skiing.html';return `<article class="popup-card"><p class="popup-kicker">Ski resort</p><h3 class="popup-title">${escapeHtml(a.name)}</h3><p class="popup-meta">${escapeHtml(a.region||'')}</p><p class="popup-meta"><strong>${escapeHtml(a.skiDays)}</strong> recorded ski day${a.skiDays===1?'':'s'}</p><p class="popup-detail"><a href="${href}">View ski logbook →</a></p></article>`};

  function coreUnavailable(){return document.getElementById('resultCount')?.textContent==='Unavailable'||Boolean(document.querySelector('.archive-state-error'))}
  function applySkiing(skiing,attempt=0){
    if(coreUnavailable())return;
    if(!state.routes){if(attempt<40)setTimeout(()=>applySkiing(skiing,attempt+1),100);return}
    const existingIds=new Set(state.adventures.map(x=>x.id));
    skiing.resorts.forEach(resort=>{const id=`ski-resort-${resort.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;if(existingIds.has(id))return;state.adventures.push({id,kind:'ski',discipline:'ski',name:resort.name,skiDays:resort.days,location:resort.region,region:resort.region,lat:resort.lat,lon:resort.lon,coordinatePrecision:'resort'});existingIds.add(id)});
    const skiCount=document.getElementById('skiCount');if(skiCount)skiCount.textContent=skiing.summary.resortCount;
    const shouldRefit=!state.focusId&&!state.search&&(state.filter==='all'||state.filter==='skiing');
    renderPreservingFocus();if(shouldRefit)fitVisible(filteredAdventures());
  }

  window.addEventListener('load',async()=>{try{const response=await fetch('data/skiing.json');if(!response.ok)throw new Error(`Unable to load skiing data (${response.status})`);applySkiing(await response.json())}catch(error){console.error(error)}});
})();