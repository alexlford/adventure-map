(() => {
  'use strict';

  const runtime = window.AdventureMapRuntime;
  const internal = runtime?.internal;
  if (!runtime || !internal) return;

  const officialDistanceLabel = record => record.officialDistance || (Number.isFinite(record.officialDistanceMi) ? `${record.officialDistanceMi} mi` : record.distance || '');
  const gpsLine = record => {
    if (!record.stravaActivityId && !Number.isFinite(record.stravaDistanceMi) && !Number.isFinite(record.elapsedSeconds)) return '';
    const miles = Number.isFinite(record.stravaDistanceMi) ? record.stravaDistanceMi : record.distanceMi;
    const seconds = Number.isFinite(record.stravaElapsedSeconds) ? record.stravaElapsedSeconds : record.elapsedSeconds;
    const parts = [];
    if (Number.isFinite(miles)) parts.push(`${miles} mi GPS`);
    if (Number.isFinite(seconds)) parts.push(`${internal.formatDuration(seconds)} recorded`);
    return parts.length ? `<p class="popup-meta">Strava: ${internal.escapeHtml(parts.join(' · '))}</p>` : '';
  };

  internal.registerPresentationHook('popupCard', (record, current) => {
    if (record.kind !== 'race') return current;
    const officialDistance = officialDistanceLabel(record);
    const placement = record.officialPlace
      ? ` · overall ${internal.escapeHtml(record.officialPlace)}`
      : record.racePlace
        ? ` · race place ${internal.escapeHtml(record.racePlace)}`
        : record.ageGroupPlace
          ? ` · age group ${internal.escapeHtml(record.ageGroupPlace)}`
          : '';
    const officialResult = record.officialTime
      ? `<p class="popup-meta"><strong>Official: ${internal.escapeHtml(record.officialTime)}</strong>${officialDistance ? ` · ${internal.escapeHtml(officialDistance)}` : ''}${placement}</p>`
      : `<p class="popup-meta"><strong>Official distance: ${internal.escapeHtml(officialDistance || record.distance || 'race distance')}</strong></p>`;
    const award = record.award ? `<p class="popup-meta">🏅 ${internal.escapeHtml(record.award)}</p>` : '';
    const date = record.date ? `<p class="popup-meta">${internal.escapeHtml(internal.formatDate(record.date))}</p>` : '';
    return `<article class="popup-card"><p class="popup-kicker">${internal.escapeHtml(internal.subtypeFor(record))}</p><h3 class="popup-title">${internal.escapeHtml(record.name)}</h3><p class="popup-meta">${internal.escapeHtml(record.location)}</p>${date}${officialResult}${award}${gpsLine(record)}<p class="popup-detail"><a href="${internal.recordHref(record)}">Open record →</a></p></article>`;
  });

  internal.registerPresentationHook('itemValue', (record, current) => {
    if (record.kind !== 'race') return current;
    return record.officialTime || officialDistanceLabel(record) || record.distance || '';
  });
})();
