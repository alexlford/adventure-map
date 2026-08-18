(() => {
  'use strict';

  const routes = window.AdventureRoutes;
  if (!routes?.compositeRouteColor) return;

  // The route key is rendered into #page by record-renderer.js after this
  // guard script loads. Observe that render instead of wrapping route-model
  // functions, so presentation state stays separate from route resolution.
  const page = document.getElementById('page');
  const syncCompositePageClass = () => {
    document.body?.classList.toggle('has-composite-routes', Boolean(document.getElementById('storyRouteKey')));
  };
  syncCompositePageClass();
  if (page) {
    const observer = new MutationObserver(syncCompositePageClass);
    observer.observe(page, { childList: true, subtree: true });
  }

  const resolveCompositeColor = routes.compositeRouteColor.bind(routes);

  routes.compositeRouteColor = (feature, context) => {
    const memberColor = resolveCompositeColor(feature, context);
    if (memberColor) return memberColor;
    if (!context?.recordId || !context?.members?.length) return null;

    const owners = feature?.properties?.adventureIds || [];
    if (!owners.includes(context.recordId)) return null;

    // Relationship expansion deliberately adds the parent Story id to each
    // component route. A parent-only summary/synthetic route must not become a
    // third visible route with the generic Adventure color. Keep it invisible
    // so the map matches the component cards and route key exactly.
    return 'rgba(0,0,0,0)';
  };
})();
