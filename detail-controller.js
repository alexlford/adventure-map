(() => {
  const A = window.AdventureSite;
  const Modules = window.AdventureDetailModules;
  if (!A || !Modules) throw new Error('Detail controller dependencies are unavailable');

  const params = new URLSearchParams(location.search);
  const cleanMatch = location.pathname.match(/\/record\/([^/]+)\/?$/);
  const recordKey = params.get('record') || params.get('id') || (cleanMatch ? decodeURIComponent(cleanMatch[1]) : '');
  const page = document.getElementById('page');
  const provenanceLabel = p => p === 'personal-gps' ? 'Personal GPS route' : p === 'historical-course' ? 'Historical course' : p === 'privacy-withheld' ? 'Route withheld for privacy' : p === 'location-only' ? 'Location only' : 'Route';
  const groupFor = a => a.kind === 'summit' ? 'summits' : a.discipline === 'mountain-bike' ? 'mountain-biking' : a.discipline === 'nordic' ? 'nordic' : a.discipline === 'ski' || a.discipline === 'ski-objective' ? 'skiing' : a.kind === 'race' ? 'races' : 'adventures';
  const labelFor = a => a.kind === 'summit' ? 'Summit' : a.kind === 'race' ? A.raceType(a) : a.kind === 'outing' && a.discipline === 'mountain-bike' ? (a.mtbMode === 'downhill' ? 'Downhill MTB outing' : 'MTB outing') : a.kind === 'outing' && a.discipline === 'nordic' ? 'Nordic outing' : a.kind === 'event' ? A.eventType(a) : a.discipline === 'ski-objective' ? 'Ski objective' : a.discipline === 'mountain-loop' ? 'Mountain adventure' : 'Challenge / Trek';
  const dateKey = a => a.date || String(a.year || '0000');

  function relatedSection(a, relationships, byId) {
    if (a.kind === 'adventure') return '';
    const related = relationships.filter(rel => (rel.memberIds || []).includes(a.id) || rel.adventureId === a.id);
    if (!related.length) return '';
    return `<section><div class="section-title"><h2>Part of a larger story</h2><p>Related events and challenges connected across Adventures.</p></div><div class="grid">${related.map(rel => {
      const links = (rel.memberIds || []).filter(id => id !== a.id).map(id => byId.get(id)).filter(Boolean).map(record => `<a href="${A.recordHref(record)}">${A.esc(record.name)}</a>`);
      if (rel.adventureId && rel.adventureId !== a.id && byId.has(rel.adventureId)) {
        const story = byId.get(rel.adventureId);
        links.push(`<a href="${A.recordHref(story)}">${A.esc(story.name)}</a>`);
      }
      return `<article class="card"><p class="card-kicker">${A.esc((rel.years || []).join(' · '))}</p><h3>${A.esc(rel.name)}</h3><p class="card-meta">${A.esc(rel.summary || '')}</p>${links.length ? `<p class="card-meta">Related: ${links.join(' · ')}</p>` : ''}</article>`;
    }).join('')}</div></section>`;
  }

  function chronology(a, ordered, idx, isStory) {
    const prev = idx > 0 ? ordered[idx - 1] : null, next = idx < ordered.length - 1 ? ordered[idx + 1] : null;
    if (!prev && !next) return '';
    const group = A.esc(groupFor(a).replace('-', ' '));
    return `<nav class="chronology-nav" aria-label="Nearby entries">${prev ? `<a class="chronology-link" href="${A.recordHref(prev)}"><small>${isStory ? 'Previous story' : `Previous ${group} entry`}</small><strong>← ${A.esc(prev.name)}</strong></a>` : '<div></div>'}${next ? `<a class="chronology-link next" href="${A.recordHref(next)}"><small>${isStory ? 'Next story' : `Next ${group} entry`}</small><strong>${A.esc(next.name)} →</strong></a>` : ''}</nav>`;
  }

  function baseMetrics(a, isSummit, isRace, isDownhill, value) {
    return `<section class="metrics"><div class="metric"><strong>${A.esc(value || '—')}</strong><span>${isSummit ? 'elevation' : isRace ? 'result / distance' : 'headline metric'}</span></div><div class="metric"><strong>${a.distanceMi ? A.esc(a.distanceMi) + ' mi' : '—'}</strong><span>recorded distance</span></div><div class="metric"><strong>${!isDownhill && a.elevationGainM ? A.fmt.format(Math.round(a.elevationGainM)) + ' m' : '—'}</strong><span>${isDownhill ? 'pedaled gain not used' : 'recorded gain'}</span></div><div class="metric"><strong>${a.elapsedSeconds ? A.esc(A.formatDuration(a.elapsedSeconds)) : '—'}</strong><span>elapsed time</span></div></section>`;
  }

  function baseProfile(a, label, idx, orderedLength) {
    return `<section class="profile"><div class="profile-copy"><p class="eyebrow">The record</p><h2>${A.esc(a.note || 'A place, a date, and the effort behind it.')}</h2><div class="fact-list"><div class="fact"><small>Date</small><strong>${A.esc(A.formatDate(a.date) || String(a.year || '—'))}</strong></div><div class="fact"><small>Location</small><strong>${A.esc(a.location || '—')}</strong></div><div class="fact"><small>Type</small><strong>${A.esc(label)}</strong></div><div class="fact"><small>Collection</small><strong>${A.esc(groupFor(a).replace('-', ' '))}</strong></div>${a.bib ? `<div class="fact"><small>Bib</small><strong>${A.esc(a.bib)}</strong></div>` : ''}${a.officialPlace ? `<div class="fact"><small>Place</small><strong>${A.esc(a.officialPlace)}</strong></div>` : ''}${a.eventSeries ? `<div class="fact"><small>Series</small><strong>${A.esc(a.eventSeries)}</strong></div>` : ''}${a.stravaActivityId ? `<div class="fact"><small>Activity</small><strong>Strava ${A.esc(a.stravaActivityId)}</strong></div>` : ''}</div></div><aside><p class="eyebrow">Context</p><div class="card"><p class="card-kicker">Archive position</p><h3>${idx + 1} of ${orderedLength}</h3><p class="card-meta">Chronological position among ${A.esc(groupFor(a).replace('-', ' '))} records currently in Adventures.</p></div></aside></section>`;
  }

  async function renderRecordMap(a) {
    const el = document.getElementById('detailMap');
    if (!el) return;
    try {
      const [collection, recordOverride] = await Promise.all([AdventureRoutes.loadAll(), AdventureRoutes.recordProvenance(a.id)]);
      const features = (collection.features || []).filter(feature => (feature.properties?.adventureIds || []).includes(a.id));
      const hasPoint = Number.isFinite(a.lat) && Number.isFinite(a.lon);
      const routeMeta = document.getElementById('routeMeta');
      if (routeMeta) {
        const primary = features[0]?.properties;
        if (primary) routeMeta.textContent = `${provenanceLabel(primary.provenance)}${primary.note ? ` · ${primary.note}` : ''}`;
        else if (recordOverride) routeMeta.textContent = `${provenanceLabel(recordOverride.provenance)}${recordOverride.note ? ` · ${recordOverride.note}` : ''}`;
        else routeMeta.textContent = 'Location marker only; no public route geometry is attached to this record.';
      }
      if (!features.length && !hasPoint) {
        el.outerHTML = '<div class="empty">No public route geometry is available for this record yet.</div>';
        return;
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const map = L.map(el, { scrollWheelZoom: false, worldCopyJump: true, zoomControl: true });
      window.stabilizeLeafletMap?.(map, el);
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors', updateWhenIdle: false, keepBuffer: 3 }).addTo(map);
      tiles.on('load', () => map.invalidateSize({ pan: false }));
      if (features.length) {
        const geo = L.geoJSON({ type: 'FeatureCollection', features }, { style: feature => ({ weight: 4.5, opacity: feature.properties?.provenance === 'historical-course' ? .64 : .86, dashArray: feature.properties?.provenance === 'historical-course' ? '8 6' : null, lineCap: 'round', lineJoin: 'round' }) }).addTo(map);
        map.fitBounds(geo.getBounds(), { padding: [30, 30], maxZoom: 14 });
      } else {
        L.circleMarker([a.lat, a.lon], { radius: 8, weight: 2, fillOpacity: .9 }).addTo(map);
        map.setView([a.lat, a.lon], a.kind === 'summit' ? 10 : 11);
      }
      setTimeout(() => map.invalidateSize({ pan: false }), 120);
      setTimeout(() => { map.invalidateSize({ pan: false }); tiles.redraw(); }, 450);
    } catch (error) {
      console.error(error);
      el.outerHTML = '<div class="empty">Route map could not be loaded.</div>';
    }
  }

  async function loadWorldMajors() {
    const response = await fetch('data/world-majors.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Unable to load World Majors passport');
    return response.json();
  }

  async function run() {
    try {
      if (!recordKey) throw new Error('Adventure not found.');
      const [all, relationships, worldMajors] = await Promise.all([A.load(), A.loadRelationships(), loadWorldMajors()]);
      const a = all.find(record => record.slug === recordKey || record.id === recordKey);
      if (!a) throw new Error('Adventure not found.');

      const isStory = a.kind === 'adventure', isSummit = a.kind === 'summit', isRace = a.kind === 'race';
      const isDownhill = a.discipline === 'mountain-bike' && (a.mtbMode === 'downhill' || a.mapCategory === 'downhill-mtb');
      const label = labelFor(a);
      const value = isSummit ? `${A.fmt.format(a.elevationFt)}′` : a.officialTime || a.distance || (a.distanceMi ? `${a.distanceMi} mi` : '');
      const peers = all.filter(record => record.id !== a.id && groupFor(record) === groupFor(a));
      const ordered = [...peers, a].sort((x, y) => dateKey(x).localeCompare(dateKey(y)));
      const idx = ordered.findIndex(record => record.id === a.id);
      const byId = new Map(all.map(record => [record.id, record]));
      const related = relationships.filter(rel => (rel.memberIds || []).includes(a.id) || rel.adventureId === a.id);
      const mediaHtml = Modules.mediaModule(a);
      const story = isStory ? Modules.storyModule(a, all, relationships, mediaHtml) : null;
      const dossierHtml = isStory ? '' : Modules.typeDossier(a, all, related);
      const majorHtml = isRace ? Modules.worldMajorModule(a, worldMajors, mediaHtml) : '';
      const standaloneMedia = !isStory && !majorHtml ? mediaHtml : '';
      const relatedHtml = relatedSection(a, relationships, byId);
      const actions = [a.resultUrl ? `<a class="button-link" href="${A.esc(a.resultUrl)}" target="_blank" rel="noreferrer">View published result</a>` : '', `<a class="button-link secondary" href="${A.pageHref('map.html')}">Explore on map</a>`].filter(Boolean).join('');
      const chips = [label, a.date ? A.formatDate(a.date) : a.year, a.location, a.routeInfo?.provenance ? provenanceLabel(a.routeInfo.provenance) : null].filter(Boolean).map(item => `<span class="almanac-chip">${A.esc(item)}</span>`).join('');
      const heroClass = isStory ? 'hero story-record-hero' : 'hero';
      const heroEyebrow = isStory ? 'Adventures · Story' : `Adventures · ${A.esc(label)}`;
      const hero = `<section class="${heroClass}"><p class="eyebrow">${heroEyebrow}</p><h1>${A.esc(a.name)}</h1><p>${A.esc(a.currentName ? `Now known as ${a.currentName}. ` : '')}${A.esc(a.location || '')}${a.date ? ` · ${A.esc(A.formatDate(a.date))}` : ''}${a.endDate ? ` – ${A.esc(A.formatDate(a.endDate))}` : ''}</p><div class="almanac-strip">${chips}</div><div class="record-actions">${actions}</div></section>`;
      const route = `<section class="detail-route-section"><h2>${isSummit ? 'Recorded outing' : 'Course & location'}</h2><p id="routeMeta" class="card-meta">Loading route provenance…</p><div id="detailMap" class="detail-map" aria-label="Map for ${A.esc(a.name)}"></div></section>`;

      document.body.classList.toggle('story-record-page', isStory);
      document.body.classList.toggle('has-record-media', Boolean(mediaHtml));
      if (isStory && story) {
        document.body.classList.add(`story-theme-${story.theme}`);
        document.body.dataset.storyTheme = story.theme;
      }

      A.shell(groupFor(a));
      document.title = `${a.name} | Alex Ford Adventures`;
      const description = story?.description || `${label} · ${a.location || ''}${a.date ? ` · ${A.formatDate(a.date)}` : ''}`;
      A.refreshMeta(description);

      page.innerHTML = [
        hero,
        isStory ? '' : baseMetrics(a, isSummit, isRace, isDownhill, value),
        isStory ? '' : baseProfile(a, label, idx, ordered.length),
        isStory ? story?.html || '' : relatedHtml,
        dossierHtml,
        majorHtml,
        standaloneMedia,
        route,
        chronology(a, ordered, idx, isStory)
      ].join('');

      await renderRecordMap(a);
      if (A.isProduction() && /detail\.html$/.test(location.pathname)) history.replaceState(null, '', A.recordHref(a));
      A.refreshMeta(description);
    } catch (error) {
      console.error('Adventure detail controller', error);
      page.innerHTML = `<div class="empty">${A.esc(error.message)}</div>`;
    }
  }

  run();
})();
