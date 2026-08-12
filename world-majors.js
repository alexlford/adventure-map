(()=>{
  const A=window.AdventureSite;if(!A)return;
  const cityName=x=>x.name.replace(' Marathon','').replace('TCS New York City','New York City');
  const statusLabel=x=>x.status==='completed'?'Completed':x.status==='registered'?'Registered':x.membership==='joins-2027'?'Joining the Majors in 2027':'Future target';
  const markerColor=x=>x.status==='completed'?'#27654e':x.status==='registered'?'#b47f2d':x.membership==='joins-2027'?'#2f6f8f':'#87928d';
  function ensurePassportCardFix(){
    if(document.getElementById('majorsPassportCardFix'))return;
    const style=document.createElement('style');
    style.id='majorsPassportCardFix';
    style.textContent=`
      .majors-passport-grid{align-items:start}
      .major-passport{min-height:0!important;padding:18px 58px 18px 18px!important;display:block!important}
      .major-passport:not(.completed){padding-right:18px!important}
      .major-passport .card-kicker{margin:0 0 5px!important}
      .major-passport h3{margin:0!important}
      .major-passport .card-meta{margin:7px 0 0!important;line-height:1.38}
      .passport-number{top:13px!important;right:14px!important;font-size:1.45rem!important}
      .passport-earned-stamp{top:15px!important;right:14px!important;width:46px!important;height:46px!important;font-size:.42rem!important;letter-spacing:.055em!important}
      .passport-earned-stamp:after{bottom:5px!important;font-size:.33rem!important}
      .passport-grow{margin-top:14px!important;padding-right:0!important;gap:5px!important}
      .passport-grow span{padding:4px 7px!important}
      .passport-state{display:none!important}
      @media(max-width:650px){
        .major-passport{padding:15px 58px 15px 54px!important}
        .major-passport:not(.completed){padding-right:15px!important}
        .passport-number{left:15px!important;right:auto!important;top:15px!important;font-size:1.15rem!important}
        .passport-earned-stamp{top:12px!important;right:12px!important;width:42px!important;height:42px!important}
        .passport-grow{margin-top:10px!important}
      }
    `;
    document.head.appendChild(style);
  }
  function mountWorldMap(majors,candidates){
    const element=document.getElementById('majorsWorldMap');
    if(!element)return;
    if(!window.L){element.innerHTML='<div class="empty">World map unavailable.</div>';return;}
    const map=L.map(element,{zoomControl:false,attributionControl:true,dragging:false,touchZoom:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,worldCopyJump:false,zoomSnap:.25,minZoom:1,maxZoom:3});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:3,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    const bounds=L.latLngBounds([]);
    const directions={chicago:'left','new-york':'left',boston:'right',london:'left',berlin:'right',tokyo:'left',sydney:'left','cape-town':'right',shanghai:'right'};
    const points=[...majors.map((x,i)=>({x,index:String(i+1).padStart(2,'0'),kind:'major'})),...candidates.map(x=>({x,index:'C',kind:'candidate'}))];
    points.forEach(({x,index,kind})=>{
      const lat=Number(x.lat),lon=Number(x.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
      const candidate=kind==='candidate';
      const marker=L.circleMarker([lat,lon],{radius:candidate?5.5:6.5,color:candidate?'#66736d':'#fff',weight:candidate?2:2.5,fillColor:candidate?'#fff':markerColor(x),fillOpacity:1,opacity:1,dashArray:candidate?'3 2':null,interactive:false}).addTo(map);
      marker.bindTooltip(`${index} ${cityName(x)}`,{permanent:true,direction:directions[x.id]||'top',offset:[0,-5],opacity:1,className:`majors-leaflet-label ${candidate?'candidate':x.status||'future'}`});
      bounds.extend([lat,lon]);
    });
    const fit=()=>{map.invalidateSize({pan:false});if(bounds.isValid())map.fitBounds(bounds,{padding:[34,34],maxZoom:2,animate:false})};
    requestAnimationFrame(()=>requestAnimationFrame(fit));
    setTimeout(fit,220);
    if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>requestAnimationFrame(fit));observer.observe(element);element.__majorsMapResizeObserver=observer;}
    element.__majorsLeafletMap=map;
  }
  ensurePassportCardFix();
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
      const earned=x.status==='completed'?'<div class="passport-earned-stamp" aria-label="Completed Major">Completed</div>':'';
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