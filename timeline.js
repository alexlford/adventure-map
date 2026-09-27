(()=>{
  const A=window.AdventureSite;if(!A)return;
  const timelineEl=document.getElementById('timeline');
  const searchEl=document.getElementById('timelineSearch');
  const yearEl=document.getElementById('timelineYear');
  const placeEl=document.getElementById('timelinePlace');
  const distanceEl=document.getElementById('timelineDistance');
  const evidenceEl=document.getElementById('timelineEvidence');
  const resetEl=document.getElementById('timelineReset');
  const summaryEl=document.getElementById('timelineResultSummary');
  const mapLinkEl=document.getElementById('timelineMapLink');
  const orderButtons=[...document.querySelectorAll('[data-order]')];
  const params=new URLSearchParams(location.search);
  let entries=[],allRecords=[],active='all',childrenByParent=new Map(),filterState=null;
  let query=(params.get('q')||'').trim();
  let order=params.get('order')==='latest'?'latest':'beginning';
  let requestedYear=params.get('year')||'';
  let requestedPlace=(params.get('place')||'').trim();
  let requestedDistance=['5k','10k','half','marathon','other'].includes(params.get('distance'))?params.get('distance'):'';
  let requestedEvidence=['verified','legacy'].includes(params.get('evidence'))?params.get('evidence'):'';

  const groupFor=a=>{
    if(a._timelineGroup)return a._timelineGroup;
    if(a.kind==='race')return'races';
    if(a.kind==='summit')return'summits';
    if(a.discipline==='mountain-bike')return'mtb';
    if(a.discipline==='nordic')return'nordic';
    if(a.discipline==='ski'||a.discipline==='ski-objective')return'skiing';
    return'adventures';
  };
  const labelFor=a=>a._timelineLabel||A.recordType(a);
  const dateFor=a=>a.date||`${a.year||'0000'}-01-01`;
  const valueFor=a=>a._timelineValue||a.teamFinishTime||a.officialTime||(a.kind==='summit'&&Number.isFinite(a.elevationFt)?`${Number(a.elevationFt).toLocaleString()} ft`:a.distanceMi?`${a.distanceMi} mi`:a.distance||'');
  const dateLabelFor=a=>a.date?A.formatDate(a.date):(a._timelineDateLabel||'');
  const hrefFor=a=>a._timelineSynthetic?null:(a._timelineHref||A.recordHref(a));
  const normalized=v=>String(v||'').toLowerCase().trim();
  const tokensFor=v=>normalized(v).split(/\s+/).filter(Boolean);
  const queryText=a=>normalized([a.name,a.currentName,a.locationInfo?.label,a.locationInfo?.region,a.location,a.region,a.teamName,labelFor(a),a.year,a.date].filter(Boolean).join(' '));
  const matchesQuery=(a,value=query)=>{const tokens=tokensFor(value);if(!tokens.length)return true;const haystack=queryText(a);return tokens.every(token=>haystack.includes(token));};
  const yearFor=a=>dateFor(a).slice(0,4);
  const placeFor=a=>String(a.locationInfo?.region||a.region||'').trim()||String(a.locationInfo?.label||a.location||'').split(',').map(part=>part.trim()).filter(Boolean).at(-1)||'';
  const evidenceFor=a=>{
    if(a._timelineSynthetic)return'';
    const confidence=normalized(a.evidence?.confidence||a.matchConfidence||'unknown');
    return['confirmed','verified','high'].includes(confidence)?'verified':'legacy';
  };
  const distanceFor=a=>{
    if(a.kind!=='race')return'';
    const text=normalized([a.officialDistance,a.distance].filter(Boolean).join(' '));
    if(/\bmarathon\b/.test(text)&&!/half/.test(text))return'marathon';
    if(/half/.test(text)||/13\.1/.test(text))return'half';
    if(/\b10\s*k\b|\b10k\b|6\.2/.test(text))return'10k';
    if(/\b5\s*k\b|\b5k\b|3\.1/.test(text))return'5k';
    const miles=Number(a.officialDistanceMi??a.distanceInfo?.mi??a.distanceMi);
    if(Number.isFinite(miles)){
      if(Math.abs(miles-26.2)<.7)return'marathon';
      if(Math.abs(miles-13.1)<.5)return'half';
      if(Math.abs(miles-6.21)<.4)return'10k';
      if(Math.abs(miles-3.11)<.3)return'5k';
    }
    return'other';
  };
  const syncParam=(name,value,defaultValue='')=>{
    const url=new URL(location.href);
    if(!value||value===defaultValue)url.searchParams.delete(name);else url.searchParams.set(name,value);
    history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`);
  };
  const returnState=()=>`${location.pathname}${location.search}${location.hash}`;
  const statefulHref=a=>{
    const href=hrefFor(a);if(!href||a._timelineHref||a._timelineSynthetic)return href;
    return `${href}${href.includes('?')?'&':'?'}from=${encodeURIComponent(returnState())}`;
  };

  function ensureTimelineGroupStyles(){
    if(document.getElementById('timelineGroupStyles'))return;
    const style=document.createElement('style');
    style.id='timelineGroupStyles';
    style.textContent=`
      .timeline-group{border:1px solid color-mix(in srgb,var(--accent) 16%,var(--line));border-radius:16px;background:rgba(255,255,255,.46);overflow:hidden}
      .timeline-group>.timeline-item{padding:14px 16px}
      .timeline-group>.timeline-item:hover{background:rgba(255,255,255,.52)}
      .timeline-group-count{display:inline-flex!important;margin-top:5px;padding:3px 7px;border:1px solid color-mix(in srgb,var(--accent) 22%,var(--line));border-radius:999px;background:rgba(255,255,255,.64);color:var(--accent)!important;font-size:.62rem!important;font-weight:800}
      .timeline-children{display:grid;margin:0 16px 12px;padding-left:14px;border-left:2px solid color-mix(in srgb,var(--accent) 34%,var(--line))}
      .timeline-child-item{padding:10px 0;border-top:1px solid color-mix(in srgb,var(--line) 82%,transparent)}
      .timeline-child-item:first-child{border-top:0}
      .timeline-child-item>div:first-child{padding-left:1px}
      .timeline-child-item strong:first-child{font-size:.94rem}
      .timeline-child-item span{font-size:.73rem}
      @media(max-width:560px){
        .timeline-group>.timeline-item{padding:13px 14px}
        .timeline-children{margin:0 14px 10px;padding-left:12px}
        .timeline-child-item{grid-template-columns:1fr;padding:9px 0}
      }
    `;
    document.head.appendChild(style);
  }

  const childLabel=(entry,children)=>{
    if(!children.length)return'';
    const groups=[...new Set(children.map(groupFor))];
    if(groups.length===1&&groups[0]==='summits')return`${children.length} summit${children.length===1?'':'s'}`;
    if(groups.length===1&&groups[0]==='races')return`${children.length} race${children.length===1?'':'s'}`;
    if(entry?.discipline==='challenge')return`${children.length} leg${children.length===1?'':'s'}`;
    return`${children.length} linked event${children.length===1?'':'s'}`;
  };

  function renderItem(x,{child=false,groupCount=''}={}){
    const href=statefulHref(x);
    const tag=href?'a':'div';
    const hrefAttr=href?` href="${A.esc(href)}"`:'';
    const value=valueFor(x);
    const groupBadge=groupCount?`<span class="timeline-group-count">${A.esc(groupCount)}</span>`:'';
    const context=[labelFor(x),x.teamName?`Team: ${x.teamName}`:'',x.locationInfo?.label||x.location||''].filter(Boolean).join(' · ');
    return `<${tag} class="timeline-item${child?' timeline-child-item':''}"${hrefAttr}><div><strong>${A.esc(x.name)}</strong><span>${A.esc(context)}</span>${groupBadge}</div><div><strong>${A.esc(value)}</strong><span>${A.esc(dateLabelFor(x))}</span></div></${tag}>`;
  }

  const matchesFacets=a=>{
    if(requestedYear&&yearFor(a)!==requestedYear)return false;
    if(requestedPlace&&normalized(placeFor(a))!==normalized(requestedPlace))return false;
    if(requestedDistance&&distanceFor(a)!==requestedDistance)return false;
    if(requestedEvidence&&evidenceFor(a)!==requestedEvidence)return false;
    return true;
  };
  const matchesActivity=(a,filter)=>filter==='all'||groupFor(a)===filter;
  const childrenForFilter=(entry,filter)=>(childrenByParent.get(entry.id)||[]).filter(child=>matchesActivity(child,filter)&&matchesFacets(child));
  const visibleChildren=(entry,filter)=>{
    const children=childrenForFilter(entry,filter);
    if(!query||matchesQuery(entry))return children;
    return children.filter(child=>matchesQuery(child));
  };
  const matchesFilter=(entry,filter)=>{
    const parentMatch=matchesActivity(entry,filter)&&matchesFacets(entry)&&matchesQuery(entry);
    return parentMatch||visibleChildren(entry,filter).length>0;
  };

  function reflectOrder(){
    orderButtons.forEach(button=>{
      const isActive=button.dataset.order===order;
      button.classList.toggle('is-active',isActive);
      button.setAttribute('aria-pressed',isActive?'true':'false');
    });
  }
  function populateSelect(select,values,{placeholder,current}){
    if(!select)return;
    select.innerHTML=`<option value="">${A.esc(placeholder)}</option>`+values.map(value=>`<option value="${A.esc(value)}">${A.esc(value)}</option>`).join('');
    select.value=values.includes(current)?current:'';
  }
  function populateFacets(){
    const years=[...new Set(allRecords.map(yearFor).filter(year=>/^\d{4}$/.test(year)))].sort((a,b)=>b.localeCompare(a));
    const places=[...new Set(allRecords.map(placeFor).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    populateSelect(yearEl,years,{placeholder:'All years',current:requestedYear});
    populateSelect(placeEl,places,{placeholder:'All places',current:requestedPlace});
    requestedYear=yearEl?.value||'';
    requestedPlace=placeEl?.value||'';
    if(distanceEl)distanceEl.value=requestedDistance;
    if(evidenceEl)evidenceEl.value=requestedEvidence;
  }
  const hasFilters=()=>Boolean(query||active!=='all'||requestedYear||requestedPlace||requestedDistance||requestedEvidence||order!=='beginning');
  function mapHrefFor(ids){
    const base=A.pageHref('map.html');
    if(!ids.length)return base;
    if(!hasFilters()&&ids.length===allRecords.length)return base;
    const url=new URL(base,location.href);
    url.searchParams.set('selection',ids.join(','));
    url.searchParams.set('source','timeline');
    return `${url.pathname}${url.search}`;
  }
  function reflectResults(ids,topLevelCount){
    const count=ids.length;
    if(summaryEl){
      const parts=[`${count} record${count===1?'':'s'}`];
      if(topLevelCount!==count)parts.push(`${topLevelCount} timeline entr${topLevelCount===1?'y':'ies'}`);
      if(requestedYear)parts.push(requestedYear);
      if(requestedPlace)parts.push(requestedPlace);
      summaryEl.textContent=parts.join(' · ');
    }
    if(mapLinkEl){
      mapLinkEl.href=mapHrefFor(ids);
      mapLinkEl.textContent=count?`Show ${count} on map →`:'Nothing to map';
      mapLinkEl.setAttribute('aria-disabled',count?'false':'true');
    }
    if(resetEl)resetEl.disabled=!hasFilters();
  }

  const render=filter=>{
    active=filter||active;
    const shown=entries.filter(entry=>matchesFilter(entry,active));
    let years=[...new Set(shown.map(entry=>yearFor(entry)))];
    years.sort((a,b)=>order==='latest'?b.localeCompare(a):a.localeCompare(b));
    const visibleIds=[];
    timelineEl.innerHTML=years.map(year=>{
      const direction=order==='latest'?-1:1;
      const yearEntries=shown.filter(entry=>yearFor(entry)===year).sort((a,b)=>direction*(dateFor(a).localeCompare(dateFor(b))||a.name.localeCompare(b.name)));
      const items=yearEntries.map(entry=>{
        const children=visibleChildren(entry,active).slice().sort((a,b)=>direction*(dateFor(a).localeCompare(dateFor(b))||a.name.localeCompare(b.name)));
        if(!entry._timelineSynthetic&&!entry._timelineHref&&allRecords.some(record=>record.id===entry.id))visibleIds.push(entry.id);
        children.forEach(child=>{if(allRecords.some(record=>record.id===child.id))visibleIds.push(child.id)});
        if(!children.length)return renderItem(entry);
        const nested=children.map(child=>renderItem(child,{child:true})).join('');
        return `<div class="timeline-group">${renderItem(entry,{groupCount:childLabel(entry,children)})}<div class="timeline-children">${nested}</div></div>`;
      }).join('');
      return `<section class="timeline-year" id="timeline-year-${year}"><h3>${year}</h3><div class="timeline-items">${items}</div></section>`;
    }).join('')||'<div class="empty">No entries match this combination of filters.</div>';
    reflectOrder();
    reflectResults([...new Set(visibleIds)],shown.length);
  };

  function buildGroupedEntries(all,relationships){
    const byId=new Map(all.map(record=>[record.id,record]));
    const claimedChildren=new Set();
    const synthetic=[];
    childrenByParent=new Map();

    const attach=(parent,ids)=>{
      if(!parent||!ids?.length)return;
      const children=[];
      ids.forEach(id=>{
        const child=byId.get(id);
        if(!child||child.id===parent.id||claimedChildren.has(child.id))return;
        claimedChildren.add(child.id);
        children.push(child);
      });
      if(children.length)childrenByParent.set(parent.id,children);
    };

    all.forEach(parent=>{
      if(Array.isArray(parent.linkedSummits)&&parent.linkedSummits.length)attach(parent,parent.linkedSummits);
    });

    (relationships||[]).filter(rel=>rel.adventureId).forEach(rel=>{
      attach(byId.get(rel.adventureId),rel.memberIds||[]);
    });

    (relationships||[]).filter(rel=>!rel.adventureId&&['same-day','weekend','multi-day'].includes(rel.type)).forEach(rel=>{
      const members=(rel.memberIds||[]).map(id=>byId.get(id)).filter(Boolean).filter(member=>!claimedChildren.has(member.id));
      if(members.length<2)return;
      const ordered=members.slice().sort((a,b)=>dateFor(a).localeCompare(dateFor(b)));
      const first=ordered[0];
      const parent={
        id:`timeline-group-${rel.id}`,
        kind:'event',
        discipline:first.discipline,
        name:rel.name,
        date:dateFor(first),
        year:Number(yearFor(first)),
        location:ordered.every(item=>item.location===first.location)?first.location:'',
        region:ordered.every(item=>placeFor(item)===placeFor(first))?placeFor(first):'',
        _timelineGroup:groupFor(first),
        _timelineLabel:rel.type==='weekend'?'Weekend':rel.type==='multi-day'?'Multi-day outing':'Multi-event day',
        _timelineSynthetic:true
      };
      synthetic.push(parent);
      ordered.forEach(member=>claimedChildren.add(member.id));
      childrenByParent.set(parent.id,ordered);
    });

    return [...all.filter(record=>!claimedChildren.has(record.id)),...synthetic];
  }

  if(searchEl){
    searchEl.value=query;
    searchEl.addEventListener('input',()=>{query=searchEl.value.trim();syncParam('q',query);render(active)});
  }
  yearEl?.addEventListener('change',()=>{requestedYear=yearEl.value;syncParam('year',requestedYear);render(active)});
  placeEl?.addEventListener('change',()=>{requestedPlace=placeEl.value;syncParam('place',requestedPlace);render(active)});
  distanceEl?.addEventListener('change',()=>{requestedDistance=distanceEl.value;syncParam('distance',requestedDistance);render(active)});
  evidenceEl?.addEventListener('change',()=>{requestedEvidence=evidenceEl.value;syncParam('evidence',requestedEvidence);render(active)});
  orderButtons.forEach(button=>button.addEventListener('click',()=>{
    order=button.dataset.order==='latest'?'latest':'beginning';
    syncParam('order',order,'beginning');
    render(active);
  }));
  resetEl?.addEventListener('click',()=>{
    query='';requestedYear='';requestedPlace='';requestedDistance='';requestedEvidence='';order='beginning';
    if(searchEl)searchEl.value='';if(yearEl)yearEl.value='';if(placeEl)placeEl.value='';if(distanceEl)distanceEl.value='';if(evidenceEl)evidenceEl.value='';
    ['q','year','place','distance','evidence','order'].forEach(name=>syncParam(name,''));
    filterState?.apply('all');
  });
  window.addEventListener('popstate',()=>location.reload());

  ensureTimelineGroupStyles();
  Promise.all([
    A.load(),
    fetch('data/skiing.json').then(r=>{if(!r.ok)throw new Error('Unable to load skiing timeline');return r.json()}),
    A.loadRelationships()
  ]).then(([all,ski,relationships])=>{
    A.shell('timeline');
    allRecords=all.slice();
    const seasonEntries=(ski.seasons||[]).map(s=>{
      const start=Number(String(s.season).slice(0,4));
      return{id:`ski-season-${s.season}`,kind:'event',discipline:'ski',name:`${s.season} ski season`,year:start,date:`${start}-11-01`,location:'Ski season',_timelineGroup:'skiing',_timelineLabel:'Ski season',_timelineHref:'skiing.html',_timelineDateLabel:s.season,_timelineValue:`${s.days} days${Number.isFinite(s.verticalFtApprox)?` · ${Number(s.verticalFtApprox).toLocaleString()} ft`:''}`};
    });
    const tripEntries=(ski.trips||[]).map(t=>{
      const date=(t.dates||[])[0]||`${String(t.season).slice(0,4)}-11-01`;
      return{id:t.id,kind:'event',discipline:'ski',name:t.name,date,location:t.location||'',_timelineGroup:'skiing',_timelineLabel:'Named ski trip',_timelineHref:'skiing.html',_timelineValue:`${t.runs} runs · ${Number(t.verticalFt).toLocaleString()} ft`};
    });
    entries=[...buildGroupedEntries(all,relationships),...seasonEntries,...tripEntries];
    const years=[...new Set(entries.map(entry=>Number(yearFor(entry))).filter(Boolean))].sort((a,b)=>a-b);
    entryCount.textContent=entries.length;
    firstYear.textContent=years[0]||'—';
    latestYear.textContent=years.at(-1)||'—';
    activeYears.textContent=years.length;
    populateFacets();
    filterState=AdventureFilterState.setup({param:'view',allowed:['all','races','summits','skiing','mtb','nordic','adventures'],fallback:'all',onChange:render});
  }).catch(error=>timelineEl.innerHTML=`<div class="empty">${A.esc(error.message)}</div>`);
})();
