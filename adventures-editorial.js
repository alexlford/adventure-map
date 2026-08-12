(()=>{
  const A=window.AdventureSite;if(!A)return;
  const esc=A.esc;
  const type=a=>a.discipline==='ski-objective'?'Ski objective':a.discipline==='mountain-loop'?'Mountain loop':a.discipline==='trek'?'Traverse / trek':'Challenge';
  const group=a=>a.discipline==='ski-objective'?'ski':a.discipline==='mountain-loop'?'mountain':'challenge';
  const metric=a=>a.distanceMi?`${a.distanceMi} mi`:a.runs?`${a.runs} runs`:a.distance||type(a);
  const dateLine=a=>`${A.formatDate(a.date)}${a.endDate?` – ${A.formatDate(a.endDate)}`:''}`;
  const dek=a=>a.note||'A memorable chapter from Alex Ford Adventures.';
  const heroMedia=a=>(Array.isArray(a.media)?a.media:[]).find(x=>x&&(!x.type||x.type==='image')&&x.src&&x.alt)||null;
  const image=(item,cls)=>item?`<figure class="${cls}"><img src="${esc(item.src)}" alt="${esc(item.alt)}" loading="lazy" decoding="async">${item.caption?`<figcaption>${esc(item.caption)}</figcaption>`:''}</figure>`:'';
  let records=[],active='all';
  function renderLead(){
    const host=document.getElementById('editorialLead');if(!host||!records.length)return;
    const a=records[0],media=heroMedia(a);
    host.innerHTML=`<a class="story-cover${media?' has-media':''}" href="${A.recordHref(a)}"><div class="story-cover-copy"><p class="story-cover-kicker">Latest story · ${esc(type(a))}</p><h2>${esc(a.name)}</h2><p class="story-cover-dek">${esc(dek(a))}</p><div class="story-cover-meta"><span>${esc(dateLine(a))}</span><span>${esc(a.location||a.region||'')}</span><span>${esc(metric(a))}</span></div><span class="story-read">Read the story →</span></div>${image(media,'story-cover-media')}<aside class="story-cover-folio" aria-hidden="true"><small>Adventures</small><strong>${String(records.length).padStart(2,'0')}</strong><span>${esc(a.region||'Field notes')}</span></aside></a>`;
  }
  function renderShelf(){
    const host=document.getElementById('storyShelf');if(!host)return;
    const picks=records.slice(1,4);
    host.innerHTML=picks.map((a,i)=>{const media=heroMedia(a);return `<a class="story-feature-card story-feature-${i+1}${media?' has-media':''}" href="${A.recordHref(a)}">${image(media,'story-feature-media')}<div class="story-feature-copy"><div><p class="story-feature-kicker">${esc(type(a))} · ${esc(dateLine(a))}</p><h3>${esc(a.name)}</h3><p>${esc(dek(a))}</p></div><div class="story-feature-foot"><span>${esc(a.location||'')}</span><strong>${esc(metric(a))}</strong></div></div></a>`}).join('')||'<p class="empty">More stories will appear here as the collection grows.</p>';
  }
  function renderIndex(){
    const host=document.getElementById('storyIndex');if(!host)return;
    const shown=records.filter(a=>active==='all'||a.group===active);
    host.innerHTML=shown.map((a,i)=>`<a class="story-index-row" href="${A.recordHref(a)}"><span class="story-index-no">${String(i+1).padStart(2,'0')}</span><span class="story-index-main"><small>${esc(type(a))} · ${esc(dateLine(a))}</small><strong>${esc(a.name)}</strong><span>${esc(a.location||'')}</span></span><span class="story-index-value">${esc(metric(a))}</span><span class="story-index-arrow" aria-hidden="true">↗</span></a>`).join('')||'<div class="empty">No stories in this view yet.</div>';
  }
  A.load().then(all=>{
    A.shell('adventures');
    records=all.filter(a=>a.kind==='adventure').map(a=>({...a,group:group(a)})).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    renderLead();renderShelf();
    AdventureFilterState.setup({param:'view',allowed:['all','ski','mountain','challenge'],fallback:'all',onChange:value=>{active=value;renderIndex()}});
  }).catch(e=>{const host=document.getElementById('storyIndex');if(host)host.innerHTML=`<div class="empty">${esc(e.message)}</div>`});
})();