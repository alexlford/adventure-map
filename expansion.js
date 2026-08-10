CATEGORY.road = { label: 'Road race', color: '#d97706' };
CATEGORY.trail = { label: 'Trail race', color: '#b45309' };

window.addEventListener('load', async () => {
  try {
    const response = await fetch('data/discovered-races.json');
    if (!response.ok) throw new Error(`Unable to load discovered races (${response.status})`);
    const payload = await response.json();

    const existingIds = new Set(state.adventures.map((item) => item.id));
    payload.adventures.forEach((item) => {
      if (!existingIds.has(item.id)) state.adventures.push(item);
    });

    const northStar = state.adventures.find((item) => item.id === 'north-star-mountain');
    if (northStar) Object.assign(northStar, {
      date: '2020-09-12',
      stravaActivityId: '4312782595',
      stravaActivityName: 'Quartzville',
      activityType: 'Hike',
      distanceKm: 12.25,
      distanceMi: 7.61,
      elapsedSeconds: 19132,
      movingSeconds: 12935,
      elevationGainM: 938.1,
      routeStatus: 'matched-no-public-route',
      matchSource: 'Strava export + user confirmation',
      matchConfidence: 'confirmed'
    });

    document.getElementById('summitCount').textContent = state.adventures.filter((item) => item.kind === 'summit').length;
    document.getElementById('raceCount').textContent = state.adventures.filter((item) => item.kind === 'race').length;
    render();
  } catch (error) {
    console.error(error);
  }
});