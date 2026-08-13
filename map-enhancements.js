(() => {
  'use strict';

  const runtime = window.AdventureMapRuntime;
  const internal = runtime?.internal;
  const map = runtime?.leaflet;
  if (!runtime || !internal || !map) return;

  const theme = window.AdventureMapTheme;
  if (theme?.colors) {
    internal.setCategoryColors(theme.colors);
    const legendMap = {
      'MTB': theme.colors.mtb,
      'Nordic': theme.colors.nordic,
      'Road race': theme.colors['road-races'],
      'Trail race': theme.colors['trail-races'],
      'Skiing': theme.colors.skiing,
      'Summit': theme.colors.summits,
      'Adventure': theme.colors.adventures
    };
    document.querySelectorAll('.legend span').forEach(item => {
      const dot = item.querySelector('.legend-dot');
      const label = item.textContent.trim();
      if (dot && legendMap[label]) dot.style.background = legendMap[label];
    });
    const legend = document.querySelector('.legend');
    if (legend && !legend.querySelector('.map-mixed-key')) {
      legend.insertAdjacentHTML('beforeend', '<span class="map-mixed-key"><i class="legend-dot" style="background:#59636d"></i> Mixed cluster</span>');
    }
  }

  const ROUTE_DETAIL_ZOOM = 7;
  let markerZoom = map.getZoom();

  function routeCategoryForFeature(feature) {
    const current = runtime.snapshot();
    const linked = internal.recordsByIds(feature.properties?.adventureIds || []);
    if (current.filter === 'summits' && linked.some(record => runtime.layerFor(record) === 'summits')) return 'summits';
    if (current.filter !== 'all' && linked.some(record => runtime.layerFor(record) === current.filter)) return current.filter;
    const focused = current.focusId ? linked.find(record => record.id === current.focusId) : null;
    if (focused) return runtime.layerFor(focused);
    return runtime.layerFor(linked[0] || { kind: 'adventure' });
  }

  function applyRouteZoomPresentation() {
    internal.applyFocusStyles();
    const current = runtime.snapshot();
    const zoom = map.getZoom();
    const detailMode = zoom >= ROUTE_DETAIL_ZOOM;
    map.getContainer()?.classList.toggle('is-gps-route-detail', detailMode);
    if (!detailMode) return;

    internal.routeFeatureLayers().forEach(group => group.eachLayer(layer => {
      const feature = layer.feature || {};
      const category = routeCategoryForFeature(feature);
      const style = internal.baseRouteStyle(feature, category);
      const active = Boolean(current.focusId && internal.routeContainsId(layer, current.focusId));
      if (current.focusId && !active) return;
      const minimumWeight = category === 'summits' ? 6 : 5.5;
      layer.setStyle?.({
        ...style,
        weight: active ? Math.max(style.weight + 3, 7) : Math.max(style.weight, minimumWeight),
        opacity: active ? 1 : .96
      });
      layer.bringToFront?.();
    }));

    internal.markerGroups().forEach(({ ids, marker }) => {
      const hasGpsRoute = ids.some(id => internal.hasRoute(id));
      if (!hasGpsRoute) return;
      const active = Boolean(current.focusId && ids.includes(current.focusId));
      if (current.focusId && !active) return;
      const baseRadius = marker.__adventureBaseRadius || 6;
      marker.setStyle?.({
        radius: active ? baseRadius + 3 : Math.min(baseRadius, 4.5),
        fillOpacity: active ? .98 : .58,
        opacity: active ? 1 : .72
      });
    });
  }

  map.on('zoomend', () => {
    const nextZoom = map.getZoom();
    if (nextZoom !== markerZoom) {
      markerZoom = nextZoom;
      internal.rerenderMarkers();
    }
    applyRouteZoomPresentation();
  });

  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => requestAnimationFrame(applyRouteZoomPresentation));
  });
  setTimeout(applyRouteZoomPresentation, 0);

  const shell = document.querySelector('.app-shell');
  const sidebar = document.querySelector('.sidebar');
  const brand = document.querySelector('.brand-block');
  const mapPanel = document.querySelector('.map-panel');
  const desktopNext = mapPanel?.nextSibling || null;
  const mobileQuery = window.matchMedia('(max-width: 820px)');

  function invalidate() {
    map.invalidateSize?.({ pan: false });
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
  window.addEventListener('load', () => {
    placeMapForViewport();
    setTimeout(refreshMapSize, 120);
    setTimeout(refreshMapSize, 500);
  });
  window.addEventListener('resize', refreshMapSize, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(() => {
    placeMapForViewport();
    refreshMapSize();
  }, 180));
  mobileQuery.addEventListener?.('change', placeMapForViewport);
  window.visualViewport?.addEventListener('resize', refreshMapSize, { passive: true });
})();
