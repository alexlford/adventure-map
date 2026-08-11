(() => {
  'use strict';

  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
  const isMapped = item => Number.isFinite(item?.lat) && Number.isFinite(item?.lon);
  const production = () => location.hostname === 'adventures.alexlford.com';
  const fullMapHref = () => production() ? '/map' : 'map.html';
  const recordHref = item => {
    if (item?.href) return item.href;
    if (!item?.id) return null;
    return production()
      ? `/record/${encodeURIComponent(item.slug || item.id)}/`
      : `detail.html?record=${encodeURIComponent(item.slug || item.id)}`;
  };
  const coordinateKey = item => `${item.lat.toFixed(4)},${item.lon.toFixed(4)}`;

  function popupHtml(group, options) {
    const cards = group.slice(0,8).map(item => {
      const kicker = options.kickerFor?.(item) || options.kicker || '';
      const meta = options.metaFor?.(item) || item.location || item.region || '';
      const value = options.valueLabelFor?.(item) || '';
      const href = options.hrefFor ? options.hrefFor(item) : recordHref(item);
      const action = href ? `<p class="popup-detail"><a href="${esc(href)}">Open record →</a></p>` : '';
      return `<article class="popup-card chapter-popup"><p class="popup-kicker">${esc(kicker)}</p><h3 class="popup-title">${esc(item.name)}</h3>${meta?`<p class="popup-meta">${esc(meta)}</p>`:''}${value?`<p class="popup-meta"><strong>${esc(value)}</strong></p>`:''}${action}</article>`;
    }).join('');
    const more = group.length > 8 ? `<p class="chapter-map-overflow">+ ${group.length - 8} more records at this location</p>` : '';
    return cards + more;
  }

  function mount(options) {
    const el = document.getElementById(options.elementId);
    if (!el || !window.L) return null;
    const initialRecords = (options.records || []).filter(isMapped);
    if (!initialRecords.length) {
      el.outerHTML = `<div class="empty">${esc(options.emptyText || 'No mapped locations are available yet.')}</div>`;
      return null;
    }

    const compact = window.matchMedia?.('(max-width: 760px)')?.matches || false;
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches || false;
    const passiveMobile = options.mobilePassive !== false && (compact || coarse);
    el.parentElement?.classList.toggle('is-passive-map',passiveMobile);

    const map = L.map(el, {
      scrollWheelZoom:false,
      worldCopyJump:true,
      zoomControl:!passiveMobile,
      dragging:!passiveMobile,
      touchZoom:!passiveMobile,
      doubleClickZoom:!passiveMobile,
      boxZoom:!passiveMobile,
      keyboard:!passiveMobile,
      minZoom:2,
      attributionControl:true
    });
    window.stabilizeLeafletMap?.(map,el);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19,
      attribution:'&copy; OpenStreetMap contributors',
      updateWhenIdle:false,
      keepBuffer:3
    }).addTo(map);
    const markerLayer = L.layerGroup().addTo(map);
    tiles.on('load',() => map.invalidateSize({pan:false}));

    let currentRecords = initialRecords;
    let currentGroups = new Map();

    const updateCount = records => {
      const count = document.querySelector(`[data-map-count="${options.elementId}"]`);
      if (count) count.textContent = `${records.length} mapped ${options.countLabel || 'places'}`;
    };

    const fitRecords = records => {
      const candidates = (records || []).filter(isMapped);
      const bounds = L.latLngBounds([]);
      candidates.forEach(item => bounds.extend([item.lat,item.lon]));
      if (!bounds.isValid()) return;
      if (new Set(candidates.map(coordinateKey)).size === 1) map.setView(bounds.getCenter(),options.singleZoom || 9);
      else map.fitBounds(bounds,{padding:passiveMobile?[18,18]:[28,28],maxZoom:options.maxZoom || 6});
    };

    const preferredRecords = () => {
      const preferred = options.fitRecordsFor?.(currentRecords);
      return Array.isArray(preferred) && preferred.some(isMapped) ? preferred : currentRecords;
    };

    const fitCurrent = () => fitRecords(preferredRecords());

    const draw = (records,{fit=true}={}) => {
      currentRecords = (records || []).filter(isMapped);
      updateCount(currentRecords);
      markerLayer.clearLayers();
      currentGroups = new Map();
      currentRecords.forEach(item => {
        const key = coordinateKey(item);
        if (!currentGroups.has(key)) currentGroups.set(key,[]);
        currentGroups.get(key).push(item);
      });

      const values = currentRecords.map(item => Number(options.valueFor?.(item))).filter(Number.isFinite);
      const minValue = values.length ? Math.min(...values) : 0;
      const maxValue = values.length ? Math.max(...values) : 0;
      const scaleRadius = value => {
        if (!Number.isFinite(value) || maxValue <= minValue) return 6;
        const t = Math.sqrt(Math.max(0,(value - minValue) / (maxValue - minValue)));
        return 5 + t * 5;
      };

      currentGroups.forEach(group => {
        const first = group[0];
        const primaryValue = Number(options.valueFor?.(first));
        const base = options.valueFor ? scaleRadius(primaryValue) : 5.5;
        const radius = Math.min(12,base + Math.min(3.2,(group.length - 1) * .85));
        const color = options.colorFor?.(first,group) || options.color || '#357662';
        const marker = L.circleMarker([first.lat,first.lon], {
          radius,
          color:'#fff',
          weight:2,
          fillColor:color,
          fillOpacity:.88
        }).addTo(markerLayer);
        marker.bindPopup(popupHtml(group,options),{maxWidth:340});
        if (!passiveMobile) {
          const tooltip = options.tooltipFor?.(first,group) || (group.length > 1 ? `${first.name} + ${group.length - 1}` : first.name);
          marker.bindTooltip(esc(tooltip),{direction:'top',offset:[0,-5],opacity:.94,className:'chapter-map-tooltip'});
        }
        marker.on('mouseover',() => marker.setStyle({fillOpacity:1,weight:3}));
        marker.on('mouseout',() => marker.setStyle({fillOpacity:.88,weight:2}));
      });

      if (fit && currentRecords.length) fitCurrent();
    };

    const link = document.querySelector(`[data-map-link="${options.elementId}"]`);
    if (link) link.href = fullMapHref();
    draw(initialRecords);
    setTimeout(() => map.invalidateSize({pan:false}),120);
    setTimeout(() => { map.invalidateSize({pan:false}); tiles.redraw(); },420);

    return {
      map,
      setRecords(records,config){ draw(records,config); },
      fit(){ fitCurrent(); },
      fitAll(){ fitRecords(currentRecords); },
      focus(item,zoom=options.focusZoom || 8){ if(isMapped(item)) map.setView([item.lat,item.lon],zoom); },
      get records(){ return currentRecords.slice(); },
      get locationCount(){ return currentGroups.size; },
      get passiveMobile(){ return passiveMobile; }
    };
  }

  window.AdventureChapterMap = { mount };
})();
