CATEGORY.road = { label: 'Road race', color: '#d97706' };
CATEGORY.trail = { label: 'Trail race', color: '#b45309' };
CATEGORY['mountain-bike'] = { label: 'Mountain bike race', color: '#2563eb' };

function updateRouteCount() {
  const routeCount = document.getElementById('routeCount');
  if (!routeCount || !state.routes) return;
  routeCount.textContent = new Set(state.routes.features.flatMap(feature => feature.properties?.adventureIds || [])).size;
}

function mergeSupplementalRoutes(payloads, attempt = 0) {
  if (state.routes) {
    const existing = new Set(state.routes.features.map(feature => feature.properties?.id));
    payloads.flatMap(payload => payload.features || []).forEach(feature => {
      if (!existing.has(feature.properties?.id)) {
        state.routes.features.push(feature);
        existing.add(feature.properties?.id);
      }
    });
    updateRouteCount();
    render();
    return;
  }
  if (attempt < 40) setTimeout(() => mergeSupplementalRoutes(payloads, attempt + 1), 100);
}

window.addEventListener('load', async () => {
  try {
    const [minedRouteResponse, historicalRouteResponse] = await Promise.all([
      fetch('data/mined-routes.geojson'),
      fetch('data/historical-routes-v2.geojson')
    ]);
    if (!minedRouteResponse.ok) throw new Error(`Unable to load mined routes (${minedRouteResponse.status})`);
    if (!historicalRouteResponse.ok) throw new Error(`Unable to load historical routes (${historicalRouteResponse.status})`);
    const [minedRoutes, historicalRoutes] = await Promise.all([minedRouteResponse.json(), historicalRouteResponse.json()]);
    mergeSupplementalRoutes([minedRoutes, historicalRoutes]);
  } catch (error) { console.error(error); }
});
