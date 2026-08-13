(() => {
  'use strict';

  const runtime = window.AdventureMapRuntime;
  const internal = runtime?.internal;
  if (!runtime || !internal) return;

  const skiColor = window.AdventureMapTheme?.colors?.skiing || window.AdventureMapTheme?.colors?.mixed;
  internal.setCategoryDefinitions({
    ski: { label: 'Ski resort', color: skiColor },
    skiing: { color: skiColor }
  });

  internal.registerPresentationHook('itemMeta', (record, current) => {
    if (record.kind !== 'ski') return current;
    return [record.region, `${record.skiDays} recorded day${record.skiDays === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  });

  internal.registerPresentationHook('itemValue', (record, current) => {
    if (record.kind !== 'ski') return current;
    return `${record.skiDays} day${record.skiDays === 1 ? '' : 's'}`;
  });

  internal.registerPresentationHook('popupCard', (record, current) => {
    if (record.kind !== 'ski') return current;
    const href = location.hostname === 'adventures.alexlford.com' ? '/skiing' : 'skiing.html';
    return `<article class="popup-card"><p class="popup-kicker">Ski resort</p><h3 class="popup-title">${internal.escapeHtml(record.name)}</h3><p class="popup-meta">${internal.escapeHtml(record.region || '')}</p><p class="popup-meta"><strong>${internal.escapeHtml(record.skiDays)}</strong> recorded ski day${record.skiDays === 1 ? '' : 's'}</p><p class="popup-detail"><a href="${href}">View ski logbook →</a></p></article>`;
  });

  const resortId = name => `ski-resort-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const resortRecord = resort => ({
    id: resortId(resort.name),
    kind: 'ski',
    discipline: 'ski',
    name: resort.name,
    skiDays: resort.days,
    location: resort.region,
    region: resort.region,
    lat: resort.lat,
    lon: resort.lon,
    coordinatePrecision: 'resort'
  });

  window.addEventListener('load', async () => {
    try {
      await runtime.ready();
      const response = await fetch('data/skiing.json');
      if (!response.ok) throw new Error(`Unable to load skiing data (${response.status})`);
      const skiing = await response.json();
      const before = runtime.snapshot();
      const shouldRefit = !before.focusId && !before.search && before.filter === 'skiing';
      internal.mergeRecords((skiing.resorts || []).map(resortRecord));
      const skiCount = document.getElementById('skiCount');
      if (skiCount) skiCount.textContent = skiing.summary.resortCount;
      if (shouldRefit) runtime.fit(runtime.filteredRecords());
    } catch (error) {
      console.error(error);
    }
  });
})();
