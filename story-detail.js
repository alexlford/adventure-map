(()=>{
  const A=window.AdventureSite;if(!A)return;
  const query=new URLSearchParams(location.search);
  const cleanMatch=location.pathname.match(/\/record\/([^/]+)\/?$/);
  const key=query.get('record')||query.get('id')||(cleanMatch?decodeURIComponent(cleanMatch[1]):'');
  if(!key)return;
  const uniq=items=>[...new Map(items.filter(Boolean).map(x=>[x.id,x])).values()];
  const typeFor=a=>A.adventureType(a);
  const themeFor=a=>a.discipline==='ski-objective'?'ski':a.discipline==='mountain-loop'?'mountain':a.discipline==='trek'?'traverse':'challenge';
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
  const feet=m=>Number.isFinite(m)?Math.round(m*3.28084):null;
  const inclusiveDays=(start,end)=>{if(!start||!end)return 1;const a=new Date(`${start}T12:00:00Z`),b=new Date(`${end}T12:00:00Z`);return Math.max(1,Math.round((b-a)/86400000)+1)};
  const cleanLegacy=()=>{
    document.querySelectorAll('.sport-detail').forEach(section=>{if(section.querySelector('h2')?.textContent?.trim()==='Adventure story')section.remove()});
    document.querySelectorAll('#page>section').forEach(section=>{if(section.querySelector('.section-title h2')?.textContent?.trim()==='Part of a larger story')section.remove()});
  };
  const relabelChronology=()=>{
    const links=[...document.querySelectorAll('.chronology-nav .chronology-link small')];
    if(links[0])links[0].textContent='Previous story';
    if(links[1])links[1].textContent='Next story';
  };
  const genericConnections=(connected)=>{
    const connectedHtml=connected.length?connected.map(x=>`<a class="story-linked-record" href="${A.recordHref(x)}"><small>${A.esc(A.recordType(x))}</small><strong>${A.esc(x.name)}</strong><span>${A.esc(x.date?A.formatDate(x.date):(x.year||''))}</span></a>`).join(''):`<div class="story-linked-empty"><strong>Standalone chapter</strong><p>No separate race or summit records are required to tell this story.</p></div>`;
    return `<section class="story-record-connections"><div><p class="eyebrow">Connected records</p><h3>${connected.length?`${connected.length} records inside this chapter`:'One story, one record'}</h3><p>${connected.length?'Open the individual races, summits, or outings that make up the larger story.':'This chapter stands on its own, with the route and verified activity context carrying the record.'}</p></div><div class="story-linked-grid">${connectedHtml}</div></section>`;
  };
  const statGrid=stats=>`<div class="story-objective-stats">${stats.filter(Boolean).map(([k,v])=>`<article><small>${A.esc(k)}</small><strong>${A.esc(v)}</strong></article>`).join('')}</div>`;
  const mountainLoopFeature=(a,summits)=>{
    if(a.discipline!=='mountain-loop'||!summits.length)return'';
    const gainFt=feet(a.elevationGainM),over14=summits.filter(s=>Number(s.elevationFt)>=14000).length;
    const stats=[Number.isFinite(a.distanceMi)?['Loop distance',`${a.distanceMi} mi`]:null,gainFt?['Recorded gain',`${A.fmt.format(gainFt)} ft`]:null,Number.isFinite(a.elapsedSeconds)?['Elapsed',A.formatDuration(a.elapsedSeconds)]:null,['Summits ≥14,000 ft',String(over14)]];
    const chain=summits.map((s,i)=>`<a class="mountain-loop-summit" href="${A.recordHref(s)}"><span class="mountain-loop-index">${String(i+1).padStart(2,'0')}</span><span class="mountain-loop-node" aria-hidden="true"></span><small>Summit</small><strong>${A.esc(s.name)}</strong><em>${Number.isFinite(s.elevationFt)?`${A.fmt.format(s.elevationFt)}′`:'Elevation not recorded'}</em></a>`).join('');
    return `<section class="mountain-loop-feature"><div class="mountain-loop-head"><div><p class="eyebrow">Objective anatomy</p><h3>${summits.length} summits. One loop.</h3></div><p>The summit sequence attached to this Adventure is shown as a single connected objective. Each peak remains independently browsable in the Summit archive.</p></div><div class="mountain-loop-stats">${stats.filter(Boolean).map(([k,v])=>`<article><small>${A.esc(k)}</small><strong>${A.esc(v)}</strong></article>`).join('')}</div><div class="mountain-loop-chain" aria-label="Linked summit sequence">${chain}</div></section>`;
  };
  const traverseFeature=a=>{
    if(a.discipline!=='trek')return'';const days=inclusiveDays(a.date,a.endDate),gainFt=feet(a.elevationGainM);
    const stats=[['Days',String(days)],Number.isFinite(a.distanceMi)?['Recorded distance',`${a.distanceMi} mi`]:null,gainFt?['Recorded gain',`${A.fmt.format(gainFt)} ft`]:null,a.region?['Range / region',a.region]:null];
    return `<section class="story-objective-feature traverse-feature"><div class="story-objective-head"><div><p class="eyebrow">Traverse anatomy</p><h3>${days} ${days===1?'day':'days'}. One traverse.</h3></div><p>This chapter emphasizes the documented span and GPS scale of the outing, with the route below carrying the geographic story.</p></div>${statGrid(stats)}</section>`;
  };
  const skiFeature=a=>{
    if(a.discipline!=='ski-objective')return'';const descentFt=feet(a.descentM);
    const stats=[Number.isFinite(a.runs)?['Recorded runs',String(a.runs)]:null,Number.isFinite(a.distanceMi)?['Recorded distance',`${a.distanceMi} mi`]:null,descentFt?['Recorded descent',`${A.fmt.format(descentFt)} ft`]:null,a.location?['Mountain',a.location]:null];
    return `<section class="story-objective-feature ski-feature"><div class="story-objective-head"><div><p class="eyebrow">Ski objective</p><h3>${Number.isFinite(a.runs)?`${a.runs} runs. `:''}One mountain chapter.</h3></div><p>Runs, distance, and recorded descent define this objective; ordinary resort days remain in the Skiing logbook instead.</p></div>${statGrid(stats)}</section>`;
  };
  const challengeFeature=(a,components)=>{
    if(a.discipline!=='challenge'||components.length<2)return'';const ordered=[...components].sort((x,y)=>(x.date||'').localeCompare(y.date||''));const days=inclusiveDays(a.date,a.endDate);
    const cards=ordered.map((x,i)=>`<a class="story-component" href="${A.recordHref(x)}"><span>${String(i+1).padStart(2,'0')}</span><small>${A.esc(A.recordType(x))}${x.date?` · ${A.esc(A.formatDate(x.date))}`:''}</small><strong>${A.esc(x.name)}</strong><em>${A.esc(x.officialTime||x.distance||(Number.isFinite(x.distanceMi)?`${x.distanceMi} mi`:'Open record'))}</em></a>`).join('');
    const stats=[['Components',String(ordered.length)],['Days',String(days)],Number.isFinite(a.distanceMi)?['Combined distance',`${a.distanceMi} mi`]:null,a.region?['Region',a.region]:null];
    return `<section class="story-objective-feature challenge-feature"><div class="story-objective-head"><div><p class="eyebrow">Chapter anatomy</p><h3>${ordered.length} components. One story.</h3></div><p>The individual races or events stay independently browsable while this Story preserves the larger challenge or weekend they formed together.</p></div>${statGrid(stats)}<div class="story-component-chain">${cards}</div></section>`;
  };
  Promise.all([A.load(),A.loadRelationships()]).then(([all,relationships])=>{
    const a=all.find(x=>x.id===key||x.slug===key);if(!a||a.kind!=='adventure')return;
    const stories=all.filter(x=>x.kind==='adventure').sort((x,y)=>(x.date||'').localeCompare(y.date||''));
    const chapter=Math.max(1,stories.findIndex(x=>x.id===a.id)+1);
    const rels=relationships.filter(r=>r.adventureId===a.id||(r.memberIds||[]).includes(a.id));
    const byId=new Map(all.map(x=>[x.id,x]));
    const relatedFromRelationships=uniq(rels.flatMap(r=>(r.memberIds||[]).map(id=>byId.get(id))).filter(Boolean));
    const relatedSummits=(a.linkedSummits||[]).map(id=>byId.get(id)).filter(Boolean);
    const genericConnected=relatedFromRelationships.filter(x=>x.id!==a.id&&!relatedSummits.some(s=>s.id===x.id));
    const allConnected=uniq([...genericConnected,...relatedSummits]).filter(x=>x.id!==a.id);
    const mountainFeature=mountainLoopFeature(a,relatedSummits),traverse=traverseFeature(a),ski=skiFeature(a),challenge=challengeFeature(a,genericConnected);
    let connections='';
    if(mountainFeature)connections=`${mountainFeature}${genericConnected.length?genericConnections(genericConnected):''}`;
    else if(challenge)connections=challenge;
    else if(traverse)connections=`${traverse}${allConnected.length?genericConnections(allConnected):''}`;
    else if(ski)connections=`${ski}${allConnected.length?genericConnections(allConnected):''}`;
    else connections=genericConnections(allConnected);
    const html=`<section class="story-record-editorial"><div class="story-record-folio"><span>Story ${String(chapter).padStart(2,'0')}</span><span>${A.esc(typeFor(a))}</span><span>${A.esc(a.region||'')}</span></div><div class="story-record-deck"><p class="eyebrow">The chapter</p><h2>${A.esc(a.note||'A day that earned its own chapter in Adventures.')}</h2></div><div class="story-record-at-a-glance"><article><small>When</small><strong>${A.esc(spanFor(a))}</strong></article><article><small>Where</small><strong>${A.esc(a.location||'—')}</strong></article><article><small>Scale</small><strong>${A.esc(headlineFor(a))}</strong><span>${A.esc(secondaryFor(a))}</span></article></div></section>${connections}`;
    const place=()=>{
      const profile=document.querySelector('.profile');if(!profile)return false;
      if(document.querySelector('.story-record-editorial'))return true;
      document.body.classList.add('story-record-page',`story-theme-${themeFor(a)}`);
      document.body.dataset.storyTheme=themeFor(a);
      document.querySelector('.hero')?.classList.add('story-record-hero');
      document.querySelector('.metrics')?.remove();
      const eyebrow=document.querySelector('.story-record-hero .eyebrow');if(eyebrow)eyebrow.textContent='Adventures · Story';
      profile.insertAdjacentHTML('beforebegin',html);profile.remove();cleanLegacy();relabelChronology();
      [50,200,600].forEach(ms=>setTimeout(()=>{cleanLegacy();relabelChronology()},ms));
      A.refreshMeta?.(`${typeFor(a)} · ${a.location||'Alex Ford Adventures'} · ${spanFor(a)}`);
      return true;
    };
    if(place())return;const obs=new MutationObserver(()=>{if(place())obs.disconnect()});obs.observe(document.getElementById('page'),{childList:true,subtree:true});
  }).catch(e=>console.error('Story detail',e));
})();