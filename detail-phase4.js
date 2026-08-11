(()=>{
  const A=window.AdventureSite;if(!A)return;
  const params=new URLSearchParams(location.search),recordKey=params.get('record'),legacyId=params.get('id');
  const esc=A.esc;
  const fmtValue=(v,suffix='')=>Number.isFinite(v)?`${A.fmt.format(Math.round(v*100)/100)}${suffix}`:'—';
  const dayType=a=>a.mtbMode==='downhill'?'Downhill MTB':a.mtbMode==='mixed'?'MTB + Downhill MTB':'MTB';
  const section=(title,intro,cards,callout='')=>`<section class="sport-detail"><div class="sport-detail-head"><h2>${esc(title)}</h2><p>${esc(intro)}</p></div><div class="sport-detail-grid">${cards.join('')}</div>${callout}</section>`;
  const card=(k,v,p='',wide=false)=>`<article class="sport-panel${wide?' wide':''}"><small>${esc(k)}</small><strong>${esc(v||'—')}</strong>${p?`<p>${esc(p)}</p>`:''}</article>`;
  function raceModule(a,rels){
    const series=rels.map(r=>r.name).join(' · ')||a.eventSeries||'Standalone race';
    const officialDistance=a.officialDistance||(Number.isFinite(a.officialDistanceMi)?`${a.officialDistanceMi} mi`:a.distance||'—');
    const place=a.officialPlace?`Overall place ${a.officialPlace}`:a.racePlace?`Race place ${a.racePlace}`:a.ageGroupPlace?`Age-group place ${a.ageGroupPlace}`:'';
    const result=a.officialTime||a.result||'Official time not recovered';
    const cards=[
      card('Official result',result,place||'Organizer/timer result when available'),
      card('Official distance',officialDistance,'Race distance from the organizer/event record'),
      card('Race family',series,'Series, challenge, or recurring-event context')
    ];
    if(a.participationMode||a.completionDate){
      const mode=a.participationMode==='virtual'?'Virtual completion':a.participationMode==='in-person'?'In-person race':a.participationMode||'Recorded completion';
      const timing=a.completionDate&&a.completionDate!==a.date?`Organizer event: ${A.formatDate(a.date)} · completed: ${A.formatDate(a.completionDate)}`:(a.date?`Event date: ${A.formatDate(a.date)}`:'Participation evidence retained in the race archive.');
      cards.push(card('Participation',mode,timing));
    }
    const gpsDistance=Number.isFinite(a.stravaDistanceMi)?`${a.stravaDistanceMi} mi`:a.distanceMi?`${a.distanceMi} mi`:'';
    const gpsSeconds=Number.isFinite(a.stravaElapsedSeconds)?a.stravaElapsedSeconds:a.elapsedSeconds;
    if(gpsDistance||Number.isFinite(gpsSeconds))cards.push(card('GPS recording',[gpsDistance,Number.isFinite(gpsSeconds)?A.formatDuration(gpsSeconds):''].filter(Boolean).join(' · '),'Strava/watch recording retained for route and GPS context; it does not override the official race result.'));
    if(a.award)cards.push(card('Award',a.award,a.ageGroupPlace?`Age-group place: ${a.ageGroupPlace}`:'Race-day award'));
    if(a.bib)cards.push(card('Bib',String(a.bib),'Race-day identifier'));
    if(a.resultUrl)cards.push(card('Published record','Results available','A public result source is linked above.'));
    else if(a.resultSource)cards.push(card('Result source',a.resultSource,'Official or organizer-linked source used for the race record.'));
    return section('Race dossier','Official race records take precedence over GPS measurements. Strava is retained separately for course geometry, route context, and fallback timing when an individual official result cannot be recovered.',cards,`<div class="detail-callout"><strong>Race archive</strong><p>${a.discipline==='trail'?'Filed with trail races.':a.discipline==='nordic'?'Filed with Nordic racing.':a.discipline==='mountain-bike'?'Filed with mountain-bike racing.':'Filed with road races, including marathons and relays.'}</p></div>`);
  }
  function summitModule(a,all){
    const elevation=a.elevationFt?`${A.fmt.format(a.elevationFt)}′`:'—';
    const sameDay=all.filter(x=>x.id!==a.id&&x.kind==='summit'&&x.date&&x.date===a.date);
    const companion=sameDay.length?sameDay.map(x=>x.name).join(' · '):'Single-summit record';
    return section('Summit dossier','Elevation, outing context, and other peaks connected to the same day.',[
      card('Elevation',elevation,'Recorded summit elevation'),
      card('Outing distance',a.distanceMi?`${a.distanceMi} mi`:'—','GPS outing distance when available'),
      card('Same-day summits',companion,sameDay.length?'Multiple summits share this outing.':'No additional summit is currently linked to this date.',true)
    ]);
  }
  function outingModule(a,all){
    const isMtb=a.discipline==='mountain-bike';
    const peers=all.filter(x=>x.id!==a.id&&x.kind==='outing'&&x.discipline===a.discipline&&x.location===a.location);
    const style=isMtb?dayType(a):'Nordic';
    const climb=isMtb&&a.mtbMode==='downhill'?'Not used for downhill':(a.elevationGainM?`${fmtValue(a.elevationGainM,' m')}`:'—');
    return section(`${style} day`,`A day-level record: the outing itself is classified independently from the location so future visits can be different.`,[
      card('Day type',style,isMtb?'Classification belongs to this specific ride, not the resort.':'Recreational Nordic outing unless separately identified as a race or named event.'),
      card('Distance',a.distanceMi?`${a.distanceMi} mi`:'—','Recorded GPS distance'),
      card('Elevation gain',climb,isMtb&&a.mtbMode==='downhill'?'Lift ascent is intentionally excluded from pedaled-climbing interpretation.':'Recorded ascent when meaningful.'),
      card('Other outings here',peers.length?String(peers.length):'0',peers.length?peers.slice(0,5).map(x=>A.formatDate(x.date)).join(' · '):'No other day-level outings at this exact location yet.',true)
    ]);
  }
  function adventureModule(a,rels){
    const related=rels.reduce((n,r)=>n+(r.memberIds||[]).length,0);
    return section('Adventure story','The story layer of Adventures: multi-part objectives, traverses, challenges, and weekends that are more than a single race or ordinary activity.',[
      card('Adventure type',A.adventureType(a),'Story classification'),
      card('Span',a.endDate?`${A.formatDate(a.date)} – ${A.formatDate(a.endDate)}`:(a.date?A.formatDate(a.date):String(a.year||'—')),'When this story happened'),
      card('Connected records',related?String(related):'—',related?'Events or records tied into this story.':'Standalone adventure story.')
    ]);
  }
  async function run(){
    try{
      const [all,rels]=await Promise.all([A.load(),A.loadRelationships()]);
      const a=all.find(x=>recordKey?(x.slug===recordKey||x.id===recordKey):x.id===legacyId);if(!a)return;
      const related=rels.filter(r=>(r.memberIds||[]).includes(a.id)||r.adventureId===a.id);
      let html='';
      if(a.kind==='race')html=raceModule(a,related);
      else if(a.kind==='summit')html=summitModule(a,all);
      else if(a.kind==='outing'&&(a.discipline==='mountain-bike'||a.discipline==='nordic'))html=outingModule(a,all);
      else if(a.kind==='adventure')html=adventureModule(a,related);
      else return;
      const refreshMeta=()=>A.refreshMeta?.(`${A.recordType(a)} · ${a.location||'Alex Ford Adventures'}${a.date?` · ${A.formatDate(a.date)}`:''}`);
      const wait=()=>{const route=document.querySelector('.detail-route-section');if(route){route.insertAdjacentHTML('beforebegin',html);refreshMeta();return true}return false};
      if(wait())return;
      const obs=new MutationObserver(()=>{if(wait())obs.disconnect()});obs.observe(document.getElementById('page'),{childList:true,subtree:true});
    }catch(e){console.error('Adventure detail module',e)}
  }
  run();
})();
