(()=>{
  const A=window.AdventureSite;if(!A)return;
  const query=new URLSearchParams(location.search);
  const cleanMatch=location.pathname.match(/\/record\/([^/]+)\/?$/);
  const key=query.get('record')||query.get('id')||(cleanMatch?decodeURIComponent(cleanMatch[1]):'');
  if(!key)return;
  const available=(record,kind)=>kind==='result'?Boolean(record.officialTime||record.elapsedSeconds||record.resultUrl):kind==='course'?Boolean(record.routeStatus==='gps'||(record.routeFeatureIds||[]).length):false;
  Promise.all([A.load(),fetch('data/world-majors.json').then(r=>{if(!r.ok)throw new Error('Unable to load World Majors passport');return r.json()})]).then(([all,data])=>{
    const record=all.find(x=>x.id===key||x.slug===key);if(!record)return;
    const major=(data.majors||[]).find(x=>x.recordId===record.id);if(!major||major.status!=='completed')return;
    const order=(data.majors||[]).filter(x=>x.status==='completed').findIndex(x=>x.id===major.id)+1;
    const official=Boolean(record.officialTime),result=record.officialTime||A.formatDuration(record.elapsedSeconds)||'Recorded',course=available(record,'course');
    const html=`<section class="sport-detail major-passport-detail" id="majorPassportDetail"><div class="sport-detail-head"><div><p class="eyebrow">World Marathon Majors passport</p><h2>Star ${String(Math.max(order,1)).padStart(2,'0')} · ${A.esc(major.name.replace(' Marathon',''))}</h2></div><p>This earned Major now has its own growing passport entry. Verified and recorded assets appear as they are added to Adventures.</p></div><div class="sport-detail-grid"><article class="sport-panel"><small>Star earned</small><strong>★ ${A.esc(major.name.replace(' Marathon',''))}</strong><p>${A.esc(A.formatDate(record.date))} · ${A.esc(record.location||major.city)}</p></article><article class="sport-panel"><small>${official?'Official result':'Recorded result'}</small><strong>${A.esc(result)}</strong><p>${official?'Verified finish result.':'Strava elapsed time; an official finish time has not yet been attached to this record.'}</p></article><article class="sport-panel"><small>Course</small><strong>${course?'✓ Personal GPS':'Not yet attached'}</strong><p>${course?'The recorded course is available on this page.':'Course geometry can be added when verified.'}</p></article><article class="sport-panel wide"><small>Passport collection</small><strong>${available(record,'result')?'✓ Result':'＋ Result'} · ${course?'✓ Course':'＋ Course'} · ＋ Photos · ＋ Story</strong><p>Result and course are evidence-driven. Photos and the narrative remain open slots until they are actually added.</p></article></div><div class="detail-callout"><strong>Follow the full Majors journey</strong><p><a href="${A.pageHref('races.html')}#world-majors">Open the World Marathon Majors passport →</a></p></div></section>`;
    const place=()=>{if(document.getElementById('majorPassportDetail'))return true;const route=document.querySelector('.detail-route-section');if(!route)return false;route.insertAdjacentHTML('beforebegin',html);return true};
    if(place())return;const obs=new MutationObserver(()=>{if(place())obs.disconnect()});obs.observe(document.getElementById('page'),{childList:true,subtree:true});
  }).catch(e=>console.error('World Major detail',e));
})();
