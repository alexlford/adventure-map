(()=>{
  const A=window.AdventureSite;if(!A)return;
  const timelineEl=document.getElementById('timeline');
  const searchEl=document.getElementById('timelineSearch');
  const yearFromEl=document.getElementById('timelineYearFrom');
  const yearToEl=document.getElementById('timelineYearTo');
  const placeEl=document.getElementById('timelinePlace');
  const distanceEl=document.getElementById('timelineDistance');
  const statusEl=document.getElementById('timelineStatus');
  const summaryEl=document.getElementById('timelineSummary');
  const resetEl=document.getElementById('timelineReset');
  const mapLinkEl=document.getElementById('timelineMapLink');
  const orderButtons=[...document.querySelectorAll('[data-order]')];
  const params=new URLSearchParams(location.search);
  let entries=[],sourceRecords=[],active='all',childrenByParent=new Map(),filterController=null;
  let query=(params.get('q')||'').trim();
  let order=params.get('order')==='latest'?'latest':'beginning';
  let yearFrom=params.get('from')||params.get('year')||'';
  let yearTo=params.get('through')||params.get('year')||'';
  let place=params.get('place')||'';
  let distance=params.get('distance')||'';
  let status=['verified','other'].includes(params.get('status'))?params.get('status'):'';

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
  const yearFor=a=>dateFor(a).slice(0,4);
  const valueFor=a=>a._timelineValue||a.teamFinishTime||a.officialTime||(a.kind==='summit'&&Number.isFinite(a.elevationFt)?`${Number(a.elevationFt).toLocaleString()} ft`:a.distanceMi?`${a.distanceMi} mi`:a.distance||'');
  const dateLabelFor=a=>a.date?A.formatDate(a.date):(a._timelineDateLabel||'');
  const hrefFor=a=>a._timelineSynthetic?null:(a._timelineHref||A.recordHref(a));
  const normalized=v=>String(v||'').toLowerCase().trim();
  const placeFor=a=>String(a.region||a._timelinePlace||'').trim();
  const isVerified=a=>a.matchConfidence==='verified';
  const distanceCategoryFor=a=>{
    if(a.kind!=='race')return'';
    if(a.discipline==='relay')return'Relay';
    const raw=normalized(a.distance||a.officialDistance||'');
    if(/\bultra|50\s*k|50k|100\s*k|100k|50\s*mi|100\s*mi/.test(raw))return'Ultra';
    if(/half/.test(raw)&&/marathon/.test(raw))return'Half marathon';
    if(/marathon/.test(raw))return'Marathon';
    if(/\b10\s*k\b|10k/.test(raw))return'10K';
    if(/\b5\s*k\b|5k/.test(raw))return'5K';
    if(/\bmile\b/.test(raw)&&!/miles/.test(raw))return'Mile';
    const miles=Number(a.officialDistanceMi??a.distanceMi);
    if(Number.isFinite(miles)){
      if(miles>=26.1&&miles<=26.5)return'Marathon';
      if(miles>=13&&miles<=13.5)return'Half marathon';
      if(miles>=6&&miles<=6.5)return'10K';
      if(miles>=3&&miles<=3.3)return'5K';
      if(miles>=26.6)return'Ultra';
    }
    return'Other race';
  };
  const matchesQuery=(a,value=query)=>{
    const q=normalized(value);if(!q)return true;
    const haystack=[
      a.name,a.currentName,a.location,a.region,a.teamName,labelFor(a),a.year,a.date,
      a.distance,a.officialDistance,a.eventSeries,a.note,a.storyTitle,a.story
    ].filter(Boolean).join(' ');
    return normalized(haystack).includes(q);
  };
  const matchesFacets=a=>{
    const year=yearFor(a);
    if(yearFrom&&year<yearFrom)return false;
    if(yearTo&&year>yearTo)return false;
    if(place){
      const exact=normalized(placeFor(a))===normalized(place);
      const inLocation=normalized(a.location).includes(normalized(place));
      if(!exact&&!inLocation)return false;
    }
    if(distance&&distanceCategoryFor(a)!==distance)return false;
    if(status==='verified'&&!isVerified(a))return false;
    if(status==='other'&&isVerified(a))return false;
    return true;
  };
  const matchesEntry=(a,filter)=>{
    const groupMatch=filter==='all'||groupFor(a)===filter;
    return groupMatch&&matchesQuery(a)&&matchesFacets(a);
  };
  const syncParam=(name,value,defaultValue='')=>{
    const url=new URL(location.href);
    if(!value||value===defaultValue)url.searchParams.delete(name);else url.searchParams.set(name,value);
    if(name==='from'||name==='through')url.searchParams.delete('year');
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
    const verified=!x._timelineSynthetic&&isVerified(x)?'<span class="verification-badge verified">Verified</span>':'';
    const context=[labelFor(x),x.teamName?`Team: ${x.teamName}`:'',x.location||''].filter(Boolean).join(' · ');
    return `<${tag} class="timeline-item${child?' timeline-child-item':''}"${hrefAttr}><div><div class="timeline-title-row"><strong>${A.esc(x.name)}</strong>${verified}</div><span>${A.esc(context)}</span>${groupBadge}</div><div><strong>${A.esc(value)}</strong><span>${A.esc(dateLabelFor(x))}</span></div></${tag}>`;
  }

  const childrenForFilter=(entry,filter)=>{
    const children=childrenByParent.get(entry.id)||[];
    return children.filter(child=>matchesEntry(child,filter));
  };
  const visibleChildren=(entry,filter)=>childrenForFilter(entry,filter);
  const matchesFilter=(entry,filter)=>matchesEntry(entry,filter)||visibleChildren(entry,filter).length>0;

  function reflectOrder(){
    orderButtons.forEach(button=>{
      const isActive=button.dataset.order===order;
      button.classList.toggle('is-active',isActive);
      button.setAttribute('aria-pressed',isActive?'true':'false');
    });
  }

  function populateSelect(el,values,{blankLabel,current}){
    if(!el)return;
    el.innerHTML=`<option value="">${A.esc(blankLabel)}</option>`+values.map(value=>`<option value="${A.esc(value)}">${A.esc(value)}</option>`).join('');
    el.value=values.includes(current)?current:'';
  }

  function populateFacets(){
    const years=[...new Set(sourceRecords.map(yearFor).filter(year=>/^\d{4}$/.test(year)))].sort((a,b)=>b.localeCompare(a));
    populateSelect(yearFromEl,years,{blankLabel:'First',current:yearFrom});
    populateSelect(yearToEl,years,{blankLabel:'Latest',current:yearTo});
    const places=[...new Set(sourceRecords.map(placeFor).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    populateSelect(placeEl,places,{blankLabel:'Everywhere',current:place});
    const distances=[...new Set(sourceRecords.map(distanceCategoryFor).filter(Boolean))];
    const preferred=['Marathon','Half marathon','10K','5K','Mile','Ultra','Relay','Other race'];
    distances.sort((a,b)=>preferred.indexOf(a)-preferred.indexOf(b)||a.localeCompare(b));
    populateSelect(distanceEl,distances,{blankLabel:'All distances',current:distance});
    if(statusEl)statusEl.value=status;
  }

  const currentFilterCount=()=>{
    let count=0;
    if(query)count++;
    if(yearFrom)count++;
    if(yearTo)count++;
    if(place)count++;
    if(distance)count++;
    if(status)count++;
    if(active!=='all')count++;
    return count;
  };

  function mapHref(){
    const url=new URL(A.pageHref('map.html'),location.href);
    const layer={summits:'summits',skiing:'skiing',mtb:'mtb',nordic:'nordic',adventures:'adventures'}[active];
    if(layer)url.searchParams.set('layer',layer);
    if(query)url.searchParams.set('q',query);
    else if(place)url.searchParams.set('q',place);
    if(yearFrom)url.searchParams.set('from',yearFrom);
    if(yearTo)url.searchParams.set('through',yearTo);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function updateSummary(shown){
    const nestedCount=shown.reduce((sum,entry)=>sum+visibleChildren(entry,active).length,0);
    const count=shown.length+nestedCount;
    const qualifiers=[];
    if(active!=='all')qualifiers.push(document.querySelector(`[data-filter="${CSS.escape(active)}"]`)?.textContent?.trim()||active);
    if(yearFrom||yearTo)qualifiers.push(yearFrom===yearTo?yearFrom:`${yearFrom||'first'}–${yearTo||'latest'}`);
    if(place)qualifiers.push(place);
    if(distance)qualifiers.push(distance);
    if(status==='verified')qualifiers.push('verified matches');
    if(status==='other')qualifiers.push('other archive records');
    if(query)qualifiers.push(`“${query}”`);
    if(summaryEl)summaryEl.textContent=`${count} ${count===1?'record':'records'} shown${qualifiers.length?` · ${qualifiers.join(' · ')}`:''}`;
    if(resetEl)resetEl.disabled=currentFilterCount()===0&&order==='beginning';
    if(mapLinkEl){
      mapLinkEl.href=mapHref();
      const exact=!place&&!distance&&!status&&active!=='races';
      mapLinkEl.textContent=exact?'View this archive on map →':'Open this search on map →';
      mapLinkEl.title=exact?'Carry activity, search, and year filters to the map.':'The map carries activity, search, and year filters; Timeline-only facets stay here.';
    }
  }

  const render=filter=>{
    active=filter||active;
    const shown=entries.filter(entry=>matchesFilter(entry,active));
    let years=[...new Set(shown.map(entry=>yearFor(entry)))].filter(year=>/^\d{4}$/.test(year));
    years.sort((a,b)=>order==='latest'?b.localeCompare(a):a.localeCompare(b));
    timelineEl.innerHTML=years.map(year=>{
      const direction=order==='latest'?-1:1;
      const yearEntries=shown.filter(entry=>yearFor(entry)===year).sort((a,b)=>direction*(dateFor(a).localeCompare(dateFor(b))||a.name.localeCompare(b.name)));
      const items=yearEntries.map(entry=>{
        const children=visibleChildren(entry,active).slice().sort((a,b)=>direction*(dateFor(a).localeCompare(dateFor(b))||a.name.localeCompare(b.name)));
        const parentMatches=matchesEntry(entry,active);
        if(!children.length)return renderItem(entry);
        const nested=children.map(child=>renderItem(child,{child:true})).join('');
        if(!parentMatches){
          return `<div class="timeline-group timeline-group-context">${renderItem(entry,{groupCount:childLabel(entry,children)})}<div class="timeline-children">${nested}</div></div>`;
        }
        return `<div class="timeline-group">${renderItem(entry,{groupCount:childLabel(entry,children)})}<div class="timeline-children">${nested}</div></div>`;
      }).join('');
      return `<section class="timeline-year" id="timeline-year-${year}"><h3>${year}</h3><div class="timeline-items">${items}</div></section>`;
    }).join('')||'<div class="empty">No entries match these archive filters.</div>';
    reflectOrder();
    updateSummary(shown);
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
        region:ordered.every(item=>item.region===first.region)?first.region:'',
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

  const normalizeYearBounds=changed=>{
    if(yearFrom&&yearTo&&yearFrom>yearTo){
      if(changed==='from')yearTo=yearFrom;
      else yearFrom=yearTo;
    }
    if(yearFromEl)yearFromEl.value=yearFrom;
    if(yearToEl)yearToEl.value=yearTo;
    syncParam('from',yearFrom);
    syncParam('through',yearTo);
  };

  if(searchEl){
    searchEl.value=query;
    searchEl.addEventListener('input',()=>{query=searchEl.value.trim();syncParam('q',query);render(active)});
  }
  yearFromEl?.addEventListener('change',()=>{
    yearFrom=yearFromEl.value;
    normalizeYearBounds('from');
    render(active);
  });
  yearToEl?.addEventListener('change',()=>{
    yearTo=yearToEl.value;
    normalizeYearBounds('through');
    render(active);
  });
  placeEl?.addEventListener('change',()=>{
    place=placeEl.value;syncParam('place',place);render(active);
  });
  distanceEl?.addEventListener('change',()=>{
    distance=distanceEl.value;syncParam('distance',distance);render(active);
  });
  statusEl?.addEventListener('change',()=>{
    status=statusEl.value;syncParam('status',status);render(active);
  });
  orderButtons.forEach(button=>button.addEventListener('click',()=>{
    order=button.dataset.order==='latest'?'latest':'beginning';
    syncParam('order',order,'beginning');
    render(active);
  }));
  resetEl?.addEventListener('click',()=>{
    query='';yearFrom='';yearTo='';place='';distance='';status='';order='beginning';
    if(searchEl)searchEl.value='';
    if(yearFromEl)yearFromEl.value='';
    if(yearToEl)yearToEl.value='';
    if(placeEl)placeEl.value='';
    if(distanceEl)distanceEl.value='';
    if(statusEl)statusEl.value='';
    ['q','from','through','year','place','distance','status','order'].forEach(name=>syncParam(name,''));
    filterController?.apply('all');
    reflectOrder();
    render('all');
  });

  ensureTimelineGroupStyles();
  Promise.all([
    A.load(),
    fetch('data/skiing.json').then(r=>{if(!r.ok)throw new Error('Unable to load skiing timeline');return r.json()}),
    A.loadRelationships()
  ]).then(([all,ski,relationships])=>{
    A.shell('timeline');
    const seasonEntries=(ski.seasons||[]).map(s=>{
      const start=Number(String(s.season).slice(0,4));
      return{id:`ski-season-${s.season}`,kind:'event',discipline:'ski',name:`${s.season} ski season`,year:start,date:`${start}-11-01`,location:'Ski season',_timelineGroup:'skiing',_timelineLabel:'Ski season',_timelineHref:'skiing.html',_timelineDateLabel:s.season,_timelineValue:`${s.days} days${Number.isFinite(s.verticalFtApprox)?` · ${Number(s.verticalFtApprox).toLocaleString()} ft`:''}`};
    });
    const tripEntries=(ski.trips||[]).map(t=>{
      const date=(t.dates||[])[0]||`${String(t.season).slice(0,4)}-11-01`;
      return{id:t.id,kind:'event',discipline:'ski',name:t.name,date,location:t.location||'',region:t.region||'',_timelinePlace:t.region||'',_timelineGroup:'skiing',_timelineLabel:'Named ski trip',_timelineHref:'skiing.html',_timelineValue:`${t.runs} runs · ${Number(t.verticalFt).toLocaleString()} ft`};
    });
    sourceRecords=[...all,...tripEntries];
    entries=[...buildGroupedEntries(all,relationships),...seasonEntries,...tripEntries];
    const years=[...new Set(entries.map(entry=>Number(yearFor(entry))).filter(Boolean))].sort((a,b)=>a-b);
    entryCount.textContent=entries.length;
    firstYear.textContent=years[0]||'—';
    latestYear.textContent=years.at(-1)||'—';
    activeYears.textContent=years.length;
    populateFacets();
    normalizeYearBounds('from');
    filterController=AdventureFilterState.setup({param:'view',allowed:['all','races','summits','skiing','mtb','nordic','adventures'],fallback:'all',onChange:render});
  }).catch(error=>timelineEl.innerHTML=`<div class="empty">${A.esc(error.message)}</div>`);
})();
