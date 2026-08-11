(() => {
  CATEGORY.ski = { label: 'Ski resort', color: '#16a6c9' };

  const priorPopupCard = window.popupCard;
  const priorItemMeta = window.itemMeta;
  const priorItemValue = window.itemValue;
  const priorRouteStatusLabel = window.routeStatusLabel;

  window.routeStatusLabel = function(adventure) {
    if (adventure.kind === 'ski') return 'Ski resort destination · Slopes × Strava reconciled';
    return priorRouteStatusLabel(adventure);
  };

  window.itemMeta = function(adventure) {
    if (adventure.kind === 'ski') return [adventure.region, `${adventure.skiDays} recorded day${adventure.skiDays === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
    return priorItemMeta(adventure);
  };

  window.itemValue = function(adventure) {
    if (adventure.kind === 'ski') return `${adventure.skiDays} day${adventure.skiDays === 1 ? '' : 's'}`;
    return priorItemValue(adventure);
  };

  window.popupCard = function(adventure) {
    if (adventure.kind !== 'ski') return priorPopupCard(adventure);
    return `<article class="popup-card"><p class="popup-kicker">Ski resort</p><h3 class="popup-title">${escapeHtml(adventure.name)}</h3><p class="popup-meta">${escapeHtml(adventure.region || '')}</p><p class="popup-meta"><strong>${escapeHtml(adventure.skiDays)}</strong> recorded ski day${adventure.skiDays === 1 ? '' : 's'}</p><span class="popup-status">Slopes × Strava reconciled</span><p class="popup-detail"><a href="skiing.html">View ski logbook →</a></p></article>`;
  };

  window.addEventListener('load', async () => {
    try {
      const response = await fetch('data/skiing.json');
      if (!response.ok) throw new Error(`Unable to load skiing data (${response.status})`);
      const skiing = await response.json();
      const existingIds = new Set(state.adventures.map(item => item.id));
      skiing.resorts.forEach(resort => {
        const id = `ski-resort-${resort.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
        if (existingIds.has(id)) return;
        state.adventures.push({
          id,
          kind: 'ski',
          discipline: 'ski',
          name: resort.name,
          skiDays: resort.days,
          location: resort.region,
          region: resort.region,
          lat: resort.lat,
          lon: resort.lon,
          coordinatePrecision: 'resort',
          routeStatus: 'ski-resort'
        });
        existingIds.add(id);
      });
      const skiCount = document.getElementById('skiCount');
      if (skiCount) skiCount.textContent = skiing.summary.resortCount;
      render();
    } catch (error) {
      console.error(error);
    }
  });
})();