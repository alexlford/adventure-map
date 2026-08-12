(()=>{
  const A=window.AdventureSite;if(!A)return;
  const timelineEl=document.getElementById('timeline');
  let entries=[],active='all',childrenByParent=new Map();

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
  const valueFor=a=>a._timelineValue||a.officialTime||(a.kind==='summit'&&Number.isFinite(a.elevationFt)?`${Number(a.elevationFt).toLocaleString()} ft`:a.distanceMi?`${a.distanceMi} mi`:a.distance||'');
  const dateLabelFor=a=>a.date?A.formatDate(a.date):(a._timelineDateLabel||'');
  const hrefFor=a=>a._timelineSynthetic?null:(a._timelineHref||A.recordHref(a));

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
    const href=hrefFor(x);
    const tag=href?'a':'div';
    const hrefAttr=href?` href="${A.esc(href)}"`:'';
    const value=valueFor(x);
    const groupBadge=groupCount?`<span class="timeline-group-count">${A.esc(groupCount)}</span>`:'';
    return `<${tag} class="timeline-item${child?' timeline-child-item':''}"${hrefAttr}><div><strong>${A.esc(x.name)}</strong><span>${A.esc(labelFor(x))}${x.location?` · ${A.esc(x.location)}`:''}</span>${groupBadge}</div><div><strong>${A.esc(value)}</strong><span>${A.esc(dateLabelFor(x))}</span></div></${tag}>`;
  }

  const visibleChildren=(entry,filter)=>{
    const children=childrenByParent.get(entry.id)||[];
    if(filter==='all')return children;
    return children.filter(child=>groupFor(child)===filter);
  };

  const matchesFilter=(entry,filter)=>filter==='all'||groupFor(entry)===filter||visibleChildren(entry,filter).length>0;

  const render=filter=>{
    active=filter||active;
    const shown=entries.filter(entry=>matchesFilter(entry,active));
    const years=[...new Set(shown.map(entry=>dateFor(entry).slice(0,4)))].sort();
    timelineEl.innerHTML=years.map(year=>{
      const yearEntries=shown.filter(entry=>dateFor(entry).slice(0,4)===year).sort((a,b)=>dateFor(a).localeCompare(dateFor(b))||a.name.localeCompare(b.name));
      const items=yearEntries.map(entry=>{
        const children=visibleChildren(entry,active);
        if(!children.length)return renderItem(entry);
        const nested=children.map(child=>renderItem(child,{child:true})).join('');
        return `<div class="timeline-group">${renderItem(entry,{groupCount:childLabel(entry,children)})}<div class="timeline-children">${nested}</div></div>`;
      }).join('');
      return `<section class="timeline-year"><h3>${year}</h3><div class="timeline-items">${items}</div></section>`;
    }).join('')||'<div class="empty">No entries in this view yet.</div>';
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
        year:Number(dateFor(first).slice(0,4)),
        location:ordered.every(item=>item.location===first.location)?first.location:'',
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
      return{id:t.id,kind:'event',discipline:'ski',name:t.name,date,location:t.location||'',_timelineGroup:'skiing',_timelineLabel:'Named ski trip',_timelineHref:'skiing.html',_timelineValue:`${t.runs} runs · ${Number(t.verticalFt).toLocaleString()} ft`};
    });
    entries=[...buildGroupedEntries(all,relationships),...seasonEntries,...tripEntries].sort((a,b)=>dateFor(a).localeCompare(dateFor(b))||a.name.localeCompare(b.name));
    const years=[...new Set(entries.map(entry=>Number(dateFor(entry).slice(0,4))).filter(Boolean))].sort((a,b)=>a-b);
    entryCount.textContent=entries.length;
    firstYear.textContent=years[0]||'—';
    latestYear.textContent=years.at(-1)||'—';
    activeYears.textContent=years.length;
    AdventureFilterState.setup({param:'view',allowed:['all','races','summits','skiing','mtb','nordic','adventures'],fallback:'all',onChange:render});
  }).catch(error=>timelineEl.innerHTML=`<div class="empty">${A.esc(error.message)}</div>`);
})();