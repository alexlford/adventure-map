CATEGORY.road = { label: 'Road race', color: '#d97706' };
CATEGORY.trail = { label: 'Trail race', color: '#b45309' };

window.addEventListener('load', async () => {
  try {
    const [discoveredResponse, confirmedResponse] = await Promise.all([
      fetch('data/discovered-races.json'),
      fetch('data/user-confirmed-races.json')
    ]);
    if (!discoveredResponse.ok) throw new Error(`Unable to load discovered races (${discoveredResponse.status})`);
    if (!confirmedResponse.ok) throw new Error(`Unable to load confirmed races (${confirmedResponse.status})`);
    const [discovered, confirmed] = await Promise.all([discoveredResponse.json(), confirmedResponse.json()]);

    const existingIds = new Set(state.adventures.map((item) => item.id));
    [...(discovered.adventures || []), ...(confirmed.adventures || [])].forEach((item) => {
      if (!existingIds.has(item.id)) {
        state.adventures.push(item);
        existingIds.add(item.id);
      }
    });

    const northStar = state.adventures.find((item) => item.id === 'north-star-mountain');
    if (northStar) Object.assign(northStar, {
      date: '2020-09-12', stravaActivityId: '4312782595', stravaActivityName: 'Quartzville',
      activityType: 'Hike', distanceKm: 12.25, distanceMi: 7.61, elapsedSeconds: 19132,
      movingSeconds: 12935, elevationGainM: 938.1, routeStatus: 'matched-no-public-route',
      matchSource: 'Strava export + user confirmation', matchConfidence: 'confirmed'
    });

    document.getElementById('summitCount').textContent = state.adventures.filter((item) => item.kind === 'summit').length;
    document.getElementById('raceCount').textContent = state.adventures.filter((item) => item.kind === 'race').length;
    render();
  } catch (error) { console.error(error); }
});