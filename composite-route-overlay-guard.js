(() => {
  'use strict';

  const routes = window.AdventureRoutes;
  if (!routes?.compositeRouteColor) return;

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
