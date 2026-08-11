(()=>{
  const A=window.AdventureSite;
  const page=document.getElementById('page');
  if(!A||!page)return;

  const query=new URLSearchParams(location.search);
  const cleanMatch=location.pathname.match(/\/record\/([^/]+)\/?$/);
  const key=query.get('record')||query.get('id')||(cleanMatch?decodeURIComponent(cleanMatch[1]):'');
  if(!key){page.innerHTML='<div class="empty">Adventure not found.</div>';return;}

  const esc=A.esc;
  const provenanceLabel=p=>p==='personal-gps'?'Personal GPS route':p==='historical-course'?'Historical course':p==='privacy-withheld'?'Route withheld for privacy':p==='location-only'?'Location only':'Route';
  const groupFor=a=>a.kind==='summit'?'summits':a.discipline==='mountain-bike'?'mountain-biking':a.discipline==='nordic'?'nordic':a.discipline==='ski'||a.discipline==='ski-objective'?'skiing':a.kind==='race'?'races':'adventures';
  const labelFor=a=>a.kind==='summit'?'Summit':a.kind==='race'?A.raceType(a):a.kind==='outing'&&a.discipline==='mountain-bike'?(a.mtbMode==='downhill'?'Downhill MTB outing':'MTB outing'):a.kind==='outing'&&a.discipline==='nordic'?'Nordic outing':a.kind==='event'?A.eventType(a):a.discipline==='ski-objective'?'Ski objective':a.discipline==='mountain-loop'?'Mountain adventure':'Challenge / Trek';
  const dateKey=a=>a.date||String(a.year||'0000');
  const feet=m=>Number.isFinite(m)?Math.round(m*3.28084):null;
  const uniq=items=>[...new Map(items.filter(Boolean).map(x=>[x.id,x])).values()];
  const inclusiveDays=(start,end)=>{if(!start||!end)return 1;const a=new Date(`${start}T12:00:00Z`),b=new Date(`${end}T12:00:00Z`);return Math.max(1,Math.round((b-a)/86400000)+1)};
  const fmtValue=(v,suffix='')=>Number.isFinite(v)?`${A.fmt.format(Math.round(v*100)/100)}${suffix}`:'—';
  const dayType=a=>a.mtbMode==='downhill'?'Downhill MTB':a.mtbMode==='mixed'?'MTB + Downhill MTB':'MTB';
  const card=(k,v,p='',wide=false)=>`<article class="sport-panel${wide?' wide':''}"><small>${esc(k)}</small><strong>${esc(v||'—')}</strong>${p?`<p>${esc(p)}</p>`:''}</article>`;
  const sportSection=(title,intro,cards,callout='')=>`<section class="sport-detail"><div class="sport-detail-head"><h2>${esc(title)}</h2><p>${esc(intro)}</p></div><div class="sport-detail-grid">${cards.join('')}</div>${callout}</section>`;

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
    return sportSection('Race dossier','Official race records take precedence over GPS measurements. Strava is retained separately for course geometry, route context, and fallback timing when an individual official result cannot be recovered.',cards,`<div class="detail-callout"><strong>Race archive</strong><p>${a.discipline==='trail'?'Filed with trail races.':a.discipline==='nordic'?'Filed with Nordic racing.':a.discipline==='mountain-bike'?'Filed with mountain-bike racing.':'Filed with road races, including marathons and relays.'}</p></div>`);
  }

  function summitModule(a,all){
    const elevation=a.elevationFt?`${A.fmt.format(a.elevationFt)}′`:'—';
    const sameDay=all.filter(x=>x.id!==a.id&&x.kind==='summit'&&x.date&&x.date===a.date);
    const companion=sameDay.length?sameDay.map(x=>x.name).join(' · '):'Single-summit record';
    return sportSection('Summit dossier','Elevation, outing context, and other peaks connected to the same day.',[
      card('Elevation',elevation,'Recorded summit elevation'),
      card('Outing distance',a.distanceMi?`${a.distanceMi} mi`:'—','GPS outing distance when available'),
      card('Same-day summits',companion,sameDay.length?'Multiple summits share this outing.':'No additional summit is currently linked to this date.',true)
    ]);
  }

  function outingModule(a,all){
    const isMtb=a.discipline==='mountain-bike';
    const peers=all.filter(x=>x.id!==a.id&&x.kind==='outing'&&x.discipline===a.discipline&&x.location===a.location);
    const style=isMtb?dayType(a):'Nordic';
    const climb=isMtb&&a.mtbMode==='downhill'?'Not used for downhill':(a.elevationGainM?fmtValue(a.elevationGainM,' m'):'—');
    return sportSection(`${style} day`,'A day-level record: the outing itself is classified independently from the location so future visits can be different.',[
      card('Day type',style,isMtb?'Classification belongs to this specific ride, not the resort.':'Recreational Nordic outing unless separately identified as a race or named event.'),
      card('Distance',a.distanceMi?`${a.distanceMi} mi`:'—','Recorded GPS distance'),
      card('Elevation gain',climb,isMtb&&a.mtbMode==='downhill'?'Lift ascent is intentionally excluded from pedaled-climbing interpretation.':'Recorded ascent when meaningful.'),
      card('Other outings here',peers.length?String(peers.length):'0',peers.length?peers.slice(0,5).map(x=>A.formatDate(x.date)).join(' · '):'No other day-level outings at this exact location yet.',true)
    ]);
  }

  const storyType=a=>A.adventureType(a);
  const storyTheme=a=>a.discipline==='ski-objective'?'ski':a.discipline==='mountain-loop'?'mountain':a.discipline==='trek'?'traverse':'challenge';
  const storySpan=a=>a.endDate?`${A.formatDate(a.date)} – ${A.formatDate(a.endDate)}`:(a.date?A.formatDate(a.date):String(a.year||'—'));
  const storyHeadline=a=>a.discipline==='ski-objective'&&a.runs?`${a.runs} runs`:a.distance?a.distance:Number.isFinite(a.distanceMi)?`${a.distanceMi} mi`:storyType(a);
  const storySecondary=a=>a.discipline==='ski-objective'&&Number.isFinite(a.descentM)?`${A.fmt.format(Math.round(a.descentM))} m descent`:Number.isFinite(a.elevationGainM)?`${A.fmt.format(Math.round(a.elevationGainM))} m gain`:a.region||a.location||'Adventure';
  const statGrid=stats=>`<div class="story-objective-stats">${stats.filter(Boolean).map(([k,v])=>`<article><small>${esc(k)}</small><strong>${esc(v)}</strong></article>`).join('')}</div>`;

  function genericConnections(connected){
    const connectedHtml=connected.length?connected.map(x=>`<a class="story-linked-record" href="${A.recordHref(x)}"><small>${esc(A.recordType(x))}</small><strong>${esc(x.name)}</strong><span>${esc(x.date?A.formatDate(x.date):(x.year||''))}</span></a>`).join(''):`<div class="story-linked-empty"><strong>Standalone chapter</strong><p>No separate race or summit records are required to tell this story.</p></div>`;
    return `<section class="story-record-connections"><div><p class="eyebrow">Connected records</p><h3>${connected.length?`${connected.length} records inside this chapter`:'One story, one record'}</h3><p>${connected.length?'Open the individual races, summits, or outings that make up the larger story.':'This chapter stands on its own, with the route and verified activity context carrying the record.'}</p></div><div class="story-linked-grid">${connectedHtml}</div></section>`;
  }

  function mountainLoopFeature(a,summits){
    if(a.discipline!=='mountain-loop'||!summits.length)return'';
    const gainFt=feet(a.elevationGainM),over14=summits.filter(s=>Number(s.elevationFt)>=14000).length;
    const stats=[Number.isFinite(a.distanceMi)?['Loop distance',`${a.distanceMi} mi`]:null,gainFt?['Recorded gain',`${A.fmt.format(gainFt)} ft`]:null,Number.isFinite(a.elapsedSeconds)?['Elapsed',A.formatDuration(a.elapsedSeconds)]:null,['Summits ≥14,000 ft',String(over14)]];
    const chain=summits.map((s,i)=>`<a class="mountain-loop-summit" href="${A.recordHref(s)}"><span class="mountain-loop-index">${String(i+1).padStart(2,'0')}</span><span class="mountain-loop-node" aria-hidden="true"></span><small>Summit</small><strong>${esc(s.name)}</strong><em>${Number.isFinite(s.elevationFt)?`${A.fmt.format(s.elevationFt)}′`:'Elevation not recorded'}</em></a>`).join('');
    return `<section class="mountain-loop-feature"><div class="mountain-loop-head"><div><p class="eyebrow">Objective anatomy</p><h3>${summits.length} summits. One loop.</h3></div><p>The summit sequence attached to this Adventure is shown as a single connected objective. Each peak remains independently browsable in the Summit archive.</p></div><div class="mountain-loop-stats">${stats.filter(Boolean).map(([k,v])=>`<article><small>${esc(k)}</small><strong>${esc(v)}</strong></article>`).join('')}</div><div class="mountain-loop-chain" aria-label="Linked summit sequence">${chain}</div></section>`;
  }

  function traverseFeature(a){
    if(a.discipline!=='trek')return'';
    const days=inclusiveDays(a.date,a.endDate),gainFt=feet(a.elevationGainM);
    return `<section class="story-objective-feature traverse-feature"><div class="story-objective-head"><div><p class="eyebrow">Traverse anatomy</p><h3>${days} ${days===1?'day':'days'}. One traverse.</h3></div><p>This chapter emphasizes the documented span and GPS scale of the outing, with the route below carrying the geographic story.</p></div>${statGrid([['Days',String(days)],Number.isFinite(a.distanceMi)?['Recorded distance',`${a.distanceMi} mi`]:null,gainFt?['Recorded gain',`${A.fmt.format(gainFt)} ft`]:null,a.region?['Range / region',a.region]:null])}</section>`;
  }

  function skiFeature(a){
    if(a.discipline!=='ski-objective')return'';
    const descentFt=feet(a.descentM);
    return `<section class="story-objective-feature ski-feature"><div class="story-objective-head"><div><p class="eyebrow">Ski objective</p><h3>${Number.isFinite(a.runs)?`${a.runs} runs. `:''}One mountain chapter.</h3></div><p>Runs, distance, and recorded descent define this objective; ordinary resort days remain in the Skiing logbook instead.</p></div>${statGrid([Number.isFinite(a.runs)?['Recorded runs',String(a.runs)]:null,Number.isFinite(a.distanceMi)?['Recorded distance',`${a.distanceMi} mi`]:null,descentFt?['Recorded descent',`${A.fmt.format(descentFt)} ft`]:null,a.location?['Mountain',a.location]:null])}</section>`;
  }

  function challengeFeature(a,components){
    if(a.discipline!=='challenge'||components.length<2)return'';
    const ordered=[...components].sort((x,y)=>(x.date||'').localeCompare(y.date||'')),days=inclusiveDays(a.date,a.endDate);
    const cards=ordered.map((x,i)=>`<a class="story-component" href="${A.recordHref(x)}"><span>${String(i+1).padStart(2,'0')}</span><small>${esc(A.recordType(x))}${x.date?` · ${esc(A.formatDate(x.date))}`:''}</small><strong>${esc(x.name)}</strong><em>${esc(x.officialTime||x.distance||(Number.isFinite(x.distanceMi)?`${x.distanceMi} mi`:'Open record'))}</em></a>`).join('');
    return `<section class="story-objective-feature challenge-feature"><div class="story-objective-head"><div><p class="eyebrow">Chapter anatomy</p><h3>${ordered.length} components. One story.</h3></div><p>The individual races or events stay independently browsable while this Story preserves the larger challenge or weekend they formed together.</p></div>${statGrid([['Components',String(ordered.length)],['Days',String(days)],Number.isFinite(a.distanceMi)?['Combined distance',`${a.distanceMi} mi`]:null,a.region?['Region',a.region]:null])}<div class="story-component-chain">${cards}</div></section>`;
  }

  function mediaFor(record){return (Array.isArray(record.media)?record.media:[]).filter(item=>item&&(!item.type||item.type==='image')&&item.src&&item.alt)}
  function companionsFor(record){return (Array.isArray(record.companions)?record.companions:[]).filter(item=>item&&item.name)}
  const captionFor=item=>[item.caption,item.credit?`Photo: ${item.credit}`:''].filter(Boolean).join(' · ');

  function mediaModule(record){
    const media=mediaFor(record);if(!media.length)return'';
    const figure=(item,cls='')=>`<figure class="record-photo ${cls}"><img src="${esc(item.src)}" alt="${esc(item.alt)}" loading="lazy" decoding="async">${captionFor(item)?`<figcaption>${esc(captionFor(item))}</figcaption>`:''}</figure>`;
    const hero=media[0],rest=media.slice(1);
    return `<section class="record-media" id="recordMedia"><div class="record-media-head"><div><p class="eyebrow">Photo essay</p><h2>${esc(record.mediaTitle||'Scenes from the day')}</h2></div>${record.mediaIntro?`<p>${esc(record.mediaIntro)}</p>`:''}</div><div class="record-photo-essay">${figure(hero,'record-photo-hero')}${rest.length?`<div class="record-photo-grid">${rest.map((item,i)=>figure(item,i===0&&rest.length%2===1?'record-photo-wide':'')).join('')}</div>`:''}</div></section>`;
  }

  function storyModule(a,all,relationships){
    const stories=all.filter(x=>x.kind==='adventure').sort((x,y)=>(x.date||'').localeCompare(y.date||''));
    const chapter=Math.max(1,stories.findIndex(x=>x.id===a.id)+1);
    const rels=relationships.filter(r=>r.adventureId===a.id||(r.memberIds||[]).includes(a.id));
    const byId=new Map(all.map(x=>[x.id,x]));
    const relatedFromRelationships=uniq(rels.flatMap(r=>(r.memberIds||[]).map(id=>byId.get(id))).filter(Boolean));
    const relatedSummits=(a.linkedSummits||[]).map(id=>byId.get(id)).filter(Boolean);
    const genericConnected=relatedFromRelationships.filter(x=>x.id!==a.id&&!relatedSummits.some(s=>s.id===x.id));
    const allConnected=uniq([...genericConnected,...relatedSummits]).filter(x=>x.id!==a.id);
    const mountainFeature=mountainLoopFeature(a,relatedSummits),traverse=traverseFeature(a),ski=skiFeature(a),challenge=challengeFeature(a,genericConnected);
    let connections='';
    if(mountainFeature)connections=`${mountainFeature}${genericConnected.length?genericConnections(genericConnected):''}`;
    else if(challenge)connections=challenge;
    else if(traverse)connections=`${traverse}${allConnected.length?genericConnections(allConnected):''}`;
    else if(ski)connections=`${ski}${allConnected.length?genericConnections(allConnected):''}`;
    else connections=genericConnections(allConnected);
    const companions=companionsFor(a);
    const companionHtml=companions.length?`<article class="story-companion-fact"><small>With</small><strong>${companions.map(c=>esc(c.name)).join(' · ')}</strong><span>${companions.map(c=>esc(c.relationship||'Companion')).join(' · ')}</span></article>`:'';
    return `<section class="story-record-editorial"><div class="story-record-folio"><span>Story ${String(chapter).padStart(2,'0')}</span><span>${esc(storyType(a))}</span><span>${esc(a.region||'')}</span></div><div class="story-record-deck"><p class="eyebrow">The chapter</p><h2>${esc(a.note||'A day that earned its own chapter in Adventures.')}</h2></div><div class="story-record-at-a-glance${companions.length?' has-companions':''}"><article><small>When</small><strong>${esc(storySpan(a))}</strong></article><article><small>Where</small><strong>${esc(a.location||'—')}</strong></article><article><small>Scale</small><strong>${esc(storyHeadline(a))}</strong><span>${esc(storySecondary(a))}</span></article>${companionHtml}</div></section>${connections}`;
  }

  const paceSeconds=value=>{const m=String(value||'').match(/(\d+):(\d+)/);return m?Number(m[1])*60+Number(m[2]):null};
  const clockSeconds=value=>{const p=String(value||'').split(':').map(Number);return p.length===3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:null};
  const paceLabel=seconds=>`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}/mi`;
  const clockLabel=seconds=>{const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=Math.round(seconds%60);return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`};
  const shortLabel=label=>label==='Finish'?'F':label==='Half'?'H':String(label||'').replace('K','k');

  function raceArc(record){
    const splits=(record.officialSplits||[]).map(s=>({...s,paceSeconds:paceSeconds(s.pace)})).filter(s=>Number.isFinite(s.paceSeconds));if(splits.length<2)return'';
    const width=760,height=250,left=52,right=18,top=24,bottom=44,plotW=width-left-right,plotH=height-top-bottom;
    const vals=splits.map(s=>s.paceSeconds),min=Math.floor((Math.min(...vals)-20)/30)*30,max=Math.ceil((Math.max(...vals)+20)/30)*30,range=Math.max(60,max-min);
    const xy=splits.map((s,i)=>({s,x:left+(plotW*i/(splits.length-1)),y:top+((s.paceSeconds-min)/range)*plotH}));
    const ticks=[];for(let t=Math.ceil(min/60)*60;t<=max;t+=60)ticks.push(t);
    const grid=ticks.map(t=>{const y=top+((t-min)/range)*plotH;return `<line class="major-arc-grid" x1="${left}" y1="${y.toFixed(1)}" x2="${width-right}" y2="${y.toFixed(1)}"></line><text class="major-arc-label" x="${left-8}" y="${(y+4).toFixed(1)}" text-anchor="end">${esc(paceLabel(t).replace('/mi',''))}</text>`}).join('');
    const line=xy.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const points=xy.map(p=>`<circle class="major-arc-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5"></circle><text class="major-arc-label" x="${p.x.toFixed(1)}" y="${height-15}" text-anchor="middle">${esc(shortLabel(p.s.label))}</text>`).join('');
    const fastest=splits.reduce((a,b)=>a.paceSeconds<=b.paceSeconds?a:b),slowest=splits.reduce((a,b)=>a.paceSeconds>=b.paceSeconds?a:b);
    const half=record.officialSplits?.find(s=>String(s.label).toLowerCase()==='half'),finish=clockSeconds(record.officialTime),halfSeconds=clockSeconds(half?.time),secondHalf=Number.isFinite(finish)&&Number.isFinite(halfSeconds)?finish-halfSeconds:null,diff=Number.isFinite(secondHalf)?secondHalf-halfSeconds:null;
    return `<div class="major-race-arc"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Official segment pace progression from the marathon timing splits. Lower on the chart means a slower pace.">${grid}<polyline class="major-arc-line" points="${line}"></polyline>${points}</svg><div class="major-arc-note"><div><small>First half</small><strong>${esc(half?.time||'—')}</strong></div><div><small>Second half</small><strong>${esc(Number.isFinite(secondHalf)?clockLabel(secondHalf):'—')}${Number.isFinite(diff)?` · +${esc(clockLabel(diff))}`:''}</strong></div><div><small>Race arc</small><strong>${esc(fastest.label)} ${esc(fastest.pace)} → toughest ${esc(slowest.label)} ${esc(slowest.pace)}</strong></div></div></div>`;
  }

  function majorModule(record,majorData){
    const major=(majorData?.majors||[]).find(x=>x.recordId===record.id);if(!major||major.status!=='completed')return'';
    const completed=(majorData.majors||[]).filter(x=>x.status==='completed'),order=completed.findIndex(x=>x.id===major.id)+1;
    const course=Boolean(record.routeStatus==='gps'||(record.routeFeatureIds||[]).length),splits=record.officialSplits||[],photos=mediaFor(record).length>0,story=Boolean(record.story||record.storyBody);
    const result=record.officialTime||A.formatDuration(record.elapsedSeconds)||'Recorded';
    const placement=[record.officialPlace?`Overall ${A.fmt.format(record.officialPlace)}`:'',record.genderPlace?`Gender ${A.fmt.format(record.genderPlace)}`:'',record.ageGroupPlace?`Age group ${A.fmt.format(record.ageGroupPlace)}`:''].filter(Boolean);
    const resultLink=record.resultUrl?`<a class="major-source-link" href="${esc(record.resultUrl)}" target="_blank" rel="noopener">Open official result ↗</a>`:'';
    const splitRows=splits.map(s=>`<tr><th scope="row">${esc(s.label)}</th><td>${esc(s.time||'—')}</td><td>${esc(s.segmentTime||'—')}</td><td>${esc(s.pace||'—')}</td></tr>`).join('');
    const splitSection=splits.length?`<section class="major-race-dossier"><div class="major-dossier-head"><div><p class="eyebrow">Official race dossier</p><h3>The race arc</h3></div><p>The chart and table use the official timing checkpoints from this result record. The chart visualizes normalized segment pace; the table preserves the exact splits.</p></div>${raceArc(record)}<div class="major-split-table-wrap"><table class="major-split-table"><thead><tr><th>Checkpoint</th><th>Cumulative</th><th>Segment</th><th>Segment pace</th></tr></thead><tbody>${splitRows}</tbody></table></div></section>`:'';
    const officialDistance=record.officialDistanceMi?`${record.officialDistanceMi} mi`:record.officialDistance||'Marathon',gpsDistance=Number.isFinite(record.stravaDistanceMi)?`${record.stravaDistanceMi} mi`:Number.isFinite(record.distanceMi)?`${record.distanceMi} mi`:'';
    const courseBridge=course?`<section class="major-course-bridge"><div><p class="eyebrow">Course</p><h3>The official race, preserved through the personal GPS track.</h3><p>The organizer result owns the race distance and finish time; the watch recording owns the route geometry shown below.</p></div><div class="major-course-stats"><span>Official ${esc(officialDistance)}</span>${gpsDistance?`<span>GPS ${esc(gpsDistance)}</span>`:''}<span>Personal route ✓</span></div></section>`:'';
    const assetLine=`${record.officialTime||record.elapsedSeconds||record.resultUrl?'✓ Result':'＋ Result'} · ${splits.length?'✓ Splits':'＋ Splits'} · ${course?'✓ Course':'＋ Course'} · ${photos?'✓ Photos':'＋ Photos'} · ${story?'✓ Story':'＋ Story'}`;
    const storyTitle=record.storyTitle||'The first earned Major.',storyCopy=story?(record.storyBody||record.story):`${major.name} is the first completed race in this living World Marathon Majors passport. The verified result, split progression, and personal course are already preserved here. Photography and a personal race-day narrative can be added later without changing the evidence underneath.`;
    return `<section class="sport-detail major-passport-detail" id="majorPassportDetail"><div class="sport-detail-head"><div><p class="eyebrow">World Marathon Majors passport</p><h2>Major ${String(Math.max(order,1)).padStart(2,'0')} · ${esc(major.name.replace(' Marathon',''))}</h2></div><p>An earned Major becomes a permanent passport entry: verified result, course, race-day evidence and the story behind it.</p></div><div class="major-result-hero"><div><small>Official finish</small><strong>${esc(result)}</strong><span>${esc(A.formatDate(record.date))} · Bib ${esc(record.bib||'—')}</span></div><div class="major-result-places">${placement.map(x=>`<span>${esc(x)}</span>`).join('')}</div>${resultLink}</div><div class="sport-detail-grid major-passport-grid"><article class="sport-panel"><small>Major completed</small><strong>✓ ${esc(major.name.replace(' Marathon',''))}</strong><p>${esc(record.location||major.city)} · ${esc(record.division?`Division ${record.division}`:'Completed')}</p></article><article class="sport-panel"><small>Course</small><strong>${course?'✓ Personal GPS':'Not yet attached'}</strong><p>${course?'The recorded race route remains the personal GPS layer for this entry.':'Course geometry can be added when verified.'}</p></article><article class="sport-panel"><small>Passport assets</small><strong>${esc(assetLine)}</strong><p>Only verified or genuinely attached assets are marked complete.</p></article></div>${splitSection}${courseBridge}<section class="major-story-slot"><div><p class="eyebrow">Race chapter</p><h3>${esc(storyTitle)}</h3><p>${esc(storyCopy)}</p></div><aside><small>Collection</small><strong>${esc(assetLine).replaceAll(' · ','<br>')}</strong></aside></section><div class="detail-callout"><strong>Follow the full Majors journey</strong><p><a href="${A.pageHref('races.html')}#world-majors">Open the World Marathon Majors passport →</a></p></div></section>`;
  }

  function relatedModule(a,all,relationships){
    const byId=new Map(all.map(x=>[x.id,x]));
    const related=relationships.filter(rel=>(rel.memberIds||[]).includes(a.id)||rel.adventureId===a.id);
    if(!related.length)return'';
    return `<section><div class="section-title"><h2>Part of a larger story</h2><p>Related events and challenges connected across Adventures.</p></div><div class="grid">${related.map(rel=>{const links=(rel.memberIds||[]).filter(x=>x!==a.id).map(x=>byId.get(x)).filter(Boolean).map(x=>`<a href="${A.recordHref(x)}">${esc(x.name)}</a>`);if(rel.adventureId&&rel.adventureId!==a.id&&byId.has(rel.adventureId)){const relatedAdventure=byId.get(rel.adventureId);links.push(`<a href="${A.recordHref(relatedAdventure)}">${esc(relatedAdventure.name)}</a>`)}return `<article class="card"><p class="card-kicker">${esc((rel.years||[]).join(' · '))}</p><h3>${esc(rel.name)}</h3><p class="card-meta">${esc(rel.summary||'')}</p>${links.length?`<p class="card-meta">Related: ${links.join(' · ')}</p>`:''}</article>`}).join('')}</div></section>`;
  }

  function chronologyModule(a,all){
    const peers=all.filter(x=>x.id!==a.id&&groupFor(x)===groupFor(a)).sort((x,y)=>dateKey(x).localeCompare(dateKey(y))),ordered=[...peers,a].sort((x,y)=>dateKey(x).localeCompare(dateKey(y))),idx=ordered.findIndex(x=>x.id===a.id),prev=idx>0?ordered[idx-1]:null,next=idx<ordered.length-1?ordered[idx+1]:null;
    if(!prev&&!next)return'';
    const story=a.kind==='adventure';
    return `<nav class="chronology-nav" aria-label="Nearby entries">${prev?`<a class="chronology-link" href="${A.recordHref(prev)}"><small>${story?'Previous story':`Previous ${esc(groupFor(a).replace('-',' '))} entry`}</small><strong>← ${esc(prev.name)}</strong></a>`:'<div></div>'}${next?`<a class="chronology-link next" href="${A.recordHref(next)}"><small>${story?'Next story':`Next ${esc(groupFor(a).replace('-',' '))} entry`}</small><strong>${esc(next.name)} →</strong></a>`:''}</nav>`;
  }

  function baseHero(a){
    const label=labelFor(a),actions=[a.resultUrl?`<a class="button-link" href="${esc(a.resultUrl)}" target="_blank" rel="noreferrer">View published result</a>`:'',`<a class="button-link secondary" href="${A.pageHref('map.html')}">Explore on map</a>`].filter(Boolean).join('');
    const chips=[label,a.date?A.formatDate(a.date):a.year,a.location,a.routeInfo?.provenance?provenanceLabel(a.routeInfo.provenance):null].filter(Boolean).map(x=>`<span class="almanac-chip">${esc(x)}</span>`).join('');
    return `<section class="hero${a.kind==='adventure'?' story-record-hero':''}"><p class="eyebrow">Adventures · ${a.kind==='adventure'?'Story':esc(label)}</p><h1>${esc(a.name)}</h1><p>${esc(a.currentName?`Now known as ${a.currentName}. `:'')}${esc(a.location||'')}${a.date?` · ${esc(A.formatDate(a.date))}`:''}${a.endDate?` – ${esc(A.formatDate(a.endDate))}`:''}</p><div class="almanac-strip">${chips}</div><div class="record-actions">${actions}</div></section>`;
  }

  function metricsModule(a){
    const isSummit=a.kind==='summit',isRace=a.kind==='race',isDownhill=a.discipline==='mountain-bike'&&(a.mtbMode==='downhill'||a.mapCategory==='downhill-mtb');
    const value=isSummit?`${A.fmt.format(a.elevationFt)}′`:a.officialTime||a.distance||(a.distanceMi?`${a.distanceMi} mi`:'');
    return `<section class="metrics"><div class="metric"><strong>${esc(value||'—')}</strong><span>${isSummit?'elevation':isRace?'result / distance':'headline metric'}</span></div><div class="metric"><strong>${a.distanceMi?esc(a.distanceMi)+' mi':'—'}</strong><span>recorded distance</span></div><div class="metric"><strong>${!isDownhill&&a.elevationGainM?A.fmt.format(Math.round(a.elevationGainM))+' m':'—'}</strong><span>${isDownhill?'pedaled gain not used':'recorded gain'}</span></div><div class="metric"><strong>${a.elapsedSeconds?esc(A.formatDuration(a.elapsedSeconds)):'—'}</strong><span>elapsed time</span></div></section>`;
  }

  function profileModule(a,all){
    const label=labelFor(a),ordered=all.filter(x=>groupFor(x)===groupFor(a)).sort((x,y)=>dateKey(x).localeCompare(dateKey(y))),idx=ordered.findIndex(x=>x.id===a.id);
    return `<section class="profile"><div class="profile-copy"><p class="eyebrow">The record</p><h2>${esc(a.note||'A place, a date, and the effort behind it.')}</h2><div class="fact-list"><div class="fact"><small>Date</small><strong>${esc(A.formatDate(a.date)||String(a.year||'—'))}</strong></div><div class="fact"><small>Location</small><strong>${esc(a.location||'—')}</strong></div><div class="fact"><small>Type</small><strong>${esc(label)}</strong></div><div class="fact"><small>Collection</small><strong>${esc(groupFor(a).replace('-',' '))}</strong></div>${a.bib?`<div class="fact"><small>Bib</small><strong>${esc(a.bib)}</strong></div>`:''}${a.officialPlace?`<div class="fact"><small>Place</small><strong>${esc(a.officialPlace)}</strong></div>`:''}${a.eventSeries?`<div class="fact"><small>Series</small><strong>${esc(a.eventSeries)}</strong></div>`:''}${a.stravaActivityId?`<div class="fact"><small>Activity</small><strong>Strava ${esc(a.stravaActivityId)}</strong></div>`:''}</div></div><aside><p class="eyebrow">Context</p><div class="card"><p class="card-kicker">Archive position</p><h3>${Math.max(idx+1,1)} of ${ordered.length}</h3><p class="card-meta">Chronological position among ${esc(groupFor(a).replace('-',' '))} records currently in Adventures.</p></div></aside></section>`;
  }

  function routeModule(a){return `<section class="detail-route-section"><h2>${a.kind==='summit'?'Recorded outing':'Course & location'}</h2><p id="routeMeta" class="card-meta">Loading route provenance…</p><div id="detailMap" class="detail-map" aria-label="Map for ${esc(a.name)}"></div></section>`}

  function sportModule(a,all,relationships){
    const related=relationships.filter(r=>(r.memberIds||[]).includes(a.id)||r.adventureId===a.id);
    if(a.kind==='race')return raceModule(a,related);
    if(a.kind==='summit')return summitModule(a,all);
    if(a.kind==='outing'&&(a.discipline==='mountain-bike'||a.discipline==='nordic'))return outingModule(a,all);
    return'';
  }

  async function renderRecordMap(a){
    const el=document.getElementById('detailMap');if(!el)return;
    try{
      const [collection,recordOverride]=await Promise.all([AdventureRoutes.loadAll(),AdventureRoutes.recordProvenance(a.id)]);
      const features=(collection.features||[]).filter(f=>(f.properties?.adventureIds||[]).includes(a.id)),hasPoint=Number.isFinite(a.lat)&&Number.isFinite(a.lon),routeMeta=document.getElementById('routeMeta');
      if(routeMeta){const primary=features[0]?.properties;if(primary)routeMeta.textContent=`${provenanceLabel(primary.provenance)}${primary.note?` · ${primary.note}`:''}`;else if(recordOverride)routeMeta.textContent=`${provenanceLabel(recordOverride.provenance)}${recordOverride.note?` · ${recordOverride.note}`:''}`;else routeMeta.textContent='Location marker only; no public route geometry is attached to this record.';}
      if(!features.length&&!hasPoint){el.outerHTML='<div class="empty">No public route geometry is available for this record yet.</div>';return;}
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const map=L.map(el,{scrollWheelZoom:false,worldCopyJump:true,zoomControl:true});window.stabilizeLeafletMap?.(map,el);
      const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors',updateWhenIdle:false,keepBuffer:3}).addTo(map);tiles.on('load',()=>map.invalidateSize({pan:false}));
      if(features.length){const geo=L.geoJSON({type:'FeatureCollection',features},{style:f=>({weight:4.5,opacity:f.properties?.provenance==='historical-course'?.64:.86,dashArray:f.properties?.provenance==='historical-course'?'8 6':null,lineCap:'round',lineJoin:'round'})}).addTo(map);map.fitBounds(geo.getBounds(),{padding:[30,30],maxZoom:14});}
      else{L.circleMarker([a.lat,a.lon],{radius:8,weight:2,fillOpacity:.9}).addTo(map);map.setView([a.lat,a.lon],a.kind==='summit'?10:11);}
      setTimeout(()=>map.invalidateSize({pan:false}),120);setTimeout(()=>{map.invalidateSize({pan:false});tiles.redraw();},450);
    }catch(e){console.error(e);if(el.isConnected)el.outerHTML='<div class="empty">Route map could not be loaded.</div>';}
  }

  async function run(){
    try{
      const [all,relationships,majorData]=await Promise.all([
        A.load(),
        A.loadRelationships(),
        fetch('data/world-majors.json').then(r=>r.ok?r.json():{majors:[]}).catch(()=>({majors:[]}))
      ]);
      const a=all.find(x=>x.id===key||x.slug===key);if(!a)throw new Error('Adventure not found.');
      const isStory=a.kind==='adventure';
      A.shell(groupFor(a));
      document.title=`${a.name} | Alex Ford Adventures`;
      if(isStory){document.body.classList.add('story-record-page',`story-theme-${storyTheme(a)}`);document.body.dataset.storyTheme=storyTheme(a);}
      if(mediaFor(a).length)document.body.classList.add('has-record-media');
      const description=isStory?`${storyType(a)} · ${a.location||'Alex Ford Adventures'} · ${storySpan(a)}`:`${labelFor(a)} · ${a.location||''}${a.date?` · ${A.formatDate(a.date)}`:''}`;
      const sections=[baseHero(a)];
      if(isStory){sections.push(storyModule(a,all,relationships));}
      else{
        sections.push(metricsModule(a),profileModule(a,all));
        const related=relatedModule(a,all,relationships);if(related)sections.push(related);
        const sport=sportModule(a,all,relationships);if(sport)sections.push(sport);
        const major=majorModule(a,majorData);if(major)sections.push(major);
      }
      const media=mediaModule(a);if(media)sections.push(media);
      sections.push(routeModule(a),chronologyModule(a,all));
      page.innerHTML=sections.filter(Boolean).join('');
      A.refreshMeta(description);
      await renderRecordMap(a);
      if(A.isProduction()&&/detail\.html$/.test(location.pathname)){history.replaceState(null,'',A.recordHref(a));A.refreshMeta(description);}
    }catch(e){console.error('Record renderer',e);page.innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
  }

  run();
})();
