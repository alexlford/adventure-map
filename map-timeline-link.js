(()=>{
  'use strict';

  const heading=document.querySelector('.results-heading');
  if(!heading)return;

  const registry=window.AdventureSiteRoutes?.routes||[];
  const timelineRoute=registry.find(route=>route.key==='timeline');
  const production=location.hostname==='adventures.alexlford.com';
  const base=production?(timelineRoute?.path||'/timeline'):`/${timelineRoute?.source||'timeline.html'}`;
  const layerToView={
    mtb:'mtb',
    nordic:'nordic',
    'road-races':'races',
    'trail-races':'races',
    skiing:'skiing',
    summits:'summits',
    adventures:'adventures'
  };

  const link=document.createElement('a');
  link.className='map-timeline-link';
  link.textContent='Timeline →';
  link.setAttribute('aria-label','View this map selection in the timeline');
  heading.appendChild(link);

  if(!document.getElementById('mapTimelineLinkStyles')){
    const style=document.createElement('style');
    style.id='mapTimelineLinkStyles';
    style.textContent=`
      .results-heading{flex-wrap:wrap}
      .map-timeline-link{display:inline-flex;align-items:center;justify-content:center;min-height:34px;margin-left:auto;padding:5px 10px;border:1px solid var(--border,#d8d5cd);border-radius:999px;color:var(--ink,#17202a);background:rgba(255,255,255,.62);font-size:.72rem;font-weight:800;text-decoration:none;white-space:nowrap}
      .map-timeline-link:hover{border-color:var(--accent,#325f46);background:#fff}
      .map-timeline-link:focus-visible{outline:2px solid var(--accent,#325f46);outline-offset:2px}
      @media(max-width:520px){.map-timeline-link{margin-left:0}}
    `;
    document.head.appendChild(style);
  }

  const update=()=>{
    const current=new URL(location.href);
    const target=new URL(base,location.origin);
    const layer=current.searchParams.get('layer')||'all';
    const view=layerToView[layer];
    const q=current.searchParams.get('q')||'';
    const from=current.searchParams.get('from')||'';
    const through=current.searchParams.get('through')||'';
    if(view)target.searchParams.set('view',view);
    if(q)target.searchParams.set('q',q);
    if(from)target.searchParams.set('from',from);
    if(through)target.searchParams.set('through',through);
    link.href=`${target.pathname}${target.search}${target.hash}`;
    const broadensRaceLayer=layer==='road-races'||layer==='trail-races';
    link.title=broadensRaceLayer?'Open the same search and years in Timeline; the Timeline race view includes both road and trail races.':'Carry this activity, search, and year range to Timeline.';
  };

  let queued=false;
  const queueUpdate=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;update()});
  };
  document.addEventListener('input',queueUpdate,true);
  document.addEventListener('change',queueUpdate,true);
  document.addEventListener('click',queueUpdate,true);
  window.addEventListener('popstate',update);
  window.AdventureMap?.ready?.().then(update).catch(update);
  update();
})();
