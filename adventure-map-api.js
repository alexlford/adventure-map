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

  const api = {
    version: 1,
    leaflet: map,
    ready,
    state: snapshot,
    record(recordOrId) {
      return resolveRecord(recordOrId);
    },
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
    }
  };

  window.AdventureMap = Object.freeze(api);
})();
