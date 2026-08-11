(() => {
  'use strict';

  if (typeof state !== 'object') return;
  const validLayers = new Set(['mtb','nordic','road-races','trail-races','skiing','summits','adventures']);
  const initial = new URLSearchParams(location.search);
  const initialLayer = initial.get('layer');
  const initialSearch = initial.get('q') || '';
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

  function syncUrl() {
    const params = new URLSearchParams();
    if (state.filter && state.filter !== 'all') params.set('layer',state.filter);
    if (state.yearFrom) params.set('from',String(state.yearFrom));
    if (state.yearTo) params.set('through',String(state.yearTo));
    if (state.search?.trim()) params.set('q',state.search.trim());
    const query = params.toString();
    const cleanPath = location.hostname === 'adventures.alexlford.com' ? '/map' : location.pathname;
    history.replaceState(null,'',`${cleanPath}${query?`?${query}`:''}${location.hash}`);
  }

  const syncSoon = () => queueMicrotask(syncUrl);
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click',syncSoon));
  if (typeof searchInput !== 'undefined' && searchInput) searchInput.addEventListener('input',syncSoon);
  if (typeof yearFrom !== 'undefined' && yearFrom) yearFrom.addEventListener('change',syncSoon);
  if (typeof yearTo !== 'undefined' && yearTo) yearTo.addEventListener('change',syncSoon);
  if (typeof yearReset !== 'undefined' && yearReset) yearReset.addEventListener('click',syncSoon);

  window.addEventListener('popstate',() => location.reload());
})();
