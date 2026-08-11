(()=>{
  const A=window.AdventureSite;if(!A)return;
  const query=new URLSearchParams(location.search);
  const cleanMatch=location.pathname.match(/\/record\/([^/]+)\/?$/);
  const key=query.get('record')||query.get('id')||(cleanMatch?decodeURIComponent(cleanMatch[1]):'');
  if(!key)return;
  const uniq=items=>[...new Map(items.filter(Boolean).map(x=>[x.id,x])).values()];
  const typeFor=a=>A.adventureType(a);
  const spanFor=a=>a.endDate?`${A.formatDate(a.date)} – ${A.formatDate(a.endDate)}`:(a.date?A.formatDate(a.date):String(a.year||'—'));
  const headlineFor=a=>{
    if(a.discipline==='ski-objective'&&a.runs)return `${a.runs} runs`;
    if(a.distance)return a.distance;
    if(Number.isFinite(a.distanceMi))return `${a.distanceMi} mi`;
    return typeFor(a);
  };
  const secondaryFor=a=>{
    if(a.discipline==='ski-objective'&&Number.isFinite(a.descentM))return `${A.fmt.format(Math.round(a.descentM))} m descent`;
    if(Number.isFinite(a.elevationGainM))return `${A.fmt.format(Math.round(a.elevationGainM))} m gain`;
    return a.region||a.location||'Adventure';
  };
  Promise.all([A.load(),A.loadRelationships()]).then(([all,relationships])=>{
    const a=all.find(x=>x.id===key||x.slug===key);if(!a||a.kind!=='adventure')return;
    const stories=all.filter(x=>x.kind==='adventure').sort((x,y)=>(x.date||'').localeCompare(y.date||''));
    const chapter=Math.max(1,stories.findIndex(x=>x.id===a.id)+1);
    const rels=relationships.filter(r=>r.adventureId===a.id||(r.memberIds||[]).includes(a.id));
    const byId=new Map(all.map(x=>[x.id,x]));
    const relatedFromRelationships=rels.flatMap(r=>(r.memberIds||[]).map(id=>byId.get(id)));
    const relatedSummits=(a.linkedSummits||[]).map(id=>byId.get(id));
    const connected=uniq([...relatedFromRelationships,...relatedSummits]).filter(x=>x.id!==a.id);
    const connectedHtml=connected.length?connected.map(x=>`<a class="story-linked-record" href="${A.recordHref(x)}"><small>${A.esc(A.recordType(x))}</small><strong>${A.esc(x.name)}</strong><span>${A.esc(x.date?A.formatDate(x.date):(x.year||''))}</span></a>`).join(''):`<div class="story-linked-empty"><strong>Standalone chapter</strong><p>No separate race or summit records are required to tell this story.</p></div>`;
    const html=`<section class="story-record-editorial"><div class="story-record-folio"><span>Story ${String(chapter).padStart(2,'0')}</span><span>${A.esc(typeFor(a))}</span><span>${A.esc(a.region||'')}</span></div><div class="story-record-deck"><p class="eyebrow">The chapter</p><h2>${A.esc(a.note||'A day that earned its own chapter in Adventures.')}</h2></div><div class="story-record-at-a-glance"><article><small>When</small><strong>${A.esc(spanFor(a))}</strong></article><article><small>Where</small><strong>${A.esc(a.location||'—')}</strong></article><article><small>Scale</small><strong>${A.esc(headlineFor(a))}</strong><span>${A.esc(secondaryFor(a))}</span></article></div></section><section class="story-record-connections"><div><p class="eyebrow">Connected records</p><h3>${connected.length?`${connected.length} records inside this chapter`:'One story, one record'}</h3><p>${connected.length?'Open the individual races, summits, or outings that make up the larger story.':'This chapter stands on its own, with the route and verified activity context carrying the record.'}</p></div><div class="story-linked-grid">${connectedHtml}</div></section>`;
    const place=()=>{
      const profile=document.querySelector('.profile');if(!profile)return false;
      if(document.querySelector('.story-record-editorial'))return true;
      document.body.classList.add('story-record-page');
      document.querySelector('.hero')?.classList.add('story-record-hero');
      document.querySelector('.metrics')?.classList.add('story-record-metrics');
      const eyebrow=document.querySelector('.story-record-hero .eyebrow');if(eyebrow)eyebrow.textContent='Adventures · Story';
      profile.insertAdjacentHTML('beforebegin',html);profile.remove();
      A.refreshMeta?.(`${typeFor(a)} · ${a.location||'Alex Ford Adventures'} · ${spanFor(a)}`);
      return true;
    };
    if(place())return;const obs=new MutationObserver(()=>{if(place())obs.disconnect()});obs.observe(document.getElementById('page'),{childList:true,subtree:true});
  }).catch(e=>console.error('Story detail',e));
})();