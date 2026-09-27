(() => {
  'use strict';

  const api = window.AdventureMap;
  const internal = window.AdventureMapRuntime?.internal;
  if (!api || !internal) return;

  const registry = window.AdventureSiteRoutes;
  const timelineRoute = registry?.routes?.find(route => route.key === 'timeline');
  const productionHost = registry?.origin ? new URL(registry.origin).hostname : 'adventures.alexlford.com';
  const timelineBase = () => location.hostname === productionHost ? (timelineRoute?.path || '/timeline') : 'timeline.html';

  function ensureStyle() {
    if (document.getElementById('mapTimelineBridgeStyle')) return;
    const style = document.createElement('style');
    style.id = 'mapTimelineBridgeStyle';
    style.textContent = `
      .map-timeline-link{margin-left:auto;font-size:.7rem;font-weight:800;color:var(--accent,#173f32);text-decoration:none;white-space:nowrap}
      .map-timeline-link[aria-disabled="true"]{pointer-events:none;opacity:.42}
      .results-heading{gap:8px;flex-wrap:wrap}
    `;
    document.head.appendChild(style);
  }

  function hrefFor(items) {
    const state = api.state();
    const selectionActive = Boolean(window.AdventureMapSelection?.snapshot()?.active);
    const unfiltered = !selectionActive && state.filter === 'all' && !state.search?.trim() && !state.yearFrom && !state.yearTo && items.length === api.records().length;
    if (unfiltered) return timelineBase();
    const url = new URL(timelineBase(), location.href);
    if (items.length) url.searchParams.set('selection', items.map(record => record.id).join(','));
    url.searchParams.set('source', 'map');
    return `${url.pathname}${url.search}`;
  }

  function update(items = api.filteredRecords()) {
    const heading = document.querySelector('.results-heading');
    if (!heading) return;
    ensureStyle();
    let link = heading.querySelector('.map-timeline-link');
    if (!link) {
      link = document.createElement('a');
      link.className = 'map-timeline-link';
      heading.appendChild(link);
    }
    link.href = hrefFor(items);
    link.textContent = items.length ? `Timeline (${items.length}) →` : 'Timeline';
    link.setAttribute('aria-disabled', items.length ? 'false' : 'true');
  }

  internal.registerPresentationHook('afterRenderList', items => update(items));
  api.ready().then(() => update()).catch(() => {});
})();
