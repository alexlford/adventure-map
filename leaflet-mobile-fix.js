(() => {
  'use strict';

  if (!document.querySelector('link[data-adventure-map-visuals]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'map-visuals.css';
    style.dataset.adventureMapVisuals = 'true';
    document.head.appendChild(style);
  }

  const colors = Object.freeze({
    mtb:'#315f9e',
    nordic:'#2f6f8f',
    'road-races':'#b76b26',
    'trail-races':'#8b5a31',
    skiing:'#2f8ca6',
    summits:'#357662',
    adventures:'#715a8d'
  });
  const routeColor = record => {
    if (record?.kind === 'summit') return colors.summits;
    if (record?.mapCategory === 'ski' || record?.discipline === 'ski' || record?.discipline === 'ski-objective') return colors.skiing;
    if (record?.discipline === 'mountain-bike' || record?.mapCategory === 'mountain-bike' || record?.mapCategory === 'downhill-mtb') return colors.mtb;
    if (record?.discipline === 'nordic' || record?.mapCategory === 'nordic') return colors.nordic;
    if (record?.kind === 'race' && record?.discipline === 'trail') return colors['trail-races'];
    if (record?.kind === 'race') return colors['road-races'];
    return colors.adventures;
  };
  window.AdventureMapTheme = { colors, routeColor };

  const scheduled = new WeakMap();

  function settle(map) {
    if (!map || typeof map.invalidateSize !== 'function') return;
    try {
      map.invalidateSize({ pan: false, debounceMoveend: true });
      map.eachLayer?.(layer => {
        if (typeof layer.redraw === 'function') layer.redraw();
      });
    } catch (error) {
      console.warn('Leaflet resize recovery:', error);
    }
  }

  function schedule(map, delays = [0, 60, 180, 420]) {
    const prior = scheduled.get(map) || [];
    prior.forEach(clearTimeout);
    const timers = delays.map(delay => setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => settle(map)));
    }, delay));
    scheduled.set(map, timers);
  }

  function stabilize(map, container) {
    if (!map || !container) return () => {};

    container.style.width = '100%';
    container.style.maxWidth = '100%';
    container.style.position = container.style.position || 'relative';

    const refresh = () => schedule(map);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(entries => {
          const box = entries[0]?.contentRect;
          if (box && box.width > 0 && box.height > 0) refresh();
        })
      : null;
    resizeObserver?.observe(container);

    window.addEventListener('load', refresh, { passive: true });
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('orientationchange', () => schedule(map, [80, 220, 500]), { passive: true });
    window.addEventListener('pageshow', refresh, { passive: true });
    window.visualViewport?.addEventListener('resize', refresh, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh();
    });

    if (document.fonts?.ready) document.fonts.ready.then(refresh).catch(() => {});

    schedule(map, [0, 80, 220, 600]);

    return () => {
      resizeObserver?.disconnect();
      const timers = scheduled.get(map) || [];
      timers.forEach(clearTimeout);
      scheduled.delete(map);
    };
  }

  window.stabilizeLeafletMap = stabilize;
})();