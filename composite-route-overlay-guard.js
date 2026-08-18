(() => {
  'use strict';

  const routes = window.AdventureRoutes;
  if (!routes?.compositeRouteColor) return;

  // Give composite detail pages a stable presentation hook before Leaflet
  // paints route layers. This lets shared CSS preserve the per-member colors
  // that are already resolved by the composite route model.
  if (routes.compositeRouteContext && !routes.compositeRouteContext.__detailMapClassGuard) {
    const resolveCompositeContext = routes.compositeRouteContext.bind(routes);
    const guardedCompositeContext = (...args) => {
      const context = resolveCompositeContext(...args);
      document.body?.classList.toggle('has-composite-routes', Boolean(context?.members?.length));
      return context;
    };
    guardedCompositeContext.__detailMapClassGuard = true;
    routes.compositeRouteContext = guardedCompositeContext;
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
