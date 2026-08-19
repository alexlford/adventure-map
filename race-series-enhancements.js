(() => {
  'use strict';

  const A = window.AdventureSite;
  const page = document.getElementById('page');
  if (!A || !page) return;

  const fetchJson = async path => {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.json();
  };

  const currentKey = () => {
    const query = new URLSearchParams(location.search);
    const cleanMatch = location.pathname.match(/\/record\/([^/]+)\/?$/);
    return query.get('record') || query.get('id') || (cleanMatch ? decodeURIComponent(cleanMatch[1]) : '');
  };

  const clockSeconds = value => {
    const parts = String(value || '').trim().split(':').map(Number);
    if (!parts.length || parts.some(part => !Number.isFinite(part))) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  };

  const formatClock = seconds => {
    if (!Number.isFinite(seconds)) return '—';
    const rounded = Math.round(seconds);
    const h = Math.floor(rounded / 3600);
    const m = Math.floor((rounded % 3600) / 60);
    const s = rounded % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  };

  const distanceMiles = record => Number.isFinite(record.officialDistanceMi) ? record.officialDistanceMi
    : Number.isFinite(record.distanceMi) ? record.distanceMi
    : Number.isFinite(record.officialDistanceKm) ? record.officialDistanceKm / 1.609344
    : Number.isFinite(record.distanceKm) ? record.distanceKm / 1.609344
    : null;

  const distanceLabel = record => record.officialDistance || record.distance || (Number.isFinite(distanceMiles(record)) ? `${distanceMiles(record).toFixed(1)} mi` : 'Distance not recovered');

  const timeInfo = record => {
    const officialSeconds = clockSeconds(record.officialTime);
    if (Number.isFinite(officialSeconds)) return { seconds: officialSeconds, label: record.officialTime, source: 'official', sourceLabel: 'Official result' };
    const segmentSeconds = Number(record.gpsRaceSegmentElapsedSeconds);
    if (Number.isFinite(segmentSeconds) && segmentSeconds > 0) return { seconds: segmentSeconds, label: formatClock(segmentSeconds), source: 'gps', sourceLabel: 'GPS course elapsed' };
    const fallback = Number.isFinite(record.stravaElapsedSeconds) ? record.stravaElapsedSeconds : record.elapsedSeconds;
    if (Number.isFinite(fallback) && fallback > 0) return { seconds: fallback, label: formatClock(fallback), source: 'gps', sourceLabel: 'GPS elapsed fallback' };
    return { seconds: null, label: '—', source: 'none', sourceLabel: 'Result not recovered' };
  };

  const hasGpsRoute = record => Boolean(
    (record.routeFeatureIds || []).length ||
    String(record.routeStatus || '').toLowerCase().includes('gps') ||
    String(record.routeStatus || '').toLowerCase().includes('source')
  );

  const sameDistance = records => {
    const values = records.map(distanceMiles);
    return !values.some(value => !Number.isFinite(value)) && Math.max(...values) - Math.min(...values) <= 0.25;
  };

  const deltaLabel = delta => {
    if (!Number.isFinite(delta) || Math.abs(delta) < 1) return 'Even with prior appearance';
    return `${formatClock(Math.abs(delta))} ${delta < 0 ? 'faster' : 'slower'} than prior appearance`;
  };

  const chartFor = members => {
    const enriched = members.map(record => ({ record, time: timeInfo(record) }));
    const official = enriched.filter(item => item.time.source === 'official');
    const gps = enriched.filter(item => item.time.source === 'gps');
    let entries;
    let chartLabel;
    let fastestLabel;

    if (official.length >= 2 && sameDistance(official.map(item => item.record))) {
      entries = official;
      chartLabel = 'Official results';
      fastestLabel = 'Series PR';
    } else if (official.length === 0 && gps.length >= 2 && sameDistance(gps.map(item => item.record))) {
      entries = gps;
      chartLabel = 'GPS elapsed comparison';
      fastestLabel = 'Fastest GPS';
    } else return '';

    entries.sort((a, b) => (a.record.date || '').localeCompare(b.record.date || ''));
    const values = entries.map(item => item.time.seconds);
    const fastest = Math.min(...values);
    const slowest = Math.max(...values);
    const range = Math.max(1, slowest - fastest);
    const rows = entries.map((item, index) => {
      const width = 58 + 42 * ((slowest - item.time.seconds) / range);
      const isFastest = Math.abs(item.time.seconds - fastest) < 0.5;
      const previous = index ? entries[index - 1].time.seconds : null;
      return `<div class="series-chart-row${isFastest ? ' is-fastest' : ''}"><div class="series-chart-label"><strong>${A.esc(String(item.record.year || item.record.date?.slice(0, 4) || '—'))}</strong><span>${A.esc(item.time.label)}</span></div><div class="series-chart-track" aria-hidden="true"><span style="--series-bar:${width.toFixed(1)}%"></span></div><div class="series-chart-meta"><span>${A.esc(index ? deltaLabel(item.time.seconds - previous) : item.time.sourceLabel)}</span>${isFastest ? `<em>${A.esc(fastestLabel)}</em>` : ''}</div></div>`;
    }).join('');
    const caveat = chartLabel === 'Official results'
      ? 'Only organizer/timer results are compared here. Lower elapsed time is better.'
      : 'No organizer times are available for this series, so this comparison uses race-course GPS elapsed time only and does not present it as an official result.';
    return `<div class="series-performance"><div class="series-performance-head"><div><p class="eyebrow">Year-over-year</p><h3>${A.esc(chartLabel)}</h3></div><p>${A.esc(caveat)}</p></div><div class="series-chart">${rows}</div></div>`;
  };

  const cardFor = record => {
    const time = timeInfo(record);
    const year = record.year || record.date?.slice(0, 4) || '—';
    const result = time.source === 'none' ? 'Result pending' : time.label;
    return `<a class="series-year-card" href="${A.recordHref(record)}"><div class="series-year-top"><span>${A.esc(String(year))}</span><em>${hasGpsRoute(record) ? 'GPS course' : 'Location only'}</em></div><small>${A.esc(distanceLabel(record))}</small><strong>${A.esc(result)}</strong><p>${A.esc(time.sourceLabel)}</p><footer><span>${A.esc(record.name)}</span><b>Open record →</b></footer></a>`;
  };

  async function enhance() {
    const key = currentKey();
    if (!key || page.dataset.raceSeriesEnhanced === 'true') return;
    page.dataset.raceSeriesEnhanced = 'pending';
    try {
      const [recordPayload, relationshipPayload] = await Promise.all([fetchJson('data/public-records.json'), fetchJson('data/relationships.json')]);
      const records = recordPayload.records || [];
      const relationships = relationshipPayload.relationships || [];
      const record = records.find(item => item.id === key || item.slug === key);
      const relationship = record && relationships.find(rel => rel.type === 'series' && rel.adventureId === record.id && Array.isArray(rel.memberIds) && rel.memberIds.length > 1);
      if (!record || record.kind !== 'adventure' || !relationship) return;

      const byId = new Map(records.map(item => [item.id, item]));
      const members = relationship.memberIds.map(id => byId.get(id)).filter(item => item?.kind === 'race').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      if (members.length < 2) return;
      const editorial = page.querySelector('.story-record-editorial');
      if (!editorial || page.querySelector('#raceSeriesHistory')) return;

      const firstYear = members[0].year || members[0].date?.slice(0, 4);
      const lastYear = members.at(-1).year || members.at(-1).date?.slice(0, 4);
      const miles = members.map(distanceMiles).filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
      const gpsCount = members.filter(hasGpsRoute).length;
      const officialCount = members.filter(item => timeInfo(item).source === 'official').length;
      const span = firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`;
      const mileage = miles ? `${miles < 100 ? miles.toFixed(1) : Math.round(miles)} mi` : '—';

      const section = document.createElement('section');
      section.className = 'race-series-feature';
      section.id = 'raceSeriesHistory';
      section.innerHTML = `<div class="race-series-head"><div><p class="eyebrow">Recurring race series</p><h2>${A.esc(relationship.name || record.name)}</h2></div><p>${A.esc(relationship.summary || record.note || 'A multi-year race history preserved as one connected series.')}</p></div><div class="race-series-stats"><article><small>Appearances</small><strong>${members.length}</strong><span>${A.esc(span)}</span></article><article><small>Cumulative race distance</small><strong>${A.esc(mileage)}</strong><span>Organizer distance when available</span></article><article><small>Official results</small><strong>${officialCount}</strong><span>${members.length - officialCount} GPS/fallback records</span></article><article><small>Course archive</small><strong>${gpsCount}/${members.length}</strong><span>${gpsCount > 1 ? 'Routes overlay on the map below' : 'GPS routes attached when available'}</span></article></div>${chartFor(members)}<div class="series-year-grid">${members.map(cardFor).join('')}</div>${gpsCount > 1 ? `<div class="series-course-callout"><div><p class="eyebrow">Course evolution</p><h3>${gpsCount} recorded courses, one map.</h3></div><p>The course map below overlays the available personal GPS routes with a separate color for each appearance. Zoom in to compare shared sections, reroutes, start/finish changes, and event-to-event course drift.</p></div>` : ''}`;
      editorial.insertAdjacentElement('afterend', section);
      page.querySelector('.story-objective-feature.challenge-feature')?.remove();
      document.body.classList.add('story-race-series-page');
      page.dataset.raceSeriesEnhanced = 'true';
    } finally {
      if (page.dataset.raceSeriesEnhanced === 'pending') page.dataset.raceSeriesEnhanced = 'skipped';
    }
  }

  let attempts = 0;
  const waitForStory = () => {
    if (document.body.classList.contains('story-record-page') && page.querySelector('.story-record-editorial')) {
      enhance().catch(error => console.warn('Race series enhancement', error));
      return;
    }
    if (!page.querySelector('.empty') || attempts++ >= 120) return;
    setTimeout(waitForStory, 50);
  };
  waitForStory();
})();