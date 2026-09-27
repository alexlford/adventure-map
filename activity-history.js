(()=>{
  'use strict';
  const A=window.AdventureSite;
  if(!A)return;
  const script=document.currentScript;
  const chapter=script?.dataset.activityHistory;
  if(!chapter)return;
  const dataUrl=script?.src?new URL('data/activity-history.json',script.src).href:'data/activity-history.json';
  const cssUrl=script?.src?new URL('activity-history.css',script.src).href:'activity-history.css';
  if(!document.querySelector('link[data-activity-history-style]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href=cssUrl;link.dataset.activityHistoryStyle='true';document.head.appendChild(link);
  }
  const esc=A.esc;
  const fmt=n=>Number(n||0).toLocaleString();
  const maxCount=rows=>Math.max(1,...(rows||[]).map(row=>Number(row.count||row.days||0)));
  const barRows=(rows,labelFor=row=>String(row.year),valueFor=row=>row.count)=>{
    const max=maxCount(rows);
    return `<div class="activity-history-bars">${(rows||[]).map(row=>{const value=Number(valueFor(row)||0);return `<div class="activity-history-row"><span>${esc(labelFor(row))}</span><div class="activity-history-track"><i style="width:${Math.max(4,Math.round(value/max*100))}%"></i></div><strong>${fmt(value)}</strong></div>`}).join('')}</div>`;
  };
  const card=(label,value,detail='')=>`<article class="activity-history-card"><small>${esc(label)}</small><strong>${esc(String(value))}</strong>${detail?`<p>${esc(detail)}</p>`:''}</article>`;
  const yearSpan=s=>s?.firstYear&&s?.lastYear?(s.firstYear===s.lastYear?String(s.firstYear):`${s.firstYear}–${s.lastYear}`):'—';
  const recurring=items=>!items?.length?'':`<article class="activity-history-panel"><small>Places I return to</small><div class="activity-history-list">${items.slice(0,6).map(item=>`<div><span>${esc(item.name)}</span><strong>${fmt(item.recordedDays)} day${item.recordedDays===1?'':'s'}</strong></div>`).join('')}</div></article>`;
  const regions=items=>!items?.length?'':`<article class="activity-history-panel"><small>Geography</small><div class="activity-history-list">${items.slice(0,6).map(item=>`<div><span>${esc(item.name)}</span><strong>${fmt(item.count)}</strong></div>`).join('')}</div></article>`;

  function renderSummits(d){const s=d.summary;return {title:'Climbing history',intro:'A chronological view of how the summit archive has grown, where those mountains are, and how much route evidence is preserved.',cards:[card('Summits',s.count,`${yearSpan(s)} archive span`),card('14,000+ ft',s.fourteeners,'documented summits'),card('GPS routes',s.routeCount,`${s.count?Math.round(s.routeCount/s.count*100):0}% route coverage`),card('Regions',s.regionCount,'represented in the archive')],body:`<article class="activity-history-panel wide"><small>Summits by year</small>${barRows(d.yearly)}</article>${regions(d.regions)}<article class="activity-history-panel"><small>Highest documented</small><div class="activity-history-list">${(d.highest||[]).map(item=>`<a href="${esc(A.recordHref(item))}"><span>${esc(item.name)}</span><strong>${fmt(item.elevationFt)} ft</strong></a>`).join('')}</div></article>`};}
  function renderSkiing(d){const s=d.summary;return {title:'Alpine history',intro:'The long view across ski seasons: days, vertical, resorts, trips, and how the winter archive accumulated.',cards:[card('Ski days',s.recordedDays,`${s.firstSeason||'—'}–${s.latestSeason||'—'}`),card('Vertical',`${fmt(s.verticalFt)} ft`,'recorded Slopes total'),card('Resorts',s.resortCount,`${s.regionCount} regions represented`),card('Named trips',s.tripCount,'multi-day or named ski chapters')],body:`<article class="activity-history-panel wide"><small>Days by season</small>${barRows(d.seasons,row=>row.season,row=>row.days)}</article>${regions(d.regions)}<article class="activity-history-panel"><small>Most-skied resorts</small><div class="activity-history-list">${(d.resorts||[]).slice(0,6).map(item=>`<div><span>${esc(item.name)}</span><strong>${fmt(item.days)} days</strong></div>`).join('')}</div></article>`};}
  function renderNordic(d){const s=d.summary;return {title:'Nordic history',intro:'A season-spanning view of the trail systems, repeat visits, races, events, and memorable Nordic days in the archive.',cards:[card('Recorded days',s.recordedDays,`${yearSpan(s)} archive span`),card('Locations',s.locationCount,'Nordic centers and trail systems'),card('Races + events',s.raceCount+s.eventCount,`${s.raceCount} races · ${s.eventCount} events`),card('Standout days',s.memorableCount,'featured outings and weekends')],body:`<article class="activity-history-panel wide"><small>Nordic days by year</small>${barRows(d.yearly)}</article>${recurring(d.recurringLocations)}${regions(d.regions)}`};}
  function renderMtb(d){const s=d.summary;return {title:'Riding history',intro:'The archive over time, separating human-powered trail days from lift-served downhill while keeping mixed days visible in both stories.',cards:[card('Recorded days',s.recordedDays,`${yearSpan(s)} archive span`),card('Pedal / mixed',s.pedalDays,'days with meaningful climbing'),card('Downhill / mixed',s.downhillDays,'days with lift-served riding'),card('MTB races',s.raceCount,`${s.memorableCount} standout rides/weekends`)],body:`<article class="activity-history-panel wide"><small>Riding days by year</small>${barRows(d.yearly)}</article>${recurring(d.recurringLocations)}${regions(d.regions)}`};}
  const renderers={summits:renderSummits,skiing:renderSkiing,nordic:renderNordic,mountainBiking:renderMtb};
  function render(payload){const data=payload?.chapters?.[chapter];const make=renderers[chapter];if(!data||!make)return;const view=make(data);document.querySelector('[data-activity-history-section]')?.remove();const section=document.createElement('section');section.className='activity-history';section.dataset.activityHistorySection=chapter;section.innerHTML=`<div class="activity-history-head"><h2>${esc(view.title)}</h2><p>${esc(view.intro)}</p></div><div class="activity-history-summary">${view.cards.join('')}</div><div class="activity-history-grid">${view.body}</div>`;const metrics=document.querySelector('main .metrics');metrics?.insertAdjacentElement('afterend',section);}
  fetch(dataUrl,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error(`Activity history unavailable (${r.status})`);return r.json()}).then(render).catch(error=>console.error('Activity history',error));
})();
