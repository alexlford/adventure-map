(()=>{
  const A=window.AdventureSite;
  if(!A)return;

  const stampThemes={
    'eldora mountain resort':{name:'Eldora',accent:'#2f6f73',motif:'lift'},
    'copper mountain resort':{name:'Copper Mountain',accent:'#9a653f',motif:'copper'},
    'steamboat ski resort':{name:'Steamboat',accent:'#8d4f43',motif:'gondola'},
    'arapahoe basin ski area':{name:'Arapahoe Basin',accent:'#3f6570',motif:'eastwall'},
    'winter park resort':{name:'Winter Park',accent:'#4d6478',motif:'ridge'},
    'breckenridge resort':{name:'Breckenridge',accent:'#8c5b3f',motif:'mainstreet'},
    'crested butte mountain resort':{name:'Crested Butte',accent:'#456f5c',motif:'needle'},
    'big sky resort':{name:'Big Sky',accent:'#526b78',motif:'lonepeak'},
    'vail ski resort':{name:'Vail',accent:'#365f72',motif:'skier'},
    'keystone resort':{name:'Keystone',accent:'#39718a',motif:'snowflake'},
    'liberty mountain resort':{name:'Liberty Mountain',accent:'#765f4c',motif:'bell'},
    'stowe mountain resort':{name:'Stowe',accent:'#4f6b4f',motif:'steeple'}
  };
  const fallbackAccents=['#466b65','#7a604d','#4f6575','#6a6652','#5c6f5a','#70575e'];
  const normalize=s=>String(s||'').trim().toLowerCase();
  const titleName=name=>String(name||'').replace(/\s+(Mountain Resort|Ski Resort|Resort|Ski Area)$/i,'').trim();
  const themeFor=(resort,i)=>stampThemes[normalize(resort.name)]||{name:titleName(resort.name),accent:fallbackAccents[i%fallbackAccents.length],motif:'mountain'};

  const motif=(kind)=>{
    const common=`<path class="stamp-mountain-back" d="M7 80 42 43 63 65 91 26 122 63 145 39 176 80Z"/><path class="stamp-mountain-front" d="M6 84 48 55 70 73 101 45 128 70 151 58 178 84Z"/><path class="stamp-snow" d="m42 43 8 15 8-8 5 15M91 26l10 20 9-9 12 26M145 39l8 16 7-7 8 20"/>`;
    if(kind==='lift')return `${common}<path class="stamp-line" d="M18 35 165 18"/><path class="stamp-line" d="M126 23v19m-10 0h20l-3 17h-14Z"/><path class="stamp-tree" d="m25 78 9-22 9 22m-15-8h12m-10-7h8"/>`;
    if(kind==='copper')return `<circle class="stamp-disc" cx="91" cy="48" r="34"/>${common}<path class="stamp-line" d="M56 73 90 37l20 24 15-13 24 27"/><circle class="stamp-mark" cx="144" cy="25" r="8"/>`;
    if(kind==='gondola')return `${common}<path class="stamp-line" d="M12 26 169 34"/><path class="stamp-line" d="M95 30v14"/><rect class="stamp-outline" x="82" y="43" width="27" height="23" rx="7"/><path class="stamp-line" d="M87 48h17M92 43v23M101 43v23"/>`;
    if(kind==='eastwall')return `<path class="stamp-mountain-back" d="M8 82 34 58 50 61 67 35 80 45 92 20 110 49 123 39 147 63 176 82Z"/><path class="stamp-snow" d="m67 35 8 12 5-6 9 17M92 20l9 18 8-8 12 24M123 39l7 10 6-5 8 16"/><path class="stamp-line" d="M30 75 61 63 78 68M111 62l18-10 22 13"/><path class="stamp-mark" d="M28 22v22M17 33h22M20 25l16 16M36 25 20 41"/>`;
    if(kind==='ridge')return `<path class="stamp-mountain-back" d="M4 74 36 47 65 61 90 31 114 54 140 42 178 74v10H4Z"/><path class="stamp-mountain-front" d="M5 84 49 64 72 73 105 52 129 71 151 59 178 84Z"/><path class="stamp-line" d="M18 78c22-12 37-9 54-3 18 6 32 7 50-1 16-7 29-7 45 2"/>`;
    if(kind==='mainstreet')return `${common}<rect class="stamp-mark" x="25" y="57" width="22" height="22" rx="2"/><rect class="stamp-mark" x="51" y="51" width="28" height="28" rx="2"/><rect class="stamp-mark" x="84" y="59" width="22" height="20" rx="2"/><path class="stamp-line" d="M25 57 36 48l11 9M51 51l14-10 14 10M84 59l11-9 11 9M61 64h8m-8 7h8"/>`;
    if(kind==='needle')return `<path class="stamp-mountain-back" d="M6 84 63 66 96 18 119 60 176 84Z"/><path class="stamp-mountain-front" d="M6 84 68 70 96 18 108 72 176 84Z"/><path class="stamp-snow" d="m96 18 10 23 8-10 5 29M78 67l18-49"/><path class="stamp-tree" d="m34 82 8-20 8 20m-13-7h10m-8-6h6"/>`;
    if(kind==='lonepeak')return `<path class="stamp-mountain-back" d="M5 84 58 65 96 17 132 68 176 84Z"/><path class="stamp-mountain-front" d="M5 84 61 71 96 17 112 75 176 84Z"/><path class="stamp-snow" d="m96 17 11 26 8-9 9 30M78 64l18-47"/><path class="stamp-line" d="M24 42 156 28M139 31v18m-10 0h20l-4 16h-12Z"/>`;
    if(kind==='skier')return `${common}<circle class="stamp-outline" cx="128" cy="47" r="5"/><path class="stamp-line" d="m126 53-11 12 13 7 9-12m-19 4-10-5m28 0 8-8m-33 26 34-5"/>`;
    if(kind==='snowflake')return `${common}<path class="stamp-mark" d="M33 19v28M20 33h26M24 24l18 18M42 24 24 42M33 19l-5 6m5-6 5 6m-5 22-5-6m5 6 5-6"/>`;
    if(kind==='bell')return `<path class="stamp-mountain-back" d="M6 82 44 59 73 67 99 50 126 61 150 55 177 82Z"/><path class="stamp-mountain-front" d="M6 84 49 70 78 76 105 62 135 72 160 66 177 84Z"/><path class="stamp-outline" d="M91 22c-12 0-19 9-19 21v7c0 8-4 12-9 16h56c-5-4-9-8-9-16v-7c0-12-7-21-19-21Z"/><path class="stamp-line" d="M81 68c2 8 17 8 20 0M91 22v-7"/>`;
    if(kind==='steeple')return `<path class="stamp-mountain-back" d="M6 78 45 55 67 67 96 35 123 63 149 51 177 78v6H6Z"/><path class="stamp-mountain-front" d="M6 84 56 69 80 76 112 58 142 75 177 84Z"/><rect class="stamp-mark" x="33" y="57" width="31" height="23" rx="2"/><path class="stamp-line" d="M33 57 48 46l16 11M45 46V33h7v13M48 33V24M43 29h10"/>`;
    return common;
  };

  const stampSvg=kind=>`<svg viewBox="0 0 184 96" role="presentation" aria-hidden="true"><rect class="stamp-horizon" x="4" y="8" width="176" height="76" rx="28"/>${motif(kind)}</svg>`;

  fetch('data/skiing.json').then(r=>r.json()).then(d=>{
    const host=document.getElementById('seasons');
    if(!host)return;
    const seasons=d.seasons||[],resorts=d.resorts||[];
    const best=seasons.slice().sort((a,b)=>(b.days||0)-(a.days||0))[0];
    const top=resorts.slice().sort((a,b)=>(b.days||0)-(a.days||0))[0];
    const maxDays=Math.max(1,...seasons.map(x=>Number(x.days)||0));
    const progression=seasons.map(x=>`<div class="passport-row"><span>${A.esc(x.season)}</span><div class="passport-track" aria-hidden="true"><div class="passport-fill" style="width:${Math.max(4,(Number(x.days)||0)/maxDays*100)}%"></div></div><strong>${Number(x.days)||0}</strong></div>`).join('');
    const stamps=resorts.slice(0,12).map((x,i)=>{
      const t=themeFor(x,i),rank=String(i+1).padStart(2,'0');
      return `<article class="passport-stamp" style="--stamp-accent:${t.accent}" aria-label="${A.esc(x.name)}, ${x.days} recorded day${x.days===1?'':'s'}"><div class="passport-stamp-top"><small>${rank}</small><span>${A.esc(x.region||'')}</span></div><div class="passport-stamp-art">${stampSvg(t.motif)}</div><div class="passport-stamp-copy"><strong>${A.esc(t.name)}</strong><span>${x.days} recorded day${x.days===1?'':'s'}</span></div></article>`;
    }).join('');
    const milestones=[best?`Biggest season: ${best.season} (${best.days} days)`:null,top?`Most skied: ${top.name} (${top.days} days)`:null,d.summary?.recordedRuns?`${Number(d.summary.recordedRuns).toLocaleString()} recorded runs`:null].filter(Boolean);
    const passport=document.createElement('section');
    passport.className='sport-detail';
    passport.innerHTML=`<div class="sport-detail-head"><div><p class="eyebrow">Ski passport</p><h2>The ski life at a glance</h2></div><p>A compact view of the seasons and resorts that define the archive.</p></div><div class="sport-detail-grid ski-passport-summary"><article class="sport-panel"><small>Biggest recorded season</small><strong>${best?A.esc(best.season):'—'}</strong><p>${best?best.days+' recorded ski days':''}</p></article><article class="sport-panel"><small>Most-skied resort</small><strong>${top?A.esc(top.name):'—'}</strong><p>${top?top.days+' recorded days':''}</p></article></div><div class="detail-callout"><strong>Milestones</strong><p>${milestones.map(A.esc).join(' · ')}</p></div><div class="section-title"><h2>Season progression</h2><p>Recorded ski days by season. Bar length reflects days only, not vertical.</p></div><div class="passport-progress">${progression}</div><div class="section-title"><h2>Resort passport</h2><p>The most frequently recorded destinations, rendered as place-specific passport stamps.</p></div><div class="stamp-grid">${stamps}</div>`;
    host.parentNode.insertBefore(passport,host);
  }).catch(e=>console.error('Ski passport',e));
})();
