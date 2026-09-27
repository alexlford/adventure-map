(() => {
  'use strict';

  const api = window.AdventureMap;
  if (!api) return;

  const selectionApi = window.AdventureMapSelection;
  const validLayers = new Set(['mtb','nordic','road-races','trail-races','skiing','summits','adventures']);
  const initial = new URLSearchParams(location.search);
  const initialLayer = initial.get('layer');
  const initialSearch = initial.get('q') || '';
  const initialRecord = initial.get('record') || '';
  const initialSelection = [...new Set((initial.get('selection') || '').split(',').map(value => value.trim()).filter(Boolean))];
  const initialSource = initial.get('source') || '';
  const parseYear = value => {
    const year = Number(value);
    return Number.isFinite(year) && year >= 1900 && year <= 2200 ? year : null;
  };
  let initialFrom = parseYear(initial.get('from'));
  const initialThrough = parseYear(initial.get('through'));
  if (initialFrom && initialThrough && initialFrom > initialThrough) initialFrom = initialThrough;

  if (initialSelection.length) selectionApi?.set(initialSelection, { renderNow: false });

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
  const timelineRoute = registry?.routes?.find(route => route.key === 'timeline');
  const productionHost = registry?.origin ? new URL(registry.origin).hostname : 'adventures.alexlford.com';
  const canonicalMapPath = mapRoute?.path || '/map';
  const currentMapPath = () => location.hostname === productionHost ? canonicalMapPath : location.pathname;
  const timelineHref = () => location.hostname === productionHost ? (timelineRoute?.path || '/timeline') : 'timeline.html';

  const paramsForState = ({ includeRecord = true, fallbackRecord = '' } = {}) => {
    const current = api.state();
    const params = new URLSearchParams();
    if (current.filter && current.filter !== 'all') params.set('layer', current.filter);
    if (current.yearFrom) params.set('from', String(current.yearFrom));
    if (current.yearTo) params.set('through', String(current.yearTo));
    if (current.search?.trim()) params.set('q', current.search.trim());
    const selection = selectionApi?.snapshot();
    if (selection?.active) {
      params.set('selection', selection.ids.join(','));
      params.set('source', initialSource || 'timeline');
    }
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

  function ensureSelectionStyle() {
    if (document.getElementById('mapSelectionStyle')) return;
    const style = document.createElement('style');
    style.id = 'mapSelectionStyle';
    style.textContent = `
      .map-selection-context{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;padding:10px 11px;border:1px solid rgba(33,58,49,.16);border-radius:12px;background:rgba(255,255,255,.68)}
      .map-selection-context span{font-size:.74rem;font-weight:800;color:var(--ink,#17202a)}
      .map-selection-actions{display:flex;gap:6px;align-items:center}
      .map-selection-context a,.map-selection-context button{border:0;background:transparent;color:var(--accent,#173f32);font:inherit;font-size:.7rem;font-weight:800;text-decoration:none;cursor:pointer;padding:4px}
      @media(max-width:520px){.map-selection-context{align-items:flex-start;flex-direction:column}.map-selection-actions{width:100%;justify-content:space-between}}
    `;
    document.head.appendChild(style);
  }

  function renderSelectionContext() {
    document.querySelector('.map-selection-context')?.remove();
    const selection = selectionApi?.snapshot();
    if (!selection?.active) return;
    ensureSelectionStyle();
    const results = document.querySelector('.results-section');
    const list = document.getElementById('adventureList');
    if (!results || !list) return;
    const visibleCount = api.filteredRecords().length;
    const wrap = document.createElement('div');
    wrap.className = 'map-selection-context';
    wrap.innerHTML = `<span>Timeline selection · ${visibleCount} record${visibleCount===1?'':'s'}</span><span class="map-selection-actions"><a href="${timelineHref()}">Timeline</a><button type="button" data-clear-map-selection>Show all</button></span>`;
    list.insertAdjacentElement('beforebegin', wrap);
    wrap.querySelector('[data-clear-map-selection]')?.addEventListener('click', () => {
      selectionApi.clear({ renderNow: true, fit: true });
      renderSelectionContext();
      syncUrl();
    });
  }

  function abandonSelection() {
    const selection = selectionApi?.snapshot();
    if (!selection?.active) return false;
    selectionApi.clear({ renderNow: false });
    api.refresh();
    renderSelectionContext();
    return true;
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
        selectionApi?.clear({ renderNow: false });
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
      renderSelectionContext();
    } catch (error) {
      recordFocusActive = false;
      suppressNextPopupSync = false;
      console.warn('Unable to restore map record focus from the URL.', error);
    }
  }

  api.ready().then(() => {
    reflectYears();
    renderSelectionContext();
    if (initialSelection.length && !initialRecord) api.fit(api.filteredRecords());
    if (initialRecord) focusRequestedRecord();
  }).catch(error => console.warn('Unable to restore map URL state.', error));

  const syncSoon = ({ clearSelection = false } = {}) => {
    recordFocusActive = false;
    suppressNextPopupSync = false;
    if (clearSelection) abandonSelection();
    queueMicrotask(syncUrl);
  };
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => syncSoon({ clearSelection: true })));
  searchField?.addEventListener('input', () => syncSoon({ clearSelection: true }));
  yearFromField?.addEventListener('change', () => syncSoon({ clearSelection: true }));
  yearToField?.addEventListener('change', () => syncSoon({ clearSelection: true }));
  yearResetButton?.addEventListener('click', () => syncSoon({ clearSelection: true }));
  document.getElementById('adventureList')?.addEventListener('click', event => {
    if (event.target.closest('.adventure-item')) syncSoon();
  });
  api.leaflet.on('click', () => syncSoon());
  api.leaflet.on('popupopen', () => {
    if (suppressNextPopupSync) {
      suppressNextPopupSync = false;
      return;
    }
    queueMicrotask(syncUrl);
  });

  window.addEventListener('popstate', () => location.reload());
})();
