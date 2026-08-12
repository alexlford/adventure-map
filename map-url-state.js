(() => {
  'use strict';

  if (typeof state !== 'object') return;
  const validLayers = new Set(['mtb','nordic','road-races','trail-races','skiing','summits','adventures']);
  const initial = new URLSearchParams(location.search);
  const initialLayer = initial.get('layer');
  const initialSearch = initial.get('q') || '';
  const initialRecord = initial.get('record') || '';
  const parseYear = value => {
    const year = Number(value);
    return Number.isFinite(year) && year >= 1900 && year <= 2200 ? year : null;
  };
  const initialFrom = parseYear(initial.get('from'));
  const initialThrough = parseYear(initial.get('through'));

  if (validLayers.has(initialLayer)) state.filter = initialLayer;
  if (initialSearch) state.search = initialSearch;
  if (typeof searchInput !== 'undefined' && searchInput) searchInput.value = initialSearch;
  if (initialFrom) state.yearFrom = initialFrom;
  if (initialThrough) state.yearTo = initialThrough;

  const reflectLayer = () => {
    document.querySelectorAll('[data-filter]').forEach(button => {
      button.classList.toggle('is-active',button.dataset.filter === state.filter || (state.filter === 'all' && button.dataset.filter === 'all'));
    });
  };
  reflectLayer();

  if (typeof initYearControls === 'function') {
    const originalInitYearControls = initYearControls;
    initYearControls = function(...args) {
      const result = originalInitYearControls(...args);
      if (initialFrom && typeof yearFrom !== 'undefined' && yearFrom) {
        state.yearFrom = initialFrom;
        yearFrom.value = String(initialFrom);
      }
      if (initialThrough && typeof yearTo !== 'undefined' && yearTo) {
        state.yearTo = initialThrough;
        yearTo.value = String(initialThrough);
      }
      if (state.yearFrom && state.yearTo && state.yearFrom > state.yearTo) {
        state.yearFrom = state.yearTo;
        if (typeof yearFrom !== 'undefined' && yearFrom) yearFrom.value = String(state.yearFrom);
      }
      return result;
    };
  }

  let recordFocusActive = Boolean(initialRecord);
  let suppressInitialPopupSync = Boolean(initialRecord);
  let recordObserver = null;
  let recordTimer = null;

  function requestedRecord() {
    if (!recordFocusActive || !initialRecord || !Array.isArray(state.adventures) || !state.adventures.length) return null;
    return state.adventures.find(record => record.id === initialRecord || record.slug === initialRecord) || null;
  }

  function inferredLayerFor(record) {
    if (!record || typeof publicLayerFor !== 'function') return null;
    const layer = publicLayerFor(record);
    return validLayers.has(layer) ? layer : null;
  }

  function setNaturalLayer(record) {
    const layer = inferredLayerFor(record);
    if (!layer || state.filter === layer) return false;
    state.filter = layer;
    reflectLayer();
    if (typeof render === 'function') render();
    return true;
  }

  function syncInitialRecordUrl(record) {
    if (!initialRecord) return;
    const params = new URLSearchParams();
    if (state.filter && state.filter !== 'all') params.set('layer',state.filter);
    if (state.yearFrom) params.set('from',String(state.yearFrom));
    if (state.yearTo) params.set('through',String(state.yearTo));
    if (state.search?.trim()) params.set('q',state.search.trim());
    params.set('record',record?.slug || record?.id || initialRecord);
    const cleanPath = location.hostname === 'adventures.alexlford.com' ? '/map' : location.pathname;
    history.replaceState(null,'',`${cleanPath}?${params.toString()}${location.hash}`);
  }

  function focusRequestedRecord() {
    const record = requestedRecord();
    if (!record || typeof focusAdventure !== 'function') return false;

    if (!validLayers.has(initialLayer) && state.filter === 'all') setNaturalLayer(record);

    if (typeof filteredAdventures === 'function' && !filteredAdventures().some(item => item.id === record.id)) {
      setNaturalLayer(record);
      state.search = '';
      state.yearFrom = null;
      state.yearTo = null;
      if (typeof searchInput !== 'undefined' && searchInput) searchInput.value = '';
      if (typeof yearFrom !== 'undefined' && yearFrom) yearFrom.value = '';
      if (typeof yearTo !== 'undefined' && yearTo) yearTo.value = '';
      reflectLayer();
      if (typeof render === 'function') render();
    }

    focusAdventure(record);
    const item = document.querySelector(`.adventure-item[data-id="${CSS.escape(record.id)}"]`);
    item?.scrollIntoView?.({block:'nearest',inline:'nearest'});
    syncInitialRecordUrl(record);
    stopRecordFocus();
    return true;
  }

  function scheduleRecordFocus() {
    if (!recordFocusActive) return;
    clearTimeout(recordTimer);
    recordTimer = setTimeout(focusRequestedRecord,60);
  }

  function stopRecordFocus() {
    if (!recordFocusActive) return;
    recordFocusActive = false;
    clearTimeout(recordTimer);
    recordObserver?.disconnect();
  }

  if (initialRecord) {
    const list = document.getElementById('adventureList');
    recordObserver = list ? new MutationObserver(scheduleRecordFocus) : null;
    recordObserver?.observe(list,{childList:true});
    scheduleRecordFocus();
    window.addEventListener('load',() => {
      scheduleRecordFocus();
      setTimeout(scheduleRecordFocus,500);
      setTimeout(() => recordObserver?.disconnect(),10000);
    },{once:true});
  }

  const focusedRecord = () => {
    const id = state.pinnedFocusId || null;
    if (!id || !Array.isArray(state.adventures)) return null;
    return state.adventures.find(record => record.id === id) || null;
  };

  function syncUrl() {
    const params = new URLSearchParams();
    if (state.filter && state.filter !== 'all') params.set('layer',state.filter);
    if (state.yearFrom) params.set('from',String(state.yearFrom));
    if (state.yearTo) params.set('through',String(state.yearTo));
    if (state.search?.trim()) params.set('q',state.search.trim());
    const focused = focusedRecord();
    if (focused) params.set('record',focused.slug || focused.id);
    const query = params.toString();
    const cleanPath = location.hostname === 'adventures.alexlford.com' ? '/map' : location.pathname;
    history.replaceState(null,'',`${cleanPath}${query?`?${query}`:''}${location.hash}`);
  }

  const syncSoon = () => {
    stopRecordFocus();
    suppressInitialPopupSync = false;
    queueMicrotask(syncUrl);
  };
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click',syncSoon));
  if (typeof searchInput !== 'undefined' && searchInput) searchInput.addEventListener('input',syncSoon);
  if (typeof yearFrom !== 'undefined' && yearFrom) yearFrom.addEventListener('change',syncSoon);
  if (typeof yearTo !== 'undefined' && yearTo) yearTo.addEventListener('change',syncSoon);
  if (typeof yearReset !== 'undefined' && yearReset) yearReset.addEventListener('click',syncSoon);
  document.getElementById('adventureList')?.addEventListener('click',event => {
    if (event.target.closest('.adventure-item')) syncSoon();
  });
  if (typeof map !== 'undefined') {
    map.on('click',syncSoon);
    map.on('popupopen',() => queueMicrotask(() => {
      if (suppressInitialPopupSync) {
        suppressInitialPopupSync = false;
        return;
      }
      syncUrl();
    }));
  }

  window.addEventListener('popstate',() => location.reload());
})();
