(() => {
  'use strict';

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