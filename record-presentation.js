(() => {
  'use strict';

  const A = window.AdventureSite;
  if (!A) return;

  const provenanceLabel = value => value === 'personal-gps' ? 'Personal GPS route'
    : value === 'historical-course' ? 'Historical course'
    : value === 'privacy-withheld' ? 'Route withheld for privacy'
    : value === 'location-only' ? 'Location only'
    : 'Route';

  const groupFor = record => record.kind === 'summit' ? 'summits'
    : record.discipline === 'mountain-bike' ? 'mountain-biking'
    : record.discipline === 'nordic' ? 'nordic'
    : record.discipline === 'ski' || record.discipline === 'ski-objective' ? 'skiing'
    : record.kind === 'race' ? 'races'
    : 'adventures';

  const labelFor = record => record.kind === 'summit' ? 'Summit'
    : record.kind === 'race' ? A.raceType(record)
    : record.kind === 'outing' && record.discipline === 'mountain-bike' ? (record.mtbMode === 'downhill' ? 'Downhill MTB outing' : 'MTB outing')
    : record.kind === 'outing' && record.discipline === 'nordic' ? 'Nordic outing'
    : record.kind === 'event' ? A.eventType(record)
    : record.discipline === 'ski-objective' ? 'Ski objective'
    : record.discipline === 'mountain-loop' ? 'Mountain adventure'
    : 'Challenge / Trek';

  const dateKey = record => record.date || String(record.year || '0000');
  const placementText = (place, size) => place ? (size ? `${A.fmt.format(place)} of ${A.fmt.format(size)}` : A.fmt.format(place)) : '';
  const feet = metres => Number.isFinite(metres) ? Math.round(metres * 3.28084) : null;
  const inclusiveDays = (start, end) => {
    if (!start || !end) return 1;
    const a = new Date(`${start}T12:00:00Z`);
    const b = new Date(`${end}T12:00:00Z`);
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  };
  const uniq = items => [...new Map(items.filter(Boolean).map(item => [item.id, item])).values()];
  const mediaFor = record => (Array.isArray(record.media) ? record.media : []).filter(item => item && (!item.type || item.type === 'image') && item.src && item.alt);
  const companionsFor = record => (Array.isArray(record.companions) ? record.companions : []).filter(item => item && item.name);
  const captionFor = item => [item.caption, item.credit ? `Photo: ${item.credit}` : ''].filter(Boolean).join(' · ');

  const typeForStory = record => A.adventureType(record);
  const storyThemeFor = record => record.discipline === 'ski-objective' ? 'ski'
    : record.discipline === 'mountain-loop' ? 'mountain'
    : record.discipline === 'trek' ? 'traverse'
    : 'challenge';
  const storySpanFor = record => record.endDate ? `${A.formatDate(record.date)} – ${A.formatDate(record.endDate)}`
    : record.date ? A.formatDate(record.date)
    : String(record.year || '—');
  const storyHeadlineFor = record => record.discipline === 'ski-objective' && record.runs ? `${record.runs} runs`
    : record.distance ? record.distance
    : Number.isFinite(record.distanceMi) ? `${record.distanceMi} mi`
    : typeForStory(record);
  const storySecondaryFor = record => record.discipline === 'ski-objective' && Number.isFinite(record.descentM) ? `${A.fmt.format(Math.round(record.descentM))} m descent`
    : Number.isFinite(record.elevationGainM) ? `${A.fmt.format(Math.round(record.elevationGainM))} m gain`
    : record.region || record.location || 'Adventure';

  const fmtValue = (value, suffix = '') => Number.isFinite(value) ? `${A.fmt.format(Math.round(value * 100) / 100)}${suffix}` : '—';
  const dayType = record => record.mtbMode === 'downhill' ? 'Downhill MTB' : record.mtbMode === 'mixed' ? 'MTB + Downhill MTB' : 'MTB';

  window.AdventureRecordPresentation = Object.freeze({
    provenanceLabel,
    groupFor,
    labelFor,
    dateKey,
    placementText,
    feet,
    inclusiveDays,
    uniq,
    mediaFor,
    companionsFor,
    captionFor,
    typeForStory,
    storyThemeFor,
    storySpanFor,
    storyHeadlineFor,
    storySecondaryFor,
    fmtValue,
    dayType
  });
})();
