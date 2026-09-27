(()=>{
  'use strict';

  const A=window.AdventureSite;
  const P=window.AdventureRecordPresentation;
  if(!A||!P)return;

  const query=new URLSearchParams(location.search);
  const cleanMatch=location.pathname.match(/\/record\/([^/]+)\/?$/);
  const key=query.get('record')||query.get('id')||(cleanMatch?decodeURIComponent(cleanMatch[1]):'');
  if(!key)return;

  const yearFor=record=>String(record.date||record.year||'').slice(0,4);
  const timeFor=record=>{
    const raw=record.date||`${record.year||'0000'}-07-01`;
    const value=Date.parse(`${raw.length===4?`${raw}-07-01`:raw}T12:00:00Z`);
    return Number.isFinite(value)?value:0;
  };
  const nearby=(record,items)=>items.slice().sort((a,b)=>{
    const da=Math.abs(timeFor(a)-timeFor(record));
    const db=Math.abs(timeFor(b)-timeFor(record));
    return da-db||timeFor(a)-timeFor(b)||a.name.localeCompare(b.name);
  });
  const waitForAnchor=()=>new Promise(resolve=>{
    let attempts=0;
    const check=()=>{
      const anchor=document.querySelector('.chronology-nav')||document.querySelector('.detail-route-section');
      if(anchor||attempts++>120){resolve(anchor);return;}
      setTimeout(check,40);
    };
    check();
  });
  const card=(title,description,items)=>{
    if(!items.length)return'';
    const links=items.map(item=>`<a class="context-related-link" href="${A.recordHref(item)}"><span><strong>${A.esc(item.name)}</strong><small>${A.esc([P.labelFor(item),item.location].filter(Boolean).join(' · '))}</small></span><span class="context-related-date">${A.esc(item.date?A.formatDate(item.date):String(item.year||''))}</span></a>`).join('');
    return `<article class="context-related-card"><p class="card-kicker">${A.esc(description)}</p><h3>${A.esc(title)}</h3><div class="context-related-links">${links}</div></article>`;
  };

  Promise.all([A.load(),A.loadRelationships()]).then(async([all,relationships])=>{
    const record=all.find(item=>item.id===key||item.slug===key);
    if(!record)return;
    const group=P.groupFor(record);
    const explicitIds=new Set([record.id]);
    (relationships||[]).forEach(rel=>{
      const ids=rel.memberIds||[];
      if(ids.includes(record.id)||rel.adventureId===record.id){
        ids.forEach(id=>explicitIds.add(id));
        if(rel.adventureId)explicitIds.add(rel.adventureId);
      }
    });

    const candidates=all.filter(item=>item.id!==record.id&&P.groupFor(item)===group&&!explicitIds.has(item.id));
    const used=new Set();
    const take=(items,limit=4)=>nearby(record,items).filter(item=>!used.has(item.id)).slice(0,limit).map(item=>{used.add(item.id);return item;});

    const sameSeries=record.eventSeries?take(candidates.filter(item=>item.eventSeries===record.eventSeries)):[];
    const recordYear=yearFor(record);
    const sameYear=recordYear?take(candidates.filter(item=>yearFor(item)===recordYear)):[];
    const placeKey=String(record.region||record.location||'').trim();
    const samePlace=placeKey?take(candidates.filter(item=>{
      const candidatePlace=String(record.region?item.region:item.location||'').trim();
      return candidatePlace===placeKey;
    })):[];

    const cards=[
      card('Same series',record.eventSeries||'Recurring event',sameSeries),
      card(`More from ${recordYear}`,`Same ${group.replaceAll('-',' ')} year`,sameYear),
      card(`More from ${placeKey}`,`Same place · ${group.replaceAll('-',' ')}`,samePlace)
    ].filter(Boolean);
    if(!cards.length)return;

    const anchor=await waitForAnchor();
    if(!anchor||document.querySelector('.context-related-section'))return;
    const section=document.createElement('section');
    section.className='context-related-section';
    section.innerHTML=`<div class="section-title"><div><p class="eyebrow">Keep exploring</p><h2>Nearby in the archive</h2></div><p>Connections by recurring series, year, and place make it easier to move through the larger outdoor history.</p></div><div class="context-related-grid">${cards.join('')}</div>`;
    if(anchor.classList.contains('chronology-nav'))anchor.insertAdjacentElement('beforebegin',section);
    else anchor.insertAdjacentElement('afterend',section);
  }).catch(error=>console.warn('Related archive context unavailable',error));
})();
