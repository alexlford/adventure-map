(() => {
  'use strict';

  const routes = window.AdventureRoutes;
  if (!routes?.compositeRouteColor) return;

  const STORY_COMPONENT_RELATIONSHIP_TYPES = new Set(['weekend', 'multi-day']);
  const resolveCompositeContext = routes.compositeRouteContext?.bind(routes);
  const resolveCompositeColor = routes.compositeRouteColor.bind(routes);
  let useUnifiedStoryAccent = false;

  // A multi-member relationship is not automatically a multi-color Story.
  // Challenges, recurring series, and same-day grouped records are presented
  // as one themed narrative on detail pages. Weekend and multi-day Stories are
  // the component-route narratives whose route key and geometry intentionally
  // distinguish each member. Keep this detail-page policy separate from the
  // main map, which may still color focused source routes independently.
  if (resolveCompositeContext) {
    routes.compositeRouteContext = (...args) => {
      const context = resolveCompositeContext(...args);
      const hasCompositeMembers = Boolean(context?.recordId && context?.members?.length);
      const usesComponentRoutes = hasCompositeMembers && STORY_COMPONENT_RELATIONSHIP_TYPES.has(context?.relationship?.type);
      useUnifiedStoryAccent = hasCompositeMembers && !usesComponentRoutes;
      return usesComponentRoutes ? context : null;
    };
  }

  routes.compositeRouteColor = (feature, context) => {
    const isComposite = Boolean(context?.recordId && context?.members?.length);
    if (isComposite) document.getElementById('detailMap')?.classList.add('has-composite-routes');

    // For unified multi-member Stories, do not leak the source feature color
    // back into the detail route after the composite context is suppressed.
    // Returning no inline color lets the Story theme's detail-map accent own
    // the route, while ordinary single-record detail pages retain their route
    // catalog color behavior.
    if (!isComposite && useUnifiedStoryAccent) return null;

    const memberColor = resolveCompositeColor(feature, context);
    if (memberColor) return memberColor;
    if (!isComposite) return null;

    const owners = feature?.properties?.adventureIds || [];
    if (!owners.includes(context.recordId)) return null;

    // Relationship expansion deliberately adds the parent Story id to each
    // component route. A parent-only summary/synthetic route must not become a
    // third visible route with the generic Adventure color. Keep it invisible
    // so the map matches the component cards and route key exactly.
    return 'rgba(0,0,0,0)';
  };
})();
