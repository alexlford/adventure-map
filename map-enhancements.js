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
    const legend=document.querySelector('.legend');
    if(legend&&!legend.querySelector('.map-mixed-key'))legend.insertAdjacentHTML('beforeend','<span class="map-mixed-key"><i class="legend-dot" style="background:#59636d"></i> Mixed cluster</span>');
  }

  const focusEndpointLayer=window.L&&typeof map!=='undefined'?L.layerGroup().addTo(map):null;
  state.pinnedFocusId=null;
  const pinnedIsVisible=()=>Boolean(state.pinnedFocusId&&filteredAdventures().some(a=>a.id===state.pinnedFocusId));

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

  const markerGridSize=zoom=>zoom<=3?52:zoom===4?42:zoom===5?32:zoom===6?24:0;
  const groupCenter=group=>{
    const lat=group.reduce((sum,item)=>sum+item.lat,0)/group.length;
    const lon=group.reduce((sum,item)=>sum+item.lon,0)/group.length;
    return[lat,lon];
  };
  const markerGroupKey=(a,zoom,grid)=>{
    if(!grid)return coordinateKey(a);
    const point=map.project([a.lat,a.lon],zoom);
    return`${Math.floor(point.x/grid)},${Math.floor(point.y/grid)}`;
  };
  const markerPopup=group=>{
    const ordered=group.slice().sort((a,b)=>(recordYear(b)||0)-(recordYear(a)||0)||a.name.localeCompare(b.name));
    const shown=ordered.slice(0,8).map(popupCard).join('');
    const more=ordered.length>8?`<p class="map-cluster-more">+ ${ordered.length-8} more nearby records · zoom in to separate them.</p>`:'';
    return shown+more;
  };
  const clusterBounds=group=>{
    const bounds=L.latLngBounds([]);
    group.forEach(item=>bounds.extend([item.lat,item.lon]));
    return bounds;
  };

  if(typeof renderMarkers==='function'){
    renderMarkers=function(items){
      markerLayer.clearLayers();
      state.markers.clear();
      const zoom=map.getZoom();
      const grid=markerGridSize(zoom);
      const groups=new Map();
      items.filter(mapped).forEach(a=>{
        const key=markerGroupKey(a,zoom,grid);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(a);
      });

      groups.forEach(group=>{
        const categories=[...new Set(group.map(publicLayerFor))];
        const mixed=categories.length>1;
        const category=mixed?null:categories[0];
        const color=mixed?'#59636d':CATEGORY[category]?.color||CATEGORY.adventures.color;
        const cluster=Boolean(grid&&group.length>1);
        const center=cluster?groupCenter(group):[group[0].lat,group[0].lon];
        const baseRadius=cluster?Math.min(14,5.2+Math.sqrt(group.length)*1.9):(group.length>1?8:6);
        const marker=L.circleMarker(center,{radius:baseRadius,color:'#fff',weight:mixed?2.5:2,fillColor:color,fillOpacity:.9,bubblingMouseEvents:false});
        marker.__adventureBaseRadius=baseRadius;
        marker.__adventureMixed=mixed;
        marker.__adventureCluster=cluster;
        marker.addTo(markerLayer);

        if(cluster){
          marker.bindTooltip(String(group.length),{permanent:true,direction:'center',className:'map-cluster-count',opacity:1});
          marker.on('click',()=>{
            state.pinnedFocusId=null;
            state.focusId=null;
            focusEndpointLayer?.clearLayers();
            const bounds=clusterBounds(group);
            const targetZoom=Math.min(8,zoom+2);
            const unique=new Set(group.map(coordinateKey)).size;
            if(unique>1&&bounds.isValid())map.fitBounds(bounds,{padding:[52,52],maxZoom:targetZoom});
            else map.setView(center,targetZoom);
          });
        }else{
          marker.bindPopup(markerPopup(group),{maxWidth:360});
          if(group.length>1)marker.bindTooltip(String(group.length),{permanent:true,direction:'center',className:'map-cluster-count',opacity:1});
          else marker.bindTooltip(group[0].name,{direction:'top',offset:[0,-5],opacity:.94,className:'map-point-label'});
          if(group.length===1){
            const record=group[0];
            marker.on('mouseover',()=>setRouteEmphasis(record.id,true));
            marker.on('mouseout',()=>setRouteEmphasis(record.id,false));
            marker.on('click',()=>{
              state.pinnedFocusId=record.id;
              state.focusId=record.id;
              applyFocusStyles();
            });
          }
        }

        marker.on('add',()=>{
          const node=marker.getElement?.();
          if(!node)return;
          const label=cluster?`${group.length} nearby adventure records`:(group.length>1?`${group.length} records at this location`:group[0].name);
          node.setAttribute('aria-label',label);
        });
        group.forEach(record=>state.markers.set(record.id,marker));
      });
    };
  }

  const originalFocusAdventure=typeof focusAdventure==='function'?focusAdventure:null;
  if(originalFocusAdventure){
    focusAdventure=function(a){
      state.pinnedFocusId=a.id;
      const routeGroups=state.routeLayers.get(a.id)||[];
      if(!routeGroups.length&&mapped(a)){
        state.focusId=a.id;
        applyFocusStyles();
        const openFocused=()=>{state.focusId=a.id;applyFocusStyles();state.markers.get(a.id)?.openPopup?.()};
        map.once('moveend',openFocused);
        map.flyTo([a.lat,a.lon],Math.max(map.getZoom(),a.kind==='summit'?9:8),{duration:.8});
        setTimeout(openFocused,900);
        return;
      }
      originalFocusAdventure(a);
      state.focusId=a.id;
      applyFocusStyles();
    };
  }
  if(typeof setRouteEmphasis==='function'){
    setRouteEmphasis=function(id,on){
      if(on)state.focusId=id;
      else{
        if(!pinnedIsVisible())state.pinnedFocusId=null;
        state.focusId=state.pinnedFocusId||null;
      }
      applyFocusStyles();
    };
  }

  if (typeof applyFocusStyles === 'function') {
    applyFocusStyles = function() {
      if(state.pinnedFocusId&&!pinnedIsVisible())state.pinnedFocusId=null;
      if(state.focusId&&!state.adventures.some(a=>a.id===state.focusId))state.focusId=null;
      if(!state.focusId&&state.pinnedFocusId)state.focusId=state.pinnedFocusId;

      const zoom=typeof map!=='undefined'?map.getZoom():7;
      const low=zoom<=4,mid=zoom>4&&zoom<=6;
      const routeWeightFactor=low ? .5 : (mid ? .72 : 1);
      const routeOpacityFactor=low ? .48 : (mid ? .7 : 1);
      const pointRadius=low ? 4.3 : (mid ? 5.2 : 6);

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
        const mixed = marker.__adventureMixed ?? new Set(records.map(publicLayerFor)).size > 1;
        const active = Boolean(state.focusId && ids.includes(state.focusId));
        const fallbackRadius=pointRadius+(ids.length>1?1.6:0);
        const baseRadius=marker.__adventureBaseRadius||fallbackRadius;
        marker.setStyle?.({
          radius: active ? baseRadius + 3 : baseRadius,
          weight: active ? 3 : (mixed ? 2.5 : (low ? 1.5 : 2)),
          fillOpacity: state.focusId ? (active ? .98 : .22) : (low ? .82 : .9),
          opacity: state.focusId ? (active ? 1 : .3) : (low ? .9 : 1)
        });
        if (active) marker.bringToFront?.();
      });

      renderFocusEndpoints();
      document.querySelectorAll('.adventure-item').forEach(el => el.classList.toggle('is-context-muted', Boolean(state.focusId) && el.dataset.id !== state.focusId));
    };
  }

  const originalRender=typeof render==='function'?render:null;
  if(originalRender){
    render=function(...args){
      const pinned=state.pinnedFocusId;
      const result=originalRender(...args);
      if(pinned&&filteredAdventures().some(a=>a.id===pinned))state.focusId=pinned;
      else if(pinned)state.pinnedFocusId=null;
      requestAnimationFrame(()=>applyFocusStyles());
      return result;
    };
  }

  if(typeof map!=='undefined'){
    let markerZoom=map.getZoom();
    map.on('zoomend',()=>{
      const nextZoom=map.getZoom();
      if(nextZoom!==markerZoom){markerZoom=nextZoom;renderMarkers(filteredAdventures())}
      applyFocusStyles();
    });
    map.on('click',()=>{state.pinnedFocusId=null;state.focusId=null;focusEndpointLayer?.clearLayers();applyFocusStyles()});
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
