(()=>{
  const A=window.AdventureSite;if(!A)return;
  const query=new URLSearchParams(location.search);
  const cleanMatch=location.pathname.match(/\/record\/([^/]+)\/?$/);
  const key=query.get('record')||query.get('id')||(cleanMatch?decodeURIComponent(cleanMatch[1]):'');
  if(!key)return;
  const mediaFor=record=>(Array.isArray(record.media)?record.media:[]).filter(item=>item&&(!item.type||item.type==='image')&&item.src&&item.alt);
  const captionFor=item=>[item.caption,item.credit?`Photo: ${item.credit}`:''].filter(Boolean).join(' · ');
  A.load().then(all=>{
    const record=all.find(x=>x.id===key||x.slug===key);if(!record)return;
    const media=mediaFor(record);if(!media.length)return;
    const hero=media[0],rest=media.slice(1);
    const figure=(item,cls='')=>`<figure class="record-photo ${cls}"><img src="${A.esc(item.src)}" alt="${A.esc(item.alt)}" loading="lazy" decoding="async">${captionFor(item)?`<figcaption>${A.esc(captionFor(item))}</figcaption>`:''}</figure>`;
    const html=`<section class="record-media" id="recordMedia"><div class="record-media-head"><div><p class="eyebrow">Photo essay</p><h2>${A.esc(record.mediaTitle||'Scenes from the day')}</h2></div>${record.mediaIntro?`<p>${A.esc(record.mediaIntro)}</p>`:''}</div><div class="record-photo-essay">${figure(hero,'record-photo-hero')}${rest.length?`<div class="record-photo-grid">${rest.map((item,i)=>figure(item,i===0&&rest.length%2===1?'record-photo-wide':'')).join('')}</div>`:''}</div></section>`;
    const place=()=>{
      if(document.getElementById('recordMedia'))return true;
      const anchor=document.querySelector('.story-record-connections,.major-story-slot,.detail-route-section');
      if(!anchor)return false;
      anchor.insertAdjacentHTML('beforebegin',html);
      document.body.classList.add('has-record-media');
      return true;
    };
    if(place())return;
    const obs=new MutationObserver(()=>{if(place())obs.disconnect()});
    obs.observe(document.getElementById('page'),{childList:true,subtree:true});
  }).catch(e=>console.error('Record media',e));
})();