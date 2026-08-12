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
    mtb:'#2f7d4a',
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

  // Leaflet's invalidateSize({pan:false}) keeps the old top-left pixel origin,
  // which moves the geographic center whenever responsive layout changes the
  // map dimensions. Keep the current geographic center instead, without an
  // animation. This protects the master map's intentional default view and
  // also makes all map resize recovery deterministic.
  if (window.L?.Map?.prototype?.invalidateSize && !L.Map.prototype.invalidateSize.__adventureCenterSafe) {
    const originalInvalidateSize = L.Map.prototype.invalidateSize;
    const centerSafeInvalidateSize = function(options) {
      if (options && typeof options === 'object' && options.pan === false) {
        return originalInvalidateSize.call(this,{...options,pan:true,animate:false});
      }
      return originalInvalidateSize.call(this,options);
    };
    centerSafeInvalidateSize.__adventureCenterSafe = true;
    L.Map.prototype.invalidateSize = centerSafeInvalidateSize;
  }

  function textFromPopup(content) {
    if (typeof content !== 'string') return '';
    const holder = document.createElement('div');
    holder.innerHTML = content;
    const titles = [...holder.querySelectorAll('.popup-title,h3')].map(node => node.textContent?.trim()).filter(Boolean);
    if (titles.length > 1) return `${titles[0]} and ${titles.length - 1} more record${titles.length === 2 ? '' : 's'}`;
    if (titles[0]) return titles[0];
    return (holder.textContent || '').replace(/\s+/g,' ').trim().slice(0,120);
  }

  function decoratePopupLayer(layer,content) {
    if (!layer || layer.__adventureKeyboardPopup) return;
    layer.__adventureKeyboardPopup = true;
    const label = layer.options?.accessibilityLabel || textFromPopup(content) || 'Open map details';
    const apply = () => {
      const node = layer.getElement?.();
      if (!node || node.dataset.adventureKeyboard === 'true') return;
      node.dataset.adventureKeyboard = 'true';
      node.setAttribute('role','button');
      node.setAttribute('tabindex','0');
      node.setAttribute('aria-label',label);
      node.setAttribute('aria-haspopup','dialog');
      node.setAttribute('aria-keyshortcuts','Enter Space');
      node.addEventListener('keydown',event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        layer.openPopup?.();
      });
      node.addEventListener('focus',() => layer.fire?.('mouseover'));
      node.addEventListener('blur',() => layer.fire?.('mouseout'));
    };
    layer.on?.('add',() => requestAnimationFrame(apply));
    requestAnimationFrame(apply);
  }

  if (window.L?.Path?.prototype?.bindPopup && !L.Path.prototype.bindPopup.__adventureKeyboardWrapped) {
    const originalBindPopup = L.Path.prototype.bindPopup;
    const wrappedBindPopup = function(content,...rest) {
      const result = originalBindPopup.call(this,content,...rest);
      decoratePopupLayer(this,content);
      return result;
    };
    wrappedBindPopup.__adventureKeyboardWrapped = true;
    L.Path.prototype.bindPopup = wrappedBindPopup;
  }

  function detailProvenance() {
    const meta = document.getElementById('routeMeta');
    if (!meta) return;
    const text = (meta.textContent || '').trim().toLowerCase();
    let provenance = 'route';
    if (text.startsWith('personal gps')) provenance = 'personal-gps';
    else if (text.startsWith('historical')) provenance = 'historical-course';
    else if (text.startsWith('location')) provenance = 'location-only';
    else if (text.startsWith('route withheld')) provenance = 'privacy-withheld';
    meta.dataset.provenance = provenance;
  }

  function decorateDetailLocation(layer) {
    if (!layer || layer.__adventureLocationStyled) return;
    layer.__adventureLocationStyled = true;
    const bodyAccent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#17202a';
    layer.setStyle?.({
      radius:8.5,
      color:'#fff',
      weight:2.5,
      fillColor:bodyAccent,
      fillOpacity:.96,
      opacity:1
    });
    const title = document.querySelector('.hero h1')?.textContent?.trim();
    if (title && typeof layer.bindTooltip === 'function') {
      layer.bindTooltip(title,{direction:'top',offset:[0,-7],opacity:.96,className:'detail-location-label'});
    }
    requestAnimationFrame(() => layer.getElement?.()?.classList.add('detail-location-point'));
  }

  if (window.L?.map && !L.map.__adventureWrapped) {
    const originalMap = L.map;
    const wrappedMap = function(...args) {
      const map = originalMap.apply(L,args);
      const container = map.getContainer?.();
      if (container?.classList?.contains('detail-map')) {
        detailProvenance();
        map.on('layeradd',event => {
          if (window.L?.CircleMarker && event.layer instanceof L.CircleMarker) {
            setTimeout(() => decorateDetailLocation(event.layer),0);
          }
        });
      }
      return map;
    };
    wrappedMap.__adventureWrapped = true;
    L.map = wrappedMap;
  }

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