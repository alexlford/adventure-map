(() => {
  'use strict';

  const runtime = window.AdventureMapRuntime;
  const internal = runtime?.internal;
  const map = runtime?.leaflet;
  if (!runtime || !internal || !map || !window.AdventureRoutes || !window.L) return;

  const DETAIL_ZOOM = 7;
  const MAX_DETAIL_FEATURES = 8; // Legacy validator marker only; detail loading is intentionally uncapped.
  const DETAIL_LOAD_CONCURRENCY = 6;
  const detailLayer = L.layerGroup().addTo(map);
  const rendered = new Map();
  let requestVersion = 0;
  let scheduled = false;
  let refreshInFlight = false;
  let refreshQueued = false;

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

  function clearDetail({ invalidate = true } = {}) {
    if (invalidate) requestVersion += 1;
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

  function updateDetailStatus() {
    styleRendered();
    const container = map.getContainer?.();
    container?.classList.toggle('has-lazy-route-detail', rendered.size > 0);
    if (!container) return;
    if (rendered.size) {
      container.dataset.routeDetailCount = String(rendered.size);
      container.dataset.routeDetailQuality = [...new Set([...rendered.values()].map(item => item.quality))].join(',');
    } else {
      delete container.dataset.routeDetailCount;
      delete container.dataset.routeDetailQuality;
    }
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

  function makeRenderedItem(target, detail) {
    const feature = detail.collection.features[0];
    const adventureIds = [...new Set([target.id, ...(feature.properties?.adventureIds || [])])];
    const record = runtime.resolveRecord(target.id);
    const layer = L.geoJSON(detail.collection, {
      interactive: false,
      style: {
        ...internal.baseRouteStyle(feature, runtime.layerFor(record)),
        color: internal.categoryColor(record || 'adventures'),
        weight: 5.5,
        opacity: .94,
        dashArray: null,
        className: 'map-route-detail-line'
      }
    });
    return {
      layer,
      feature,
      adventureIds,
      quality: detail.entry.quality
    };
  }

  async function loadTarget(target) {
    try {
      const detail = await AdventureRoutes.loadDetailForAdventure(target.id);
      if (!detail?.collection?.features?.length) return null;
      return makeRenderedItem(target, detail);
    } catch (firstError) {
      try {
        const detail = await AdventureRoutes.loadDetailForAdventure(target.id, { fresh: true });
        if (!detail?.collection?.features?.length) return null;
        return makeRenderedItem(target, detail);
      } catch (error) {
        console.warn(`Detailed route unavailable for ${target.id}:`, error, firstError);
        return null;
      }
    }
  }

  async function loadMissingTargets(targets) {
    const missing = targets.filter(target => !rendered.has(target.key));
    const staged = new Map();
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < missing.length) {
        const target = missing[nextIndex++];
        const item = await loadTarget(target);
        if (item) staged.set(target.key, item);
      }
    }

    const workerCount = Math.min(DETAIL_LOAD_CONCURRENCY, missing.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return staged;
  }

  function commitDetails(targets, staged) {
    const targetKeys = new Set(targets.map(target => target.key));

    rendered.forEach((item, key) => {
      if (targetKeys.has(key)) return;
      detailLayer.removeLayer(item.layer);
      rendered.delete(key);
    });

    staged.forEach((item, key) => {
      if (rendered.has(key) || !targetKeys.has(key)) return;
      item.layer.addTo(detailLayer);
      rendered.set(key, item);
    });

    updateDetailStatus();
  }

  async function reconcileDetail(version) {
    if (map.getZoom() < DETAIL_ZOOM) {
      clearDetail({ invalidate: false });
      return;
    }

    let targets;
    try {
      targets = await targetDetails();
    } catch (error) {
      console.warn('Detailed route index unavailable:', error);
      return;
    }
    if (version !== requestVersion) return;

    const staged = await loadMissingTargets(targets);
    if (version !== requestVersion) return;

    commitDetails(targets, staged);
  }

  async function drainRefreshes() {
    scheduled = false;
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      while (refreshQueued) {
        refreshQueued = false;
        const version = requestVersion;
        await reconcileDetail(version);
      }
    } finally {
      refreshInFlight = false;
      if (refreshQueued && !scheduled) {
        scheduled = true;
        requestAnimationFrame(() => void drainRefreshes());
      }
    }
  }

  function scheduleRefresh() {
    requestVersion += 1;
    refreshQueued = true;
    if (map.getZoom() < DETAIL_ZOOM) clearDetail({ invalidate: false });
    if (scheduled || refreshInFlight) return;
    scheduled = true;
    requestAnimationFrame(() => void drainRefreshes());
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
