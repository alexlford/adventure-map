(() => {
  'use strict';

  const routes = window.AdventureRoutes;
  if (!routes?.compositeRouteColor) return;

  const UNIFIED_STORY_RELATIONSHIP_TYPES = new Set(['challenge']);
  const resolveCompositeContext = routes.compositeRouteContext?.bind(routes);
  const resolveCompositeColor = routes.compositeRouteColor.bind(routes);
  let useUnifiedStoryAccent = false;

  const isDetailStoryPage = () => Boolean(document.getElementById('detailMap'));
  const unifiedStoryAccent = () => {
    const themedNode = document.body || document.documentElement;
    const style = getComputedStyle(themedNode);
    return style.getPropertyValue('--story-accent').trim()
      || style.getPropertyValue('--accent').trim()
      || null;
  };

  // Challenges are presented as one themed route only on Story detail pages.
  // The master map must retain the full composite context so focused source
  // activities keep their independent semantic route colors.
  if (resolveCompositeContext) {
    routes.compositeRouteContext = (...args) => {
      const context = resolveCompositeContext(...args);
      const hasCompositeMembers = Boolean(context?.recordId && context?.members?.length);
      useUnifiedStoryAccent = isDetailStoryPage()
        && hasCompositeMembers
        && UNIFIED_STORY_RELATIONSHIP_TYPES.has(context?.relationship?.type);
      return useUnifiedStoryAccent ? null : context;
    };
  }

  routes.compositeRouteColor = (feature, context) => {
    const isComposite = Boolean(context?.recordId && context?.members?.length);
    if (isComposite) document.getElementById('detailMap')?.classList.add('has-composite-routes');

    if (!isComposite && useUnifiedStoryAccent && isDetailStoryPage()) {
      const storyAccent = unifiedStoryAccent();
      if (storyAccent) return storyAccent;
    }

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
