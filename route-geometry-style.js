(() => {
  'use strict';

  if (typeof baseRouteStyle !== 'function') return;
  const priorBaseRouteStyle = baseRouteStyle;

  baseRouteStyle = (feature, category) => {
    const style = priorBaseRouteStyle(feature, category);
    if (feature?.properties?.geometryEvidence !== 'inferred') return style;
    return {
      ...style,
      dashArray: '7 6',
      lineCap: 'round',
      lineJoin: 'round',
    };
  };
})();
