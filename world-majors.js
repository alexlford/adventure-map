(()=>{
  const A=window.AdventureSite;if(!A)return;
  const cityName=x=>x.name.replace(' Marathon','').replace('TCS New York City','New York City');
  const statusLabel=x=>x.status==='completed'?'Completed':x.status==='registered'?'Registered':x.membership==='joins-2027'?'Joining the Majors in 2027':'Future target';
  const markerColor=x=>x.status==='completed'?'#27654e':x.status==='registered'?'#b47f2d':x.membership==='joins-2027'?'#2f6f8f':'#87928d';

  function ensureMajorsFixStyles(){
    if(document.getElementById('majorsResponsiveFix'))return;
    const style=document.createElement('style');
    style.id='majorsResponsiveFix';
    style.textContent=`
      .majors-passport-grid{align-items:start}
      .major-passport{display:block!important;min-height:0!important;padding:18px 18px 18px 60px!important}
      .major-passport .card-kicker{margin:0 0 5px!important}
      .major-passport h3{margin:0!important;line-height:1.06}
      .major-passport .card-meta{margin:7px 0 0!important;line-height:1.38}
      .passport-number{left:16px!important;right:auto!important;top:16px!important;font-size:1.35rem!important;color:rgba(33,58,49,.24)!important}
      .passport-grow{margin-top:14px!important;padding-right:0!important;gap:5px!important}
      .passport-grow span{padding:4px 7px!important}
      .passport-state{display:none!important}
      .major-passport.completed{padding-right:66px!important}
      .passport-earned-stamp{position:absolute!important;right:13px!important;top:13px!important;width:46px!important;height:46px!important;border:2px solid rgba(39,101,78,.6)!important;border-radius:50%!important;box-shadow:inset 0 0 0 3px rgba(39,101,78,.08)!important;color:#27654e!important;background:rgba(255,255,255,.9)!important;transform:rotate(-7deg)!important;display:grid!important;grid-template-rows:1fr auto!important;place-items:center!important;padding:7px 3px 6px!important;line-height:1!important;letter-spacing:0!important}
      .passport-earned-stamp span{display:block;font-size:1.18rem;font-weight:900;line-height:.9}
      .passport-earned-stamp small{display:block;font-size:.31rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;line-height:1}
      .passport-earned-stamp:after{content:none!important}

      .majors-world{height:clamp(300px,34vw,390px)!important;aspect-ratio:auto!important;background:#e7ede9!important;background-image:none!important;border:1px solid rgba(33,58,49,.12)}
      .majors-world.leaflet-container{font-family:inherit}
      .majors-world .leaflet-tile-pane{filter:saturate(.58) contrast(.94) brightness(1.05)}
      .majors-world .leaflet-control-attribution{padding:2px 5px;background:rgba(247,244,238,.8);font-size:8px;color:#66736d}
      .majors-leaflet-label.leaflet-tooltip{padding:4px 7px;border:1px solid rgba(33,58,49,.13);border-radius:999px;background:rgba(255,255,255,.95);box-shadow:0 4px 14px rgba(23,32,42,.12);color:#33443d;font-size:.58rem;font-weight:850;line-height:1;white-space:nowrap}
      .majors-leaflet-label.leaflet-tooltip:before{display:none}
      .majors-leaflet-label.completed{border-color:rgba(39,101,78,.34);color:#27654e}
      .majors-leaflet-label.registered{border-color:rgba(180,127,45,.42);color:#80591d}
      .majors-leaflet-label.candidate{border-style:dashed;color:#66736d}
      .majors-map-index{display:grid;place-items:center;width:22px;height:22px;border:2px solid #fff;border-radius:50%;background:#87928d;color:#fff;box-shadow:0 2px 7px rgba(23,32,42,.24);font-size:.5rem;font-weight:900;line-height:1}
      .majors-map-index.completed{background:#27654e}
      .majors-map-index.registered{background:#b47f2d}
      .majors-map-index.candidate{background:#fff;color:#66736d;border-color:#66736d;border-style:dashed}
      .majors-mobile-map-list{display:none!important}

      @media(max-width:650px){
        .major-passport{padding:15px 15px 15px 54px!important}
        .major-passport.completed{padding-right:62px!important}
        .passport-number{left:15px!important;top:15px!important;font-size:1.12rem!important}
        .passport-earned-stamp{right:11px!important;top:11px!important;width:44px!important;height:44px!important}
        .passport-grow{margin-top:10px!important}
        .majors-world{height:245px!important;margin-top:12px!important;border-radius:15px!important}
        .majors-world .leaflet-control-attribution{font-size:7px}
        .majors-mobile-map-list{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important;margin-top:10px!important}
        .majors-mobile-map-item{display:grid!important;grid-template-columns:24px minmax(0,1fr)!important;gap:7px!important;align-items:center!important;padding:7px 8px!important;border:1px solid rgba(33,58,49,.08)!important;border-radius:11px!important;background:rgba(255,255,255,.68)!important}
        .major-mobile-index{display:grid!important;place-items:center!important;width:23px!important;height:23px!important;font-size:.5rem!important}
        .majors-mobile-map-item strong{display:block;font-size:.67rem;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .majors-mobile-map-item small{display:block;margin-top:2px;font-size:.53rem;line-height:1.15;color:var(--muted,#66736d)}
      }
      @media(max-width:370px){.majors-mobile-map-list{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  }

  function mountWorldMap(majors,candidates){
    const element=document.getElementById('majorsWorldMap');
    if(!element)return;
    if(!window.L){element.innerHTML='<div class="empty">World map unavailable.</div>';return;}
    const compact=window.matchMedia?.('(max-width:650px)')?.matches||false;
    const map=L.map(element,{zoomControl:false,attributionControl:true,dragging:false,touchZoom:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,worldCopyJump:false,zoomSnap:.25,minZoom:0,maxZoom:3,maxBounds:[[-75,-180],[82,180]],maxBoundsViscosity:1});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{minZoom:0,maxZoom:3,noWrap:true,bounds:[[-85,-180],[85,180]],attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    const directions={chicago:'left','new-york':'left',boston:'right',london:'left',berlin:'right',tokyo:'left',sydney:'left','cape-town':'right',shanghai:'right'};
    const points=[...majors.map((x,i)=>({x,index:String(i+1).padStart(2,'0'),kind:'major'})),...candidates.map(x=>({x,index:'C',kind:'candidate'}))];
    points.forEach(({x,index,kind})=>{
      const lat=Number(x.lat),lon=Number(x.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
      const candidate=kind==='candidate';
      if(compact){
        L.marker([lat,lon],{interactive:false,icon:L.divIcon({className:'',html:`<span class="majors-map-index ${candidate?'candidate':A.esc(x.status||'future')}">${A.esc(index)}</span>`,iconSize:[22,22],iconAnchor:[11,11]})}).addTo(map);
      }else{
        const marker=L.circleMarker([lat,lon],{radius:candidate?5.5:6.5,color:candidate?'#66736d':'#fff',weight:candidate?2:2.5,fillColor:candidate?'#fff':markerColor(x),fillOpacity:1,opacity:1,dashArray:candidate?'3 2':null,interactive:false}).addTo(map);
        marker.bindTooltip(`${index} ${cityName(x)}`,{permanent:true,direction:directions[x.id]||'top',offset:[0,-5],opacity:1,className:`majors-leaflet-label ${candidate?'candidate':x.status||'future'}`});
      }
    });
    const fit=()=>{
      map.invalidateSize({pan:false});
      const padding=compact?[8,8]:[18,18];
      map.fitBounds([[-48,-168],[68,168]],{padding,maxZoom:compact?1:1.75,animate:false});
    };
    requestAnimationFrame(()=>requestAnimationFrame(fit));
    setTimeout(fit,220);
    if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>requestAnimationFrame(fit));observer.observe(element);element.__majorsMapResizeObserver=observer;}
    element.__majorsLeafletMap=map;
  }

  ensureMajorsFixStyles();
  Promise.all([
    fetch('data/world-majors.json').then(r=>{if(!r.ok)throw new Error('Unable to load World Majors journey');return r.json()}),
    A.load()
  ]).then(([d,all])=>{
    const host=document.getElementById('worldMajorsFeature');if(!host)return;
    const majors=d.majors||[],candidates=d.candidates||[],completed=majors.filter(x=>x.status==='completed'),registered=majors.filter(x=>x.status==='registered').sort((a,b)=>(a.year||9999)-(b.year||9999)),confirmedTotal=majors.length,committed=completed.length+registered.length,byId=new Map(all.map(x=>[x.id,x]));
    const recordFor=x=>x?.recordId?byId.get(x.recordId)||null:null;
    const chicago=recordFor(majors.find(x=>x.id==='chicago'));
    const pct=n=>confirmedTotal?Math.round(n/confirmedTotal*100):0;
    const hasPhotos=record=>Boolean((record?.media||[]).some(item=>item&&(!item.type||item.type==='image')&&item.src&&item.alt));
    const mapList=[...majors.map((x,i)=>({x,index:String(i+1).padStart(2,'0'),kind:'major'})),...candidates.map(x=>({x,index:'C',kind:'candidate'}))].map(({x,index,kind})=>`<div class="majors-mobile-map-item"><span class="major-mobile-index ${A.esc(x.status||kind)} ${kind==='candidate'?'candidate':''}">${index}</span><span><strong>${A.esc(cityName(x))}</strong><small>${A.esc(kind==='candidate'?'Candidate':statusLabel(x))}</small></span></div>`).join('');
    const asset=(label,available)=>`<span class="${available?'available':'planned'}">${available?'✓':'+'} ${A.esc(label)}</span>`;
    const passportCards=majors.map((x,i)=>{
      const record=recordFor(x);
      const earned=x.status==='completed'?'<div class="passport-earned-stamp" aria-label="Completed Major"><span>✓</span><small>Major</small></div>':'';
      let grow='';
      if(x.status==='completed'){
        const resultAvailable=Boolean(record&&(record.officialTime||record.elapsedSeconds||record.resultUrl)),courseAvailable=Boolean(record&&(record.routeStatus==='gps'||(record.routeFeatureIds||[]).length)),photosAvailable=hasPhotos(record)||Boolean(x.photoUrl||(x.photos||[]).length),storyAvailable=Boolean(record?.story||record?.storyBody||x.storyUrl||x.storyRecordId);
        grow=`<div class="passport-grow" aria-label="Completed Major passport details">${asset('Result',resultAvailable)}${asset('Course',courseAvailable)}${asset('Photos',photosAvailable)}${asset('Story',storyAvailable)}</div>`;
      }
      const body=`${earned}<div class="passport-number">${String(i+1).padStart(2,'0')}</div><p class="card-kicker">${A.esc(statusLabel(x))}</p><h3>${A.esc(cityName(x))}</h3><p class="card-meta">${A.esc(x.city)}${x.firstMajorDate?` · Major from ${A.esc(A.formatDate(x.firstMajorDate))}`:x.year?` · ${x.year}`:''}</p>${grow}<div class="passport-state">${A.esc(x.label)}</div>`;
      return record?`<a class="major-passport ${A.esc(x.status)}" href="${A.recordHref(record)}">${body}</a>`:`<article class="major-passport ${A.esc(x.status)}">${body}</article>`;
    }).join('');
    const candidateCards=candidates.map(x=>`<article class="major-watch"><p class="card-kicker">Series watch</p><h3>${A.esc(x.name)}</h3><p>${A.esc(x.city)} · ${A.esc(x.label)}</p></article>`).join('');
    host.innerHTML=`<section class="majors-feature" id="world-majors"><div class="majors-feature-head"><div><p class="eyebrow">World Marathon Majors passport</p><h2>A marathon journey around the world.</h2><p class="majors-intro">Chicago is complete. New York 2026 and Tokyo 2027 are on the calendar. The series itself is expanding, so this passport follows the confirmed Majors rather than locking the pursuit to a fixed number.</p><div class="majors-status-row"><span class="majors-status-pill">${completed.length} completed</span><span class="majors-status-pill">${registered.length} registered</span><span class="majors-status-pill">${confirmedTotal} confirmed Majors for 2027</span></div></div><div class="majors-score"><strong>${committed}/${confirmedTotal}</strong><span>completed or registered</span></div></div><div class="majors-progress-wrap"><div class="majors-progress-label"><strong>Personal progress</strong><span>${pct(completed.length)}% completed · ${pct(committed)}% committed</span></div><div class="majors-progress" aria-label="${completed.length} of ${confirmedTotal} completed; ${committed} of ${confirmedTotal} completed or registered"><span class="majors-progress-committed" style="width:${pct(committed)}%"></span><span class="majors-progress-completed" style="width:${pct(completed.length)}%"></span></div></div><div class="majors-world-wrap"><div class="majors-world-head"><div><p class="eyebrow">World view</p><h3>The passport map</h3></div><p>Confirmed Majors plus candidate races under evaluation.</p></div><div id="majorsWorldMap" class="majors-world" role="img" aria-label="World map showing confirmed World Marathon Majors and candidate races"></div><div class="majors-mobile-map-list">${mapList}</div><div class="majors-map-key"><span><i class="completed"></i>Completed</span><span><i class="registered"></i>Registered</span><span><i class="future"></i>Confirmed Major / future target</span><span><i class="candidate"></i>Candidate</span></div></div><div class="majors-runway"><article class="majors-runway-card completed"><small>Completed</small><strong>Chicago</strong><p>${chicago?[A.formatDate(chicago.date),chicago.officialTime||A.formatDuration(chicago.elapsedSeconds)].filter(Boolean).join(' · '):'First completed Major'}</p></article><div class="majors-runway-arrow">→</div><article class="majors-runway-card is-next"><small>Next start line</small><strong>New York</strong><p>Registered · 2026</p></article><div class="majors-runway-arrow">→</div><article class="majors-runway-card registered"><small>On deck</small><strong>Tokyo</strong><p>Registered · 2027</p></article></div><div class="majors-stars-title"><div><p class="eyebrow">Passport</p><h3>Every confirmed Major, one evolving journey.</h3></div><p>On completed Majors, ✓ means the asset is already in Adventures; + marks what can be added next.</p></div><div class="majors-passport-grid">${passportCards}</div><div class="majors-horizon"><article class="majors-horizon-card"><p class="eyebrow">Series expansion</p><h3>Cape Town joins in 2027.</h3><p>The passport expands with the official series. Cape Town is included as a confirmed future Major rather than being treated as a candidate.</p></article><div>${candidateCards||'<article class="major-watch"><p class="card-kicker">Series watch</p><h3>No active candidates</h3></article>'}</div></div></section>`;
    mountWorldMap(majors,candidates);
  }).catch(e=>{
    const host=document.getElementById('worldMajorsFeature');if(host)host.innerHTML=`<div class="empty">${A.esc(e.message)}</div>`;
    console.error('World majors',e);
  });
})();