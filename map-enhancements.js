(() => {
  const theme = window.AdventureMapTheme;
  if (theme?.colors && typeof CATEGORY === 'object') {
    Object.entries(theme.colors).forEach(([key,color]) => {
      if (CATEGORY[key]) CATEGORY[key].color = color;
    });
    const legendMap={
      'MTB':theme.colors.mtb,
      'Nordic':theme.colors.nordic,
      'Road race':theme.colors['road-races'],
      'Trail race':theme.colors['trail-races'],
      'Skiing':theme.colors.skiing,
      'Summit':theme.colors.summits,
      'Adventure':theme.colors.adventures
    };
    document.querySelectorAll('.legend span').forEach(item=>{
      const dot=item.querySelector('.legend-dot');
      const label=item.textContent.trim();
      if(dot&&legendMap[label])dot.style.background=legendMap[label];
    });
  }

  const focusEndpointLayer=window.L&&typeof map!=='undefined'?L.layerGroup().addTo(map):null;
  state.pinnedFocusId=null;

  function geometrySegments(geometry){
    if(!geometry)return[];
    if(geometry.type==='LineString')return[geometry.coordinates||[]];
    if(geometry.type==='MultiLineString')return geometry.coordinates||[];
    if(geometry.type==='GeometryCollection')return(geometry.geometries||[]).flatMap(geometrySegments);
    return[];
  }
  function segmentLength(segment){
    let total=0;
    for(let i=1;i<segment.length;i+=1){
      const[x1,y1]=segment[i-1],[x2,y2]=segment[i];
      if(![x1,y1,x2,y2].every(Number.isFinite))continue;
      const dx=(x2-x1)*Math.cos(((y1+y2)/2)*Math.PI/180),dy=y2-y1;
      total+=Math.hypot(dx,dy);
    }
    return total;
  }
  function endpointIcon(kind,color){
    const label=kind==='loop'?'↻':kind==='start'?'S':'F';
    const cls=`route-endpoint ${kind==='finish'?'is-finish':''}${kind==='loop'?' is-loop':''}`;
    return L.divIcon({className:'route-endpoint-wrap',html:`<span class="${cls}" style="--route-color:${color}">${label}</span>`,iconSize:[26,26],iconAnchor:[13,13]});
  }
  function renderFocusEndpoints(){
    focusEndpointLayer?.clearLayers();
    if(!focusEndpointLayer||!state.focusId)return;
    const record=state.adventures.find(a=>a.id===state.focusId);
    if(!record)return;
    const segments=visibleRouteFeatures([record]).flatMap(feature=>geometrySegments(feature.geometry)).filter(segment=>segment.length>1);
    if(!segments.length)return;
    const segment=segments.slice().sort((a,b)=>segmentLength(b)-segmentLength(a))[0];
    const start=segment[0],finish=segment[segment.length-1];
    if(!start||!finish)return;
    const[startLon,startLat]=start,[finishLon,finishLat]=finish;
    if(![startLon,startLat,finishLon,finishLat].every(Number.isFinite))return;
    const color=theme?.routeColor?.(record)||CATEGORY[publicLayerFor(record)]?.color||'#17202a';
    const dx=(finishLon-startLon)*Math.cos(((startLat+finishLat)/2)*Math.PI/180),dy=finishLat-startLat;
    const loop=Math.hypot(dx,dy)<.00065;
    if(loop){
      L.marker([startLat,startLon],{icon:endpointIcon('loop',color),interactive:false,zIndexOffset:900})
        .bindTooltip('Start / finish',{direction:'top',offset:[0,-10],className:'route-endpoint-label'})
        .addTo(focusEndpointLayer);
      return;
    }
    L.marker([startLat,startLon],{icon:endpointIcon('start',color),interactive:false,zIndexOffset:900})
      .bindTooltip('Start',{direction:'top',offset:[0,-10],className:'route-endpoint-label'})
      .addTo(focusEndpointLayer);
    L.marker([finishLat,finishLon],{icon:endpointIcon('finish',color),interactive:false,zIndexOffset:900})
      .bindTooltip('Finish',{direction:'top',offset:[0,-10],className:'route-endpoint-label'})
      .addTo(focusEndpointLayer);
  }

  const originalFocusAdventure=typeof focusAdventure==='function'?focusAdventure:null;
  if(originalFocusAdventure){
    focusAdventure=function(a){
      state.pinnedFocusId=a.id;
      originalFocusAdventure(a);
      state.focusId=a.id;
      applyFocusStyles();
    };
  }
  if(typeof setRouteEmphasis==='function'){
    setRouteEmphasis=function(id,on){
      if(on)state.focusId=id;
      else state.focusId=state.pinnedFocusId||null;
      applyFocusStyles();
    };
  }

  if (typeof applyFocusStyles === 'function') {
    applyFocusStyles = function() {
      if(state.focusId&&!state.adventures.some(a=>a.id===state.focusId)){
        state.focusId=null;
        state.pinnedFocusId=null;
      }
      const zoom=typeof map!=='undefined'?map.getZoom():7;
      const low=zoom<=4,mid=zoom>4&&zoom<=6;
      const routeWeightFactor=low?.5:mid?.72:1;
      const routeOpacityFactor=low?.48:mid?.7:1;
      const pointRadius=low?4.3:mid?5.2:6;

      state.routeFeatureLayers.forEach(group => group.eachLayer(layer => {
        const feature = layer.feature || {};
        const linked = (feature.properties?.adventureIds || []).map(x => state.adventures.find(a => a.id === x)).filter(Boolean);
        const category = publicLayerFor(linked[0] || {kind:'adventure'});
        const style = baseRouteStyle(feature, category);
        const active = state.focusId && routeContainsId(layer, state.focusId);
        const weight=active?Math.max(style.weight+3,7):Math.max(1.5,style.weight*routeWeightFactor);
        const opacity=state.focusId?(active?1:.1):Math.max(.22,style.opacity*routeOpacityFactor);
        layer.setStyle?.({...style,weight,opacity});
        if (active) layer.bringToFront?.();
      }));

      const groupedMarkers = new Map();
      state.markers.forEach((marker,id) => {
        if (!groupedMarkers.has(marker)) groupedMarkers.set(marker, []);
        groupedMarkers.get(marker).push(id);
      });
      groupedMarkers.forEach((ids,marker) => {
        const records = ids.map(id => state.adventures.find(a => a.id === id)).filter(Boolean);
        const mixed = new Set(records.map(publicLayerFor)).size > 1;
        const active = Boolean(state.focusId && ids.includes(state.focusId));
        const groupedBoost=ids.length>1?1.6:0;
        const baseRadius=pointRadius+groupedBoost;
        marker.setStyle?.({
          radius: active ? baseRadius + 3 : baseRadius,
          weight: active ? 3 : (mixed ? 2.5 : low ? 1.5 : 2),
          fillOpacity: state.focusId ? (active ? .98 : .24) : (low ? .78 : .9),
          opacity: state.focusId ? (active ? 1 : .32) : (low ? .88 : 1)
        });
        if (active) marker.bringToFront?.();
      });

      renderFocusEndpoints();
      document.querySelectorAll('.adventure-item').forEach(el => el.classList.toggle('is-context-muted', Boolean(state.focusId) && el.dataset.id !== state.focusId));
    };
  }

  if(typeof map!=='undefined'){
    map.on('zoomend',()=>applyFocusStyles());
    map.on('click',()=>{state.pinnedFocusId=null;focusEndpointLayer?.clearLayers()});
    setTimeout(()=>applyFocusStyles(),0);
  }

  const shell = document.querySelector('.app-shell');
  const sidebar = document.querySelector('.sidebar');
  const brand = document.querySelector('.brand-block');
  const mapPanel = document.querySelector('.map-panel');
  const desktopNext = mapPanel?.nextSibling || null;
  const mobileQuery = window.matchMedia('(max-width: 820px)');

  function invalidate() {
    const m = window.adventureMap;
    if (m && typeof m.invalidateSize === 'function') m.invalidateSize({pan:false});
  }

  function placeMapForViewport() {
    if (!shell || !sidebar || !brand || !mapPanel) return;
    if (mobileQuery.matches) {
      if (mapPanel.parentElement !== sidebar || mapPanel.previousElementSibling !== brand) brand.insertAdjacentElement('afterend', mapPanel);
    } else if (mapPanel.parentElement !== shell) {
      if (desktopNext && desktopNext.parentNode === shell) shell.insertBefore(mapPanel, desktopNext);
      else shell.appendChild(mapPanel);
    }
    requestAnimationFrame(invalidate);
  }

  function refreshMapSize() {
    requestAnimationFrame(() => requestAnimationFrame(invalidate));
  }

  placeMapForViewport();
  window.addEventListener('load', () => { placeMapForViewport(); setTimeout(refreshMapSize, 120); setTimeout(refreshMapSize, 500); });
  window.addEventListener('resize', refreshMapSize, {passive:true});
  window.addEventListener('orientationchange', () => setTimeout(() => { placeMapForViewport(); refreshMapSize(); }, 180));
  mobileQuery.addEventListener?.('change', placeMapForViewport);
  window.visualViewport?.addEventListener('resize', refreshMapSize, {passive:true});
})();
