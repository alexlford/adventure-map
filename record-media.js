(()=>{
  const A=window.AdventureSite;if(!A)return;
  const query=new URLSearchParams(location.search);
  const cleanMatch=location.pathname.match(/\/record\/([^/]+)\/?$/);
  const key=query.get('record')||query.get('id')||(cleanMatch?decodeURIComponent(cleanMatch[1]):'');
  if(!key)return;
  const mediaFor=record=>(Array.isArray(record.media)?record.media:[]).filter(item=>item&&(!item.type||item.type==='image')&&item.src&&item.alt);
  const companionsFor=record=>(Array.isArray(record.companions)?record.companions:[]).filter(item=>item&&item.name);
  const captionFor=item=>[item.caption,item.credit?`Photo: ${item.credit}`:''].filter(Boolean).join(' · ');
  A.load().then(all=>{
    const record=all.find(x=>x.id===key||x.slug===key);if(!record)return;
    const media=mediaFor(record),companions=companionsFor(record);
    if(!media.length&&!companions.length)return;
    const companionHtml=companions.length?`<article class="story-companion-fact"><small>With</small><strong>${companions.map(c=>A.esc(c.name)).join(' · ')}</strong><span>${companions.map(c=>A.esc(c.relationship||'Companion')).join(' · ')}</span></article>`:'';
    let mediaHtml='';
    if(media.length){
      const hero=media[0],rest=media.slice(1);
      const figure=(item,cls='')=>`<figure class="record-photo ${cls}"><img src="${A.esc(item.src)}" alt="${A.esc(item.alt)}" loading="lazy" decoding="async">${captionFor(item)?`<figcaption>${A.esc(captionFor(item))}</figcaption>`:''}</figure>`;
      mediaHtml=`<section class="record-media" id="recordMedia"><div class="record-media-head"><div><p class="eyebrow">Photo essay</p><h2>${A.esc(record.mediaTitle||'Scenes from the day')}</h2></div>${record.mediaIntro?`<p>${A.esc(record.mediaIntro)}</p>`:''}</div><div class="record-photo-essay">${figure(hero,'record-photo-hero')}${rest.length?`<div class="record-photo-grid">${rest.map((item,i)=>figure(item,i===0&&rest.length%2===1?'record-photo-wide':'')).join('')}</div>`:''}</div></section>`;
    }
    const place=()=>{
      let companionDone=!companions.length||!!document.querySelector('.story-companion-fact');
      if(!companionDone){
        const glance=document.querySelector('.story-record-at-a-glance');
        if(glance){glance.classList.add('has-companions');glance.insertAdjacentHTML('beforeend',companionHtml);companionDone=true;}
      }
      let mediaDone=!media.length||!!document.getElementById('recordMedia');
      if(!mediaDone){
        const anchor=document.querySelector('.mountain-loop-feature,.story-objective-feature,.story-record-connections,.major-story-slot,.detail-route-section');
        if(anchor){anchor.insertAdjacentHTML('beforebegin',mediaHtml);document.body.classList.add('has-record-media');mediaDone=true;}
      }
      return companionDone&&mediaDone;
    };
    if(place())return;
    const root=document.getElementById('page');if(!root)return;
    const obs=new MutationObserver(()=>{if(place())obs.disconnect()});
    obs.observe(root,{childList:true,subtree:true});
  }).catch(e=>console.error('Record media',e));
})();