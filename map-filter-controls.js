(() => {
  'use strict';

  const api = window.AdventureMap;
  const internal = window.AdventureMapRuntime?.internal;
  if (!api || !internal) return;

  function sync() {
    const current = api.state().filter || 'all';
    document.querySelectorAll('.filter-row [data-filter]').forEach(button => {
      const active = button.dataset.filter === current;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  internal.registerPresentationHook('afterRenderList', sync);
  sync();

  window.AdventureMapFilterControls = Object.freeze({ sync });
})();
