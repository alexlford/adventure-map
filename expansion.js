CATEGORY.road = { label: 'Road race', color: '#d97706' };
CATEGORY.trail = { label: 'Trail race', color: '#b45309' };

function updateRouteCount() {
  const routeCount = document.getElementById('routeCount');
  if (!routeCount || !state.routes) return;
  routeCount.textContent = new Set(
    state.routes.features.flatMap((feature) => feature.properties?.adventureIds || [])
  ).size;
}

function mergeSupplementalRoutes(payload, attempt = 0) {
  if (state.routes) {
    const existing = new Set(state.routes.features.map((feature) => feature.properties?.id));
    (payload.features || []).forEach((feature) => {
      if (!existing.has(feature.properties?.id)) state.routes.features.push(feature);
    });
    updateRouteCount();
    render();
    return;
  }
  if (attempt < 40) setTimeout(() => mergeSupplementalRoutes(payload, attempt + 1), 100);
}

window.addEventListener('load', async () => {
  try {
    const [discoveredResponse, minedResponse, confirmedResponse, routeResponse] = await Promise.all([
      fetch('data/discovered-races.json'),
      fetch('data/mined-races.json'),
      fetch('data/user-confirmed-races.json'),
      fetch('data/mined-routes.geojson')
    ]);
    if (!discoveredResponse.ok) throw new Error(`Unable to load discovered races (${discoveredResponse.status})`);
    if (!minedResponse.ok) throw new Error(`Unable to load mined races (${minedResponse.status})`);
    if (!confirmedResponse.ok) throw new Error(`Unable to load confirmed races (${confirmedResponse.status})`);
    if (!routeResponse.ok) throw new Error(`Unable to load mined routes (${routeResponse.status})`);
    const [discovered, mined, confirmed, minedRoutes] = await Promise.all([
      discoveredResponse.json(), minedResponse.json(), confirmedResponse.json(), routeResponse.json()
    ]);

    const existingIds = new Set(state.adventures.map((item) => item.id));
    [...(discovered.adventures || []), ...(mined.adventures || []), ...(confirmed.adventures || [])].forEach((item) => {
      if (!existingIds.has(item.id)) {
        state.adventures.push(item);
        existingIds.add(item.id);
      }
    });
    mergeSupplementalRoutes(minedRoutes);

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