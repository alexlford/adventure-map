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

  if(typeof map!=='undefined'){
    let markerZoom=map.getZoom();
    map.on('zoomend',()=>{
      const nextZoom=map.getZoom();
      if(nextZoom!==markerZoom){markerZoom=nextZoom;renderMarkers(filteredAdventures())}
      applyFocusStyles();
    });
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
