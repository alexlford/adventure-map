(() => {
  'use strict';

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

  function updateRefineSummary() {
    if (!refineSummary || typeof state !== 'object') return;
    const parts = [];
    if (state.yearFrom || state.yearTo) parts.push(`${state.yearFrom || 'First'}–${state.yearTo || 'Latest'}`);
    if (state.search?.trim()) parts.push(`“${state.search.trim().slice(0,24)}${state.search.trim().length > 24 ? '…' : ''}”`);
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

  if (typeof popupCard === 'function') {
    popupCard = function(a) {
      const category = typeof publicLayerFor === 'function' ? publicLayerFor(a) : 'adventures';
      const accent = typeof CATEGORY === 'object' ? (CATEGORY[category]?.color || '#59636d') : '#59636d';
      const dateLabel = a.date && typeof formatDate === 'function' ? formatDate(a.date) : (typeof recordYear === 'function' ? recordYear(a) : a.year);
      const kicker = [typeof subtypeFor === 'function' ? subtypeFor(a) : '',dateLabel].filter(Boolean).join(' · ');
      const alias = a.currentName ? `<p class="popup-alias">Now known as ${escapeHtml(a.currentName)}</p>` : '';
      const location = a.location ? `<p class="popup-location">${escapeHtml(a.location)}</p>` : '';

      let headline = '';
      let headlineLabel = '';
      if (a.kind === 'summit' && Number.isFinite(a.elevationFt)) {
        headline = `${formatNumber(a.elevationFt)} ft`;
        headlineLabel = 'elevation';
      } else if (a.kind === 'race' && a.officialTime) {
        headline = String(a.officialTime);
        headlineLabel = 'official time';
      } else if (a.officialDistance) {
        headline = String(a.officialDistance);
        headlineLabel = 'official distance';
      } else if (a.distance) {
        headline = String(a.distance);
        headlineLabel = 'distance';
      } else if (Number.isFinite(a.distanceMi)) {
        headline = `${a.distanceMi} mi`;
        headlineLabel = 'recorded';
      }

      const metrics = [];
      const pushMetric = value => {
        if (value && !metrics.includes(value) && value !== headline) metrics.push(value);
      };
      if (a.kind === 'race' && a.officialDistance) pushMetric(String(a.officialDistance));
      if (a.kind === 'race' && a.officialPlace) pushMetric(`Place ${a.officialPlace}`);
      if (a.kind === 'race' && a.bib) pushMetric(`Bib ${a.bib}`);
      if (Number.isFinite(a.distanceMi)) pushMetric(`${a.distanceMi} mi`);
      if (a.kind === 'race' && a.officialPace) pushMetric(`${a.officialPace} pace`);
      const showGain = a.mapCategory !== 'downhill-mtb' && a.mtbMode !== 'downhill';
      if (showGain && Number.isFinite(a.elevationGainM) && a.elevationGainM > 0) pushMetric(`${Math.round(a.elevationGainM)} m gain`);
      if (Number.isFinite(a.elapsedSeconds) && a.elapsedSeconds > 0 && typeof formatDuration === 'function') pushMetric(`${formatDuration(a.elapsedSeconds)} elapsed`);

      const headlineHtml = headline ? `<p class="popup-headline"><strong>${escapeHtml(headline)}</strong><small>${escapeHtml(headlineLabel)}</small></p>` : '';
      const metricHtml = metrics.length ? `<div class="popup-metrics">${metrics.slice(0,4).map(value => `<span class="popup-metric">${escapeHtml(value)}</span>`).join('')}</div>` : '';
      return `<article class="popup-card popup-card-refined" style="--popup-accent:${escapeHtml(accent)}"><p class="popup-kicker">${escapeHtml(kicker)}</p><h3 class="popup-title">${escapeHtml(a.name)}</h3>${alias}${location}${headlineHtml}${metricHtml}<p class="popup-detail"><a href="${recordHref(a)}">Open record →</a></p></article>`;
    };
  }

  if (typeof applyFocusStyles === 'function') {
    const priorApplyFocusStyles = applyFocusStyles;
    applyFocusStyles = function(...args) {
      const result = priorApplyFocusStyles(...args);
      document.querySelectorAll('.adventure-item').forEach(item => {
        item.classList.toggle('is-focused',Boolean(state.focusId) && item.dataset.id === state.focusId);
      });
      return result;
    };
  }

  const results = document.querySelector('.results-section');
  if (results) {
    const heading = results.querySelector('.results-heading h2');
    if (heading) heading.textContent = 'Archive';
  }
})();
