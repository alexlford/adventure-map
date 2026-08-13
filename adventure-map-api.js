(() => {
  'use strict';

  if (typeof state !== 'object' || typeof map === 'undefined') {
    console.warn('AdventureMap API could not attach because the map core is unavailable.');
    return;
  }

  const resolveRecord = recordOrId => {
    if (!recordOrId) return null;
    if (typeof recordOrId === 'object') return recordOrId;
    return state.adventures.find(record => record.id === recordOrId || record.slug === recordOrId) || null;
  };

  const snapshot = () => Object.freeze({
    filter: state.filter,
    search: state.search,
    yearFrom: state.yearFrom,
    yearTo: state.yearTo,
    focusId: state.focusId,
    pinnedFocusId: state.pinnedFocusId || null,
    recordCount: state.adventures.length,
    routeFeatureCount: state.routes?.features?.length || 0
  });

  const records = () => state.adventures.slice();
  const filteredRecords = () => typeof filteredAdventures === 'function' ? filteredAdventures().slice() : records();
  const visibleRoutes = items => typeof visibleRouteFeatures === 'function' ? visibleRouteFeatures(items || filteredRecords()).slice() : [];

  let readyPromise = null;
  const ready = ({ timeoutMs = 15000 } = {}) => {
    if (state.adventures.length && state.routes) return Promise.resolve(snapshot());
    if (readyPromise) return readyPromise;
    readyPromise = new Promise((resolve, reject) => {
      const started = performance.now();
      const check = () => {
        if (state.adventures.length && state.routes) {
          requestAnimationFrame(() => resolve(snapshot()));
          return;
        }
        if (performance.now() - started >= timeoutMs) {
          reject(new Error('Adventure map did not become ready in time.'));
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    }).finally(() => { readyPromise = null; });
    return readyPromise;
  };

  const runtimeInternal = Object.freeze({
    setCategoryColors(colors = {}) {
      if (!colors || typeof colors !== 'object' || typeof CATEGORY !== 'object') return false;
      Object.entries(colors).forEach(([key, color]) => {
        if (CATEGORY[key] && typeof color === 'string' && color) CATEGORY[key].color = color;
      });
      return true;
    },
    recordsByIds(ids = []) {
      if (!Array.isArray(ids)) return [];
      return ids.map(id => state.adventures.find(record => record.id === id)).filter(Boolean);
    },
    routeFeatureLayers() {
      return Array.from(state.routeFeatureLayers.values());
    },
    markerGroups() {
      const grouped = new Map();
      state.markers.forEach((marker, id) => {
        if (!grouped.has(marker)) grouped.set(marker, []);
        grouped.get(marker).push(id);
      });
      return Array.from(grouped, ([marker, ids]) => Object.freeze({ marker, ids: Object.freeze(ids.slice()) }));
    },
    hasRoute(id) {
      return state.routeLayers.has(id);
    },
    baseRouteStyle(feature, category) {
      return typeof baseRouteStyle === 'function' ? baseRouteStyle(feature, category) : {};
    },
    routeContainsId(layer, id) {
      return typeof routeContainsId === 'function' ? routeContainsId(layer, id) : false;
    },
    applyFocusStyles() {
      if (typeof applyFocusStyles === 'function') applyFocusStyles();
    },
    rerenderMarkers() {
      if (typeof renderMarkers !== 'function') return false;
      renderMarkers(filteredRecords());
      return true;
    }
  });

  const runtime = Object.freeze({
    leaflet: map,
    ready,
    snapshot,
    resolveRecord,
    records,
    filteredRecords,
    visibleRoutes,
    layerFor(recordOrId) {
      const record = resolveRecord(recordOrId);
      return record && typeof publicLayerFor === 'function' ? publicLayerFor(record) : null;
    },
    popupHtml(recordOrId) {
      const record = resolveRecord(recordOrId);
      return record && typeof popupCard === 'function' ? popupCard(record) : '';
    },
    focus(recordOrId) {
      const record = resolveRecord(recordOrId);
      if (!record || typeof focusAdventure !== 'function') return false;
      focusAdventure(record);
      return true;
    },
    emphasize(recordOrId, on = true) {
      const record = resolveRecord(recordOrId);
      if (!record || typeof setRouteEmphasis !== 'function') return false;
      setRouteEmphasis(record.id, Boolean(on));
      return true;
    },
    clearFocus() {
      state.focusId = null;
      if ('pinnedFocusId' in state) state.pinnedFocusId = null;
      if (typeof applyFocusStyles === 'function') applyFocusStyles();
    },
    fit(items) {
      if (typeof fitVisible !== 'function') return false;
      fitVisible(Array.isArray(items) ? items : filteredRecords());
      return true;
    },
    refresh() {
      if (typeof render !== 'function') return false;
      render();
      return true;
    },
    setViewState(next = {}, { renderNow = true, fit = false } = {}) {
      if (Object.hasOwn(next, 'filter')) state.filter = next.filter || 'all';
      if (Object.hasOwn(next, 'search')) state.search = String(next.search || '');
      if (Object.hasOwn(next, 'yearFrom')) state.yearFrom = Number.isFinite(next.yearFrom) ? next.yearFrom : null;
      if (Object.hasOwn(next, 'yearTo')) state.yearTo = Number.isFinite(next.yearTo) ? next.yearTo : null;
      if (renderNow && typeof render === 'function') render();
      if (fit && typeof fitVisible === 'function') fitVisible(filteredRecords());
      return snapshot();
    },
    internal: runtimeInternal
  });

  window.AdventureMapRuntime = runtime;

  const core = Object.freeze({
    leaflet: runtime.leaflet,
    ready: runtime.ready,
    snapshot: runtime.snapshot,
    resolveRecord: runtime.resolveRecord,
    records: runtime.records,
    filteredRecords: runtime.filteredRecords,
    visibleRoutes: runtime.visibleRoutes,
    layerFor: runtime.layerFor,
    popupHtml: runtime.popupHtml,
    focus: runtime.focus,
    emphasize: runtime.emphasize,
    clearFocus: runtime.clearFocus,
    fit: runtime.fit,
    refresh: runtime.refresh,
    setViewState: runtime.setViewState
  });

  const api = {
    version: 1,
    leaflet: core.leaflet,
    ready: core.ready,
    state: core.snapshot,
    record(recordOrId) {
      return core.resolveRecord(recordOrId);
    },
    records: core.records,
    filteredRecords: core.filteredRecords,
    visibleRoutes: core.visibleRoutes,
    layerFor: core.layerFor,
    popupHtml: core.popupHtml,
    focus: core.focus,
    emphasize: core.emphasize,
    clearFocus: core.clearFocus,
    fit: core.fit,
    refresh: core.refresh,
    setViewState: core.setViewState
  };

  window.AdventureMap = Object.freeze(api);
})();
