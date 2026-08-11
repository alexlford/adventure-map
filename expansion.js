CATEGORY.road = { label: 'Road race', color: '#d97706' };
CATEGORY.trail = { label: 'Trail race', color: '#b45309' };
CATEGORY['mountain-bike'] = { label: 'Mountain bike race', color: '#2563eb' };

function updateRouteCount() {
  const routeCount = document.getElementById('routeCount');
  if (!routeCount || !state.routes) return;
  routeCount.textContent = new Set(
    state.routes.features.flatMap((feature) => feature.properties?.adventureIds || [])
  ).size;
}

function mergeSupplementalRoutes(payloads, attempt = 0) {
  if (state.routes) {
    const existing = new Set(state.routes.features.map((feature) => feature.properties?.id));
    payloads.flatMap((payload) => payload.features || []).forEach((feature) => {
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
    const [discoveredResponse, minedResponse, confirmedResponse, recoveredResponse, minedRouteResponse, historicalRouteResponse] = await Promise.all([
      fetch('data/discovered-races.json'),
      fetch('data/mined-races.json'),
      fetch('data/user-confirmed-races.json'),
      fetch('data/recovered-events-2026-08.json'),
      fetch('data/mined-routes.geojson'),
      fetch('data/historical-routes-v2.geojson')
    ]);
    if (!discoveredResponse.ok) throw new Error(`Unable to load discovered races (${discoveredResponse.status})`);
    if (!minedResponse.ok) throw new Error(`Unable to load mined races (${minedResponse.status})`);
    if (!confirmedResponse.ok) throw new Error(`Unable to load confirmed races (${confirmedResponse.status})`);
    if (!recoveredResponse.ok) throw new Error(`Unable to load recovered races (${recoveredResponse.status})`);
    if (!minedRouteResponse.ok) throw new Error(`Unable to load mined routes (${minedRouteResponse.status})`);
    if (!historicalRouteResponse.ok) throw new Error(`Unable to load historical routes (${historicalRouteResponse.status})`);
    const [discovered, mined, confirmed, recovered, minedRoutes, historicalRoutes] = await Promise.all([
      discoveredResponse.json(), minedResponse.json(), confirmedResponse.json(), recoveredResponse.json(), minedRouteResponse.json(), historicalRouteResponse.json()
    ]);

    const removeIds = new Set(recovered.removeIds || []);
    state.adventures = state.adventures.filter(item => !removeIds.has(item.id));
    const existingIds = new Set(state.adventures.map((item) => item.id));
    [...(discovered.adventures || []), ...(mined.adventures || []), ...(confirmed.adventures || []), ...(recovered.adventures || [])].forEach((item) => {
      if (!existingIds.has(item.id)) {
        state.adventures.push(item);
        existingIds.add(item.id);
      }
    });
    mergeSupplementalRoutes([minedRoutes, historicalRoutes]);

    const northStar = state.adventures.find((item) => item.id === 'north-star-mountain');
    if (northStar) Object.assign(northStar, {
      date: '2020-09-12', stravaActivityId: '4312782595', stravaActivityName: 'Quartzville',
      activityType: 'Hike', distanceKm: 12.25, distanceMi: 7.61, elapsedSeconds: 19132,
      movingSeconds: 12935, elevationGainM: 938.1, routeStatus: 'matched-no-public-route',
      matchSource: 'Strava export + user confirmation', matchConfidence: 'confirmed'
    });

    document.getElementById('summitCount').textContent = state.adventures.filter((item) => item.kind === 'summit').length;
    document.getElementById('raceCount').textContent = state.adventures.filter((item) => item.kind === 'race').length;
    updateRouteCount();
    render();
  } catch (error) { console.error(error); }
});