(() => {
  'use strict';

  if (typeof filteredAdventures !== 'function') return;

  const baseFilteredAdventures = filteredAdventures;
  let selectedIds = new Set();

  filteredAdventures = function filteredAdventuresWithSelection() {
    const items = baseFilteredAdventures();
    if (!selectedIds.size) return items;
    return items.filter(record => selectedIds.has(record.id));
  };

  const cleanIds = ids => [...new Set((Array.isArray(ids) ? ids : []).map(value => String(value || '').trim()).filter(Boolean))];

  function set(ids, { renderNow = true, fit = false } = {}) {
    selectedIds = new Set(cleanIds(ids));
    if (renderNow && typeof render === 'function') render();
    if (fit && typeof fitVisible === 'function') fitVisible(filteredAdventures());
    return snapshot();
  }

  function clear({ renderNow = true, fit = false } = {}) {
    selectedIds.clear();
    if (renderNow && typeof render === 'function') render();
    if (fit && typeof fitVisible === 'function') fitVisible(filteredAdventures());
    return snapshot();
  }

  function snapshot() {
    return Object.freeze({ active: selectedIds.size > 0, count: selectedIds.size, ids: Object.freeze([...selectedIds]) });
  }

  window.AdventureMapSelection = Object.freeze({ set, clear, snapshot });
})();
