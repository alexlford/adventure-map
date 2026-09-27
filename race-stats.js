(()=>{
  'use strict';
  const A=window.AdventureSite;if(!A)return;
  const esc=A.esc;
  const script=document.currentScript;
  const dataUrl=script?.src?new URL('data/race-history.json',script.src).href:'data/race-history.json';
  const labels={marathon:'Marathon',road:'Road',trail:'Trail',relay:'Relay',nordic:'Nordic','mountain-bike':'MTB'};
  const miles=value=>Number.isFinite(value)?`${value.toFixed(value>=100?0:1)} mi`:'—';
  const yearRange=years=>!years?.length?'—':years.length===1?String(years[0]):`${years[0]}–${years.at(-1)}`;
  const hrefFor=item=>A.recordHref({id:item.id,slug:item.slug});
  const pct=(value,max)=>max?Math.max(3,Math.round(value/max*100)):0;

  function summaryCard(label,value,detail){return `<article class="race-history-card"><small>${esc(label)}</small><strong>${esc(value)}</strong><p>${esc(detail||'')}</p></article>`}

  function renderYearHistory(history){
    const maxCount=Math.max(1,...history.yearly.map(row=>row.count));
    const rows=history.yearly.map(row=>`<div class="race-history-year-row"><span>${row.year}</span><div class="race-history-year-track" title="${esc(`${row.count} races · ${miles(row.miles)}`)}"><div class="race-history-year-bar" style="width:${pct(row.count,maxCount)}%"></div></div><span class="race-history-year-meta">${row.count} · ${esc(miles(row.miles))}</span></div>`).join('');
    return `<article class="race-history-panel wide"><small>Year-by-year archive</small>${rows}<p class="race-history-note">Each row shows recorded race starts and known race mileage. Mileage only includes normalized distances in the archive.</p></article>`;
  }

  function renderDisciplines(history){
    const max=Math.max(1,...history.disciplines.map(item=>item.count));
    return `<article class="race-history-panel"><small>Discipline mix</small><div class="race-history-disciplines">${history.disciplines.map(item=>`<div class="race-history-discipline"><span>${esc(labels[item.name]||item.name)}</span><span>${item.count}</span><div class="race-history-year-track" style="grid-column:1/-1"><div class="race-history-year-bar" style="width:${pct(item.count,max)}%"></div></div></div>`).join('')}</div></article>`;
  }

  function renderPlaces(history){
    const items=history.topPlaces.slice(0,8);
    return `<article class="race-history-panel"><small>Most-raced places</small><div class="race-history-list">${items.map(item=>`<div class="race-history-list-row"><div><strong>${esc(item.name)}</strong><span>${esc(yearRange(item.years))}</span></div><strong>${item.count}</strong></div>`).join('')}</div></article>`;
  }

  function renderRecurring(history){
    const items=history.recurringSeries.slice(0,8);
    return `<article class="race-history-panel"><small>Recurring traditions</small><div class="race-history-list">${items.map(item=>`<div class="race-history-list-row"><div><strong>${esc(item.name)}</strong><span>${esc(yearRange(item.years))}</span></div><strong>×${item.appearanceCount}</strong></div>`).join('')}</div></article>`;
  }

  function renderMarathons(history){
    if(!history.marathonTimeline.length)return '';
    return `<article class="race-history-panel wide"><small>Marathon chronology</small><div class="race-history-marathons">${history.marathonTimeline.map(item=>`<a class="race-history-marathon" href="${esc(hrefFor(item))}"><small>${esc(String(item.year||''))}</small><strong>${esc(item.name)}</strong><span>${esc([item.time,item.location].filter(Boolean).join(' · '))}</span></a>`).join('')}</div><p class="race-history-note">Chronology is generated from records classified as marathons; result times appear only when the archive contains them.</p></article>`;
  }

  function render(history){
    const host=document.getElementById('timeline');if(!host)return;
    document.querySelector('[data-race-history]')?.remove();
    const s=history.summary;
    const section=document.createElement('section');
    section.className='race-history';section.dataset.raceHistory='true';
    section.innerHTML=`<div class="race-history-head"><div><h2>Race history</h2><p>A sports-history view of the archive: how the racing years accumulated, where the finish lines landed, and which traditions kept returning.</p></div></div><div class="race-history-summary" data-race-history-count="${s.raceCount}">${summaryCard('Known race mileage',miles(s.knownDistanceMiles),`${s.knownDistanceCount} of ${s.raceCount} records with normalized distance`)}${summaryCard('Busiest year',s.busiestYear?String(s.busiestYear.year):'—',s.busiestYear?`${s.busiestYear.count} recorded races`:'')}${summaryCard('Marathons',String(s.marathonCount),s.firstYear&&s.lastYear?`${s.firstYear}–${s.lastYear} archive span`:'')}${summaryCard('Longest documented',s.longestKnown?miles(s.longestKnown.miles):'—',s.longestKnown?.name||'')}</div><div class="race-history-grid">${renderYearHistory(history)}${renderDisciplines(history)}${renderPlaces(history)}${renderRecurring(history)}${renderMarathons(history)}</div>`;
    host.parentNode.insertBefore(section,host);
  }

  fetch(dataUrl,{cache:'no-cache'}).then(response=>{if(!response.ok)throw new Error(`Race history unavailable (${response.status})`);return response.json()}).then(render).catch(error=>console.error('Race history',error));
})();
