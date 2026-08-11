(() => {
  const theme = window.AdventureMapTheme;
  if (theme?.colors && typeof CATEGORY === 'object') {
    Object.entries(theme.colors).forEach(([key,color]) => {
      if (CATEGORY[key]) CATEGORY[key].color = color;
    });
  }

  if (typeof applyFocusStyles === 'function') {
    applyFocusStyles = function() {
      state.routeFeatureLayers.forEach(group => group.eachLayer(layer => {
        const feature = layer.feature || {};
        const linked = (feature.properties?.adventureIds || []).map(x => state.adventures.find(a => a.id === x)).filter(Boolean);
        const category = publicLayerFor(linked[0] || {kind:'adventure'});
        const style = baseRouteStyle(feature, category);
        const active = state.focusId && routeContainsId(layer, state.focusId);
        layer.setStyle?.({...style, weight:active ? Math.max(style.weight + 3, 7) : style.weight, opacity:state.focusId ? (active ? 1 : .12) : style.opacity});
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
        const baseRadius = ids.length > 1 ? 8 : 6;
        marker.setStyle?.({
          radius: active ? baseRadius + 3 : baseRadius,
          weight: active ? 3 : (mixed ? 3 : 2),
          fillOpacity: state.focusId ? (active ? .98 : .26) : .9,
          opacity: state.focusId ? (active ? 1 : .36) : 1
        });
        if (active) marker.bringToFront?.();
      });

      document.querySelectorAll('.adventure-item').forEach(el => el.classList.toggle('is-context-muted', Boolean(state.focusId) && el.dataset.id !== state.focusId));
    };
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