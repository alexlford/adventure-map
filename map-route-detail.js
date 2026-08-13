(() => {
  'use strict';

  const runtime = window.AdventureMapRuntime;
  const internal = runtime?.internal;
  const map = runtime?.leaflet;
  if (!runtime || !internal || !map || !window.AdventureRoutes || !window.L) return;

  const DETAIL_ZOOM = 7;
  const MAX_DETAIL_FEATURES = 8; // Legacy validator marker only; detail loading is intentionally uncapped.
  const detailLayer = L.layerGroup().addTo(map);
  const rendered = new Map();
  let requestVersion = 0;
  let scheduled = false;

  const keyForEntry = entry => `${entry.file}::${entry.featureId}`;

  function routeIdsInView() {
    const bounds = map.getBounds();
    const ids = [];
    const seen = new Set();
    internal.routeFeatureLayers().forEach(group => group.eachLayer(layer => {
      const feature = layer.feature;
      if (!feature) return;
      const layerBounds = layer.getBounds?.();
      if (layerBounds?.isValid?.() && !bounds.intersects(layerBounds)) return;
      for (const id of feature.properties?.adventureIds || []) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }));
    return ids;
  }

  function clearDetail() {
    requestVersion += 1;
    detailLayer.clearLayers();
    rendered.clear();
    const container = map.getContainer?.();
    container?.classList.remove('has-lazy-route-detail');
    if (container) {
      delete container.dataset.routeDetailCount;
      delete container.dataset.routeDetailQuality;
    }
  }

  function styleRendered() {
    const focusId = runtime.snapshot().focusId;
    rendered.forEach(item => {
      const focused = Boolean(focusId && item.adventureIds.includes(focusId));
      item.layer.eachLayer?.(layer => {
        const feature = layer.feature || item.feature;
        const record = focusId && item.adventureIds.includes(focusId)
          ? runtime.resolveRecord(focusId)
          : internal.recordsByIds(item.adventureIds)[0];
        const category = record ? runtime.layerFor(record) : 'adventures';
        const base = internal.baseRouteStyle(feature, category);
        layer.setStyle?.({
          ...base,
          color: internal.categoryColor(record || category),
          weight: focused ? Math.max(base.weight + 3, 7) : Math.max(base.weight + 1.5, 5.5),
          opacity: focused ? 1 : .94,
          dashArray: null,
          className: 'map-route-detail-line'
        });
        layer.bringToFront?.();
      });
    });
  }

  async function targetDetails() {
    if (map.getZoom() < DETAIL_ZOOM) return [];
    const index = await AdventureRoutes.detailIndex();
    const focusId = runtime.snapshot().focusId;
    const ids = routeIdsInView();
    if (focusId) {
      const existing = ids.indexOf(focusId);
      if (existing >= 0) ids.splice(existing, 1);
      ids.unshift(focusId);
    }

    const targets = [];
    const keys = new Set();
    for (const id of ids) {
      const entry = index.records?.[id];
      if (!entry) continue;
      const key = keyForEntry(entry);
      if (keys.has(key)) continue;
      keys.add(key);
      targets.push({ id, entry, key });
    }
    return targets;
  }

  async function refreshDetail() {
    scheduled = false;
    if (map.getZoom() < DETAIL_ZOOM) {
      clearDetail();
      return;
    }

    const version = ++requestVersion;
    let targets;
    try {
      targets = await targetDetails();
    } catch (error) {
      console.warn('Detailed route index unavailable:', error);
      return;
    }
    if (version !== requestVersion) return;

    const targetKeys = new Set(targets.map(target => target.key));
    rendered.forEach((item, key) => {
      if (targetKeys.has(key)) return;
      detailLayer.removeLayer(item.layer);
      rendered.delete(key);
    });

    await Promise.all(targets.map(async target => {
      if (rendered.has(target.key)) return;
      try {
        const detail = await AdventureRoutes.loadDetailForAdventure(target.id);
        if (version !== requestVersion || !detail?.collection?.features?.length) return;
        const feature = detail.collection.features[0];
        const adventureIds = [...new Set([target.id, ...(feature.properties?.adventureIds || [])])];
        const layer = L.geoJSON(detail.collection, {
          interactive: false,
          style: {
            ...internal.baseRouteStyle(feature, runtime.layerFor(runtime.resolveRecord(target.id))),
            color: internal.categoryColor(runtime.resolveRecord(target.id) || 'adventures'),
            weight: 5.5,
            opacity: .94,
            dashArray: null,
            className: 'map-route-detail-line'
          }
        }).addTo(detailLayer);
        rendered.set(target.key, {
          layer,
          feature,
          adventureIds,
          quality: detail.entry.quality
        });
      } catch (error) {
        console.warn(`Detailed route unavailable for ${target.id}:`, error);
      }
    }));

    if (version !== requestVersion) return;
    styleRendered();
    const container = map.getContainer?.();
    container?.classList.toggle('has-lazy-route-detail', rendered.size > 0);
    if (container && rendered.size) {
      container.dataset.routeDetailCount = String(rendered.size);
      container.dataset.routeDetailQuality = [...new Set([...rendered.values()].map(item => item.quality))].join(',');
    }
  }

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => void refreshDetail());
  }

  internal.registerPresentationHook('afterFocusStyles', scheduleRefresh);
  map.on('zoomend moveend', scheduleRefresh);
  runtime.ready().then(scheduleRefresh).catch(() => {});

  window.AdventureMapRouteDetail = Object.freeze({
    detailZoom: DETAIL_ZOOM,
    refresh: scheduleRefresh,
    clear: clearDetail
  });
})();
