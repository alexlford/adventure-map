(() => {
  'use strict';

  const runtime = window.AdventureMapRuntime;
  const internal = runtime?.internal;
  if (!runtime || !internal) return;

  const refine = document.getElementById('refineControls');
  const refineSummary = refine?.querySelector('[data-refine-summary]');
  const mobile = window.matchMedia('(max-width:820px)');
  const initialParams = new URLSearchParams(location.search);
  const hasRefinement = () => Boolean(
    initialParams.get('q') || initialParams.get('from') || initialParams.get('through')
  );

  const layerLabels = {
    nordic: 'Nordic skiing',
    skiing: 'Alpine skiing'
  };
  Object.entries(layerLabels).forEach(([key,label]) => {
    const button = document.querySelector(`[data-filter="${key}"]`);
    if (button) button.textContent = label;
  });

  // Mapping availability must never make an archive record look secondary.
  const archiveStyle = document.createElement('style');
  archiveStyle.textContent = '.adventure-item.is-unmapped{opacity:1!important}';
  document.head.appendChild(archiveStyle);

  const archiveDateKey = record => {
    if (!record) return '0000-00-00';
    const date = String(record.date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const year = internal.recordYear(record) ?? Number(record.year);
    return Number.isFinite(year) && year > 1900 ? `${String(year).padStart(4,'0')}-00-00` : '0000-00-00';
  };

  const compareArchiveRecords = (a,b) => {
    const aDate = archiveDateKey(a);
    const bDate = archiveDateKey(b);
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    if (a?.kind === 'summit' && b?.kind === 'summit') {
      const elevationDifference = (b.elevationFt ?? 0) - (a.elevationFt ?? 0);
      if (elevationDifference) return elevationDifference;
    }
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  };

  // Preserve core row construction and event wiring, then reorder completed rows
  // into strict reverse chronology. Exact dates lead; year-only records follow
  // dated records in that year; fully undated aggregate records remain at the end.
  internal.registerPresentationHook('afterRenderList', items => {
    const list = document.getElementById('adventureList');
    if (!list || !items.length) return;
    const order = new Map(
      items.slice().sort(compareArchiveRecords).map((record,index) => [record.id,index])
    );
    Array.from(list.querySelectorAll('.adventure-item'))
      .sort((a,b) => (order.get(a.dataset.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.dataset.id) ?? Number.MAX_SAFE_INTEGER))
      .forEach(node => list.appendChild(node));
  });

  function updateRefineSummary() {
    if (!refineSummary) return;
    const current = runtime.snapshot();
    const parts = [];
    if (current.yearFrom || current.yearTo) parts.push(`${current.yearFrom || 'First'}–${current.yearTo || 'Latest'}`);
    if (current.search?.trim()) parts.push(`“${current.search.trim().slice(0,24)}${current.search.trim().length > 24 ? '…' : ''}”`);
    refineSummary.textContent = parts.length ? parts.join(' · ') : 'Years + search';
  }

  function setRefineDefault() {
    if (!refine) return;
    refine.open = !mobile.matches || hasRefinement();
  }

  setRefineDefault();
  updateRefineSummary();
  mobile.addEventListener?.('change',setRefineDefault);
  ['change','input','click'].forEach(eventName => {
    refine?.addEventListener(eventName,() => queueMicrotask(updateRefineSummary));
  });

  internal.registerPresentationHook('popupCard', record => {
    const category = runtime.layerFor(record) || 'adventures';
    const accent = internal.categoryColor(category);
    const dateLabel = record.date ? internal.formatDate(record.date) : (internal.recordYear(record) ?? record.year);
    const kicker = [internal.subtypeFor(record),dateLabel].filter(Boolean).join(' · ');
    const alias = record.currentName ? `<p class="popup-alias">Now known as ${internal.escapeHtml(record.currentName)}</p>` : '';
    const locationLabel = record.location ? `<p class="popup-location">${internal.escapeHtml(record.location)}</p>` : '';

    let headline = '';
    let headlineLabel = '';
    if (record.kind === 'summit' && Number.isFinite(record.elevationFt)) {
      headline = `${internal.formatNumber(record.elevationFt)} ft`;
      headlineLabel = 'elevation';
    } else if (record.kind === 'race' && record.officialTime) {
      headline = String(record.officialTime);
      headlineLabel = 'official time';
    } else if (record.officialDistance) {
      headline = String(record.officialDistance);
      headlineLabel = 'official distance';
    } else if (record.distance) {
      headline = String(record.distance);
      headlineLabel = 'distance';
    } else if (Number.isFinite(record.distanceMi)) {
      headline = `${record.distanceMi} mi`;
      headlineLabel = 'recorded';
    }

    const metrics = [];
    const pushMetric = value => {
      if (value && !metrics.includes(value) && value !== headline) metrics.push(value);
    };
    if (record.kind === 'race' && record.officialDistance) pushMetric(String(record.officialDistance));
    if (record.kind === 'race' && record.officialPlace) pushMetric(`Place ${record.officialPlace}`);
    if (record.kind === 'race' && record.bib) pushMetric(`Bib ${record.bib}`);
    if (Number.isFinite(record.distanceMi)) pushMetric(`${record.distanceMi} mi`);
    if (record.kind === 'race' && record.officialPace) pushMetric(`${record.officialPace} pace`);
    const showGain = record.mapCategory !== 'downhill-mtb' && record.mtbMode !== 'downhill';
    if (showGain && Number.isFinite(record.elevationGainM) && record.elevationGainM > 0) pushMetric(`${Math.round(record.elevationGainM)} m gain`);
    if (Number.isFinite(record.elapsedSeconds) && record.elapsedSeconds > 0) pushMetric(`${internal.formatDuration(record.elapsedSeconds)} elapsed`);

    const headlineHtml = headline ? `<p class="popup-headline"><strong>${internal.escapeHtml(headline)}</strong><small>${internal.escapeHtml(headlineLabel)}</small></p>` : '';
    const metricHtml = metrics.length ? `<div class="popup-metrics">${metrics.slice(0,4).map(value => `<span class="popup-metric">${internal.escapeHtml(value)}</span>`).join('')}</div>` : '';
    return `<article class="popup-card popup-card-refined" style="--popup-accent:${internal.escapeHtml(accent)}"><p class="popup-kicker">${internal.escapeHtml(kicker)}</p><h3 class="popup-title">${internal.escapeHtml(record.name)}</h3>${alias}${locationLabel}${headlineHtml}${metricHtml}<p class="popup-detail"><a href="${internal.recordHref(record)}">Open record →</a></p></article>`;
  });

  internal.registerPresentationHook('afterFocusStyles', current => {
    document.querySelectorAll('.adventure-item').forEach(item => {
      item.classList.toggle('is-focused',Boolean(current.focusId) && item.dataset.id === current.focusId);
    });
  });

  const results = document.querySelector('.results-section');
  if (results) {
    const heading = results.querySelector('.results-heading h2');
    if (heading) heading.textContent = 'Archive';
  }
})();
