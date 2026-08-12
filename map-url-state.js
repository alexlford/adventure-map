(() => {
  'use strict';

  const api = window.AdventureMap;
  if (!api) return;

  const validLayers = new Set(['mtb','nordic','road-races','trail-races','skiing','summits','adventures']);
  const initial = new URLSearchParams(location.search);
  const initialLayer = initial.get('layer');
  const initialSearch = initial.get('q') || '';
  const initialRecord = initial.get('record') || '';
  const parseYear = value => {
    const year = Number(value);
    return Number.isFinite(year) && year >= 1900 && year <= 2200 ? year : null;
  };
  let initialFrom = parseYear(initial.get('from'));
  const initialThrough = parseYear(initial.get('through'));
  if (initialFrom && initialThrough && initialFrom > initialThrough) initialFrom = initialThrough;

  const initialView = {};
  if (validLayers.has(initialLayer)) initialView.filter = initialLayer;
  if (initialSearch) initialView.search = initialSearch;
  if (initialFrom) initialView.yearFrom = initialFrom;
  if (initialThrough) initialView.yearTo = initialThrough;
  api.setViewState(initialView, { renderNow: false });

  const searchField = document.getElementById('searchInput');
  const yearFromField = document.getElementById('yearFrom');
  const yearToField = document.getElementById('yearTo');
  const yearResetButton = document.getElementById('yearReset');
  if (searchField) searchField.value = initialSearch;

  const reflectLayer = () => {
    const current = api.state().filter;
    document.querySelectorAll('[data-filter]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.filter === current || (current === 'all' && button.dataset.filter === 'all'));
    });
  };
  const reflectYears = () => {
    const current = api.state();
    if (yearFromField) yearFromField.value = current.yearFrom ? String(current.yearFrom) : '';
    if (yearToField) yearToField.value = current.yearTo ? String(current.yearTo) : '';
  };
  reflectLayer();

  const registry = window.AdventureSiteRoutes;
  const mapRoute = registry?.routes?.find(route => route.key === 'map');
  const productionHost = registry?.origin ? new URL(registry.origin).hostname : 'adventures.alexlford.com';
  const canonicalMapPath = mapRoute?.path || '/map';
  const currentMapPath = () => location.hostname === productionHost ? canonicalMapPath : location.pathname;

  const paramsForState = ({ includeRecord = true, fallbackRecord = '' } = {}) => {
    const current = api.state();
    const params = new URLSearchParams();
    if (current.filter && current.filter !== 'all') params.set('layer', current.filter);
    if (current.yearFrom) params.set('from', String(current.yearFrom));
    if (current.yearTo) params.set('through', String(current.yearTo));
    if (current.search?.trim()) params.set('q', current.search.trim());
    if (includeRecord) {
      const focused = api.record(current.pinnedFocusId || current.focusId);
      const key = focused?.slug || focused?.id || fallbackRecord;
      if (key) params.set('record', key);
    }
    return params;
  };

  function replaceUrl(params) {
    const query = params.toString();
    history.replaceState(null, '', `${currentMapPath()}${query ? `?${query}` : ''}${location.hash}`);
  }

  function syncUrl() {
    replaceUrl(paramsForState());
  }

  let recordFocusActive = Boolean(initialRecord);
  let suppressNextPopupSync = Boolean(initialRecord);

  function setNaturalLayer(record, { renderNow = true } = {}) {
    const layer = api.layerFor(record);
    if (!layer || !validLayers.has(layer) || api.state().filter === layer) return false;
    api.setViewState({ filter: layer }, { renderNow });
    reflectLayer();
    return true;
  }

  async function focusRequestedRecord() {
    if (!recordFocusActive || !initialRecord) return;
    try {
      await api.ready();
      reflectYears();
      const record = api.record(initialRecord);
      if (!record) {
        recordFocusActive = false;
        suppressNextPopupSync = false;
        return;
      }

      const current = api.state();
      if (!validLayers.has(initialLayer) && current.filter === 'all') setNaturalLayer(record);

      if (!api.filteredRecords().some(item => item.id === record.id)) {
        const natural = api.layerFor(record);
        api.setViewState({
          filter: validLayers.has(natural) ? natural : 'all',
          search: '',
          yearFrom: null,
          yearTo: null
        });
        if (searchField) searchField.value = '';
        reflectYears();
        reflectLayer();
      }

      api.focus(record);
      document.querySelector(`.adventure-item[data-id="${CSS.escape(record.id)}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      replaceUrl(paramsForState({ fallbackRecord: record.slug || record.id }));
      recordFocusActive = false;
      suppressNextPopupSync = false;
    } catch (error) {
      recordFocusActive = false;
      suppressNextPopupSync = false;
      console.warn('Unable to restore map record focus from the URL.', error);
    }
  }

  api.ready().then(() => {
    reflectYears();
    if (initialRecord) focusRequestedRecord();
  }).catch(error => console.warn('Unable to restore map URL state.', error));

  const syncSoon = () => {
    recordFocusActive = false;
    suppressNextPopupSync = false;
    queueMicrotask(syncUrl);
  };
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', syncSoon));
  searchField?.addEventListener('input', syncSoon);
  yearFromField?.addEventListener('change', syncSoon);
  yearToField?.addEventListener('change', syncSoon);
  yearResetButton?.addEventListener('click', syncSoon);
  document.getElementById('adventureList')?.addEventListener('click', event => {
    if (event.target.closest('.adventure-item')) syncSoon();
  });
  api.leaflet.on('click', syncSoon);
  api.leaflet.on('popupopen', () => {
    if (suppressNextPopupSync) {
      suppressNextPopupSync = false;
      return;
    }
    queueMicrotask(syncUrl);
  });

  window.addEventListener('popstate', () => location.reload());
})();
