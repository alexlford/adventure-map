(() => {
  'use strict';

  const A = window.AdventureSite;
  const page = document.getElementById('page');
  if (!A || !page) return;

  const query = new URLSearchParams(location.search);
  const cleanMatch = location.pathname.match(/\/record\/([^/]+)\/?$/);
  const key = query.get('record') || query.get('id') || (cleanMatch ? decodeURIComponent(cleanMatch[1]) : '');

  const P = window.AdventureRecordPresentation;
  if (!P) return;
  const {
    provenanceLabel, groupFor, labelFor, dateKey, placementText, feet, inclusiveDays, uniq,
    mediaFor, companionsFor, captionFor, typeForStory, storyThemeFor, storySpanFor,
    storyHeadlineFor, storySecondaryFor, fmtValue, dayType
  } = P;


  const sportSection = (title, intro, cards, callout = '') => `<section class="sport-detail"><div class="sport-detail-head"><h2>${A.esc(title)}</h2><p>${A.esc(intro)}</p></div><div class="sport-detail-grid">${cards.join('')}</div>${callout}</section>`;
  const sportCard = (k, v, p = '', wide = false) => `<article class="sport-panel${wide ? ' wide' : ''}"><small>${A.esc(k)}</small><strong>${A.esc(v || '—')}</strong>${p ? `<p>${A.esc(p)}</p>` : ''}</article>`;
  const compositeColorFor = (id, context) => AdventureRoutes.compositeRouteColorForId(id, context);
  const compositeColorAttrs = (id, context) => {
    const color = compositeColorFor(id, context);
    return color ? { className: ' has-route-color', style: ` style="--route-color:${A.esc(color)}"` } : { className: '', style: '' };
  };
  function storyRouteKey(context) {
    if (!context?.members?.length) return '';
    const items = context.members.map((member, index) => {
      const record = member.record;
      const detail = record ? [A.recordType(record), record.date ? A.formatDate(record.date) : ''].filter(Boolean).join(' · ') : `Route ${index + 1}`;
      return `<div class="story-route-key-item" style="--route-color:${A.esc(member.color)}"><span class="story-route-key-line" aria-hidden="true"></span><span><strong>${A.esc(record?.name || `Route ${index + 1}`)}</strong><small>${A.esc(detail)}</small></span></div>`;
    }).join('');
    return `<div id="storyRouteKey" class="story-route-key" aria-label="Route colors"><span class="story-route-key-label">Route key</span><div class="story-route-key-items">${items}</div></div>`;
  }

  function raceModule(record, rels) {
    const series = rels.map(rel => rel.name).join(' · ') || record.eventSeries || 'Standalone race';
    const officialDistance = record.officialDistance || (Number.isFinite(record.officialDistanceMi) ? `${record.officialDistanceMi} mi` : record.distance || '—');
    const place = record.officialPlace ? `Overall place ${record.officialPlace}` : record.racePlace ? `Race place ${record.racePlace}` : record.ageGroupPlace ? `Age-group place ${record.ageGroupPlace}` : '';
    const result = record.officialTime || record.result || 'Official time not recovered';
    const cards = [
      sportCard('Official result', result, place || 'Organizer/timer result when available'),
      sportCard('Official distance', officialDistance, 'Race distance from the organizer/event record'),
      sportCard('Race family', series, 'Series, challenge, or recurring-event context')
    ];
    if (record.participationMode || record.completionDate) {
      const mode = record.participationMode === 'virtual' ? 'Virtual completion' : record.participationMode === 'in-person' ? 'In-person race' : record.participationMode || 'Recorded completion';
      const timing = record.completionDate && record.completionDate !== record.date
        ? `Organizer event: ${A.formatDate(record.date)} · completed: ${A.formatDate(record.completionDate)}`
        : record.date ? `Event date: ${A.formatDate(record.date)}` : 'Participation evidence retained in the race archive.';
      cards.push(sportCard('Participation', mode, timing));
    }
    const gpsDistance = Number.isFinite(record.stravaDistanceMi) ? `${record.stravaDistanceMi} mi` : record.distanceMi ? `${record.distanceMi} mi` : '';
    const gpsSeconds = Number.isFinite(record.stravaElapsedSeconds) ? record.stravaElapsedSeconds : record.elapsedSeconds;
    if (gpsDistance || Number.isFinite(gpsSeconds)) cards.push(sportCard('GPS recording', [gpsDistance, Number.isFinite(gpsSeconds) ? A.formatDuration(gpsSeconds) : ''].filter(Boolean).join(' · '), 'Strava/watch recording retained for route and GPS context; it does not override the official race result.'));
    if (record.award) cards.push(sportCard('Award', record.award, record.ageGroupPlace ? `Age-group place: ${record.ageGroupPlace}` : 'Race-day award'));
    if (record.bib) cards.push(sportCard('Bib', String(record.bib), 'Race-day identifier'));
    if (record.resultUrl) cards.push(sportCard('Published record', 'Results available', 'A public result source is linked above.'));
    else if (record.resultSource) cards.push(sportCard('Result source', record.resultSource, 'Official or organizer-linked source used for the race record.'));
    const archiveCopy = record.discipline === 'trail' ? 'Filed with trail races.'
      : record.discipline === 'nordic' ? 'Filed with Nordic racing.'
      : record.discipline === 'mountain-bike' ? 'Filed with mountain-bike racing.'
      : 'Filed with road races, including marathons and relays.';
    return sportSection('Race dossier', 'Official race records take precedence over GPS measurements. Strava is retained separately for course geometry, route context, and fallback timing when an individual official result cannot be recovered.', cards, `<div class="detail-callout"><strong>Race archive</strong><p>${archiveCopy}</p></div>`);
  }

  function summitModule(record, all) {
    const elevation = Number.isFinite(record.elevationFt) ? `${A.fmt.format(record.elevationFt)}′` : '—';
    const sameDay = all.filter(item => item.id !== record.id && item.kind === 'summit' && item.date && item.date === record.date);
    const companion = sameDay.length ? sameDay.map(item => item.name).join(' · ') : 'Single-summit record';
    return sportSection('Summit dossier', 'Elevation, outing context, and other peaks connected to the same day.', [
      sportCard('Elevation', elevation, 'Recorded summit elevation'),
      sportCard('Outing distance', record.distanceMi ? `${record.distanceMi} mi` : '—', 'GPS outing distance when available'),
      sportCard('Same-day summits', companion, sameDay.length ? 'Multiple summits share this outing.' : 'No additional summit is currently linked to this date.', true)
    ]);
  }

  function outingModule(record, all) {
    const isMtb = record.discipline === 'mountain-bike';
    const peers = all.filter(item => item.id !== record.id && item.kind === 'outing' && item.discipline === record.discipline && item.location === record.location);
    const style = isMtb ? dayType(record) : 'Nordic';
    const climb = isMtb && record.mtbMode === 'downhill' ? 'Not used for downhill' : record.elevationGainM ? fmtValue(record.elevationGainM, ' m') : '—';
    return sportSection(`${style} day`, 'A day-level record: the outing itself is classified independently from the location so future visits can be different.', [
      sportCard('Day type', style, isMtb ? 'Classification belongs to this specific ride, not the resort.' : 'Recreational Nordic outing unless separately identified as a race or named event.'),
      sportCard('Distance', record.distanceMi ? `${record.distanceMi} mi` : '—', 'Recorded GPS distance'),
      sportCard('Elevation gain', climb, isMtb && record.mtbMode === 'downhill' ? 'Lift ascent is intentionally excluded from pedaled-climbing interpretation.' : 'Recorded ascent when meaningful.'),
      sportCard('Other outings here', peers.length ? String(peers.length) : '0', peers.length ? peers.slice(0, 5).map(item => A.formatDate(item.date)).join(' · ') : 'No other day-level outings at this exact location yet.', true)
    ]);
  }

  function sportModule(record, all, rels) {
    if (record.kind === 'race') return raceModule(record, rels);
    if (record.kind === 'summit') return summitModule(record, all);
    if (record.kind === 'outing' && (record.discipline === 'mountain-bike' || record.discipline === 'nordic')) return outingModule(record, all);
    return '';
  }

  function officialRaceResult(record) {
    const hasOfficialResult = record.kind === 'race' && Boolean(record.officialTime || record.officialGunTime || record.officialPlace || record.divisionPlace || record.genderPlace || record.officialPace || record.award || record.ageGroupPlace || (record.officialSplits || []).length);
    if (!hasOfficialResult) return '';
    const facts = [
      ['Official time', record.officialTime],
      ['Official distance', record.officialDistance],
      ['Pace', record.officialPace],
      ['Overall place', placementText(record.officialPlace, record.officialFieldSize)],
      ['Division', record.divisionPlace ? `${record.division ? `${record.division} · ` : ''}${placementText(record.divisionPlace, record.divisionFieldSize)}` : record.division],
      ['Gender place', placementText(record.genderPlace, record.genderFieldSize)],
      ['Gun time', record.officialGunTime],
      ['Bib', record.bib],
      ['Award', record.award],
      ['Age-group place', placementText(record.ageGroupPlace, record.ageGroupFieldSize)],
      ['Participation', record.participationMode],
      ['Completion date', record.completionDate ? A.formatDate(record.completionDate) : null]
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
    const splits = (record.officialSplits || []).filter(split => split && split.time);
    return `<section class="race-result-section"><div class="race-result-head"><div><p class="eyebrow">Published result</p><h2>Official race result</h2></div><p>${A.esc(record.resultSource || 'Verified organizer or timing result.')} Official result fields take precedence over GPS timing; the activity recording remains route evidence.</p></div><div class="result-grid">${facts.map(([k, v]) => `<div class="result-stat"><small>${A.esc(k)}</small><strong>${A.esc(String(v))}</strong></div>`).join('')}</div>${splits.length ? `<p class="split-title">Published splits</p><div class="split-grid">${splits.map(split => `<div class="split"><small>${A.esc(split.label || 'Split')}</small><strong>${A.esc(String(split.time))}</strong></div>`).join('')}</div>` : ''}</section>`;
  }

  function relatedSection(record, rels, byId) {
    if (!rels.length) return '';
    return `<section><div class="section-title"><h2>Part of a larger story</h2><p>Related events and challenges connected across Adventures.</p></div><div class="grid">${rels.map(rel => {
      const links = (rel.memberIds || []).filter(id => id !== record.id).map(id => byId.get(id)).filter(Boolean).map(item => `<a href="${A.recordHref(item)}">${A.esc(item.name)}</a>`);
      if (rel.adventureId && rel.adventureId !== record.id && byId.has(rel.adventureId)) {
        const relatedAdventure = byId.get(rel.adventureId);
        links.push(`<a href="${A.recordHref(relatedAdventure)}">${A.esc(relatedAdventure.name)}</a>`);
      }
      return `<article class="card"><p class="card-kicker">${A.esc((rel.years || []).join(' · '))}</p><h3>${A.esc(rel.name)}</h3><p class="card-meta">${A.esc(rel.summary || '')}</p>${links.length ? `<p class="card-meta">Related: ${links.join(' · ')}</p>` : ''}</article>`;
    }).join('')}</div></section>`;
  }

  function mediaSection(record) {
    const media = mediaFor(record);
    if (!media.length) return '';
    const hero = media[0];
    const rest = media.slice(1);
    const figure = (item, cls = '') => `<figure class="record-photo ${cls}"><img src="${A.esc(item.src)}" alt="${A.esc(item.alt)}" loading="lazy" decoding="async">${captionFor(item) ? `<figcaption>${A.esc(captionFor(item))}</figcaption>` : ''}</figure>`;
    return `<section class="record-media" id="recordMedia"><div class="record-media-head"><div><p class="eyebrow">Photo essay</p><h2>${A.esc(record.mediaTitle || 'Scenes from the day')}</h2></div>${record.mediaIntro ? `<p>${A.esc(record.mediaIntro)}</p>` : ''}</div><div class="record-photo-essay">${figure(hero, 'record-photo-hero')}${rest.length ? `<div class="record-photo-grid">${rest.map((item, index) => figure(item, index === 0 && rest.length % 2 === 1 ? 'record-photo-wide' : '')).join('')}</div>` : ''}</div></section>`;
  }

  function genericStoryConnections(connected, compositeContext = null) {
    const connectedHtml = connected.length ? connected.map(item => {
      const attrs = compositeColorAttrs(item.id, compositeContext);
      return `<a class="story-linked-record${attrs.className}"${attrs.style} href="${A.recordHref(item)}"><small>${A.esc(A.recordType(item))}</small><strong>${A.esc(item.name)}</strong><span>${A.esc(item.date ? A.formatDate(item.date) : (item.year || ''))}</span></a>`;
    }).join('')
      : '<div class="story-linked-empty"><strong>Standalone chapter</strong><p>No separate race or summit records are required to tell this story.</p></div>';
    return `<section class="story-record-connections"><div><p class="eyebrow">Connected records</p><h3>${connected.length ? `${connected.length} records inside this chapter` : 'One story, one record'}</h3><p>${connected.length ? 'Open the individual races, summits, or outings that make up the larger story.' : 'This chapter stands on its own, with the route and verified activity context carrying the record.'}</p></div><div class="story-linked-grid">${connectedHtml}</div></section>`;
  }

  const storyStatGrid = stats => `<div class="story-objective-stats">${stats.filter(Boolean).map(([k, v]) => `<article><small>${A.esc(k)}</small><strong>${A.esc(v)}</strong></article>`).join('')}</div>`;

  function mountainLoopFeature(record, summits) {
    if (record.discipline !== 'mountain-loop' || !summits.length) return '';
    const gainFt = feet(record.elevationGainM);
    const over14 = summits.filter(summit => Number(summit.elevationFt) >= 14000).length;
    const stats = [
      Number.isFinite(record.distanceMi) ? ['Loop distance', `${record.distanceMi} mi`] : null,
      gainFt ? ['Recorded gain', `${A.fmt.format(gainFt)} ft`] : null,
      Number.isFinite(record.elapsedSeconds) ? ['Elapsed', A.formatDuration(record.elapsedSeconds)] : null,
      ['Summits ≥14,000 ft', String(over14)]
    ];
    const chain = summits.map((summit, index) => `<a class="mountain-loop-summit" href="${A.recordHref(summit)}"><span class="mountain-loop-index">${String(index + 1).padStart(2, '0')}</span><span class="mountain-loop-node" aria-hidden="true"></span><small>Summit</small><strong>${A.esc(summit.name)}</strong><em>${Number.isFinite(summit.elevationFt) ? `${A.fmt.format(summit.elevationFt)}′` : 'Elevation not recorded'}</em></a>`).join('');
    return `<section class="mountain-loop-feature"><div class="mountain-loop-head"><div><p class="eyebrow">Objective anatomy</p><h3>${summits.length} summits. One loop.</h3></div><p>The summit sequence attached to this Adventure is shown as a single connected objective. Each peak remains independently browsable in the Summit archive.</p></div><div class="mountain-loop-stats">${stats.filter(Boolean).map(([k, v]) => `<article><small>${A.esc(k)}</small><strong>${A.esc(v)}</strong></article>`).join('')}</div><div class="mountain-loop-chain" aria-label="Linked summit sequence">${chain}</div></section>`;
  }

  function traverseFeature(record) {
    if (record.discipline !== 'trek') return '';
    const days = inclusiveDays(record.date, record.endDate);
    const gainFt = feet(record.elevationGainM);
    const stats = [
      ['Days', String(days)],
      Number.isFinite(record.distanceMi) ? ['Recorded distance', `${record.distanceMi} mi`] : null,
      gainFt ? ['Recorded gain', `${A.fmt.format(gainFt)} ft`] : null,
      record.region ? ['Range / region', record.region] : null
    ];
    return `<section class="story-objective-feature traverse-feature"><div class="story-objective-head"><div><p class="eyebrow">Traverse anatomy</p><h3>${days} ${days === 1 ? 'day' : 'days'}. One traverse.</h3></div><p>This chapter emphasizes the documented span and GPS scale of the outing, with the route below carrying the geographic story.</p></div>${storyStatGrid(stats)}</section>`;
  }

  function skiFeature(record) {
    if (record.discipline !== 'ski-objective') return '';
    const descentFt = feet(record.descentM);
    const stats = [
      Number.isFinite(record.runs) ? ['Recorded runs', String(record.runs)] : null,
      Number.isFinite(record.distanceMi) ? ['Recorded distance', `${record.distanceMi} mi`] : null,
      descentFt ? ['Recorded descent', `${A.fmt.format(descentFt)} ft`] : null,
      record.location ? ['Mountain', record.location] : null
    ];
    return `<section class="story-objective-feature ski-feature"><div class="story-objective-head"><div><p class="eyebrow">Ski objective</p><h3>${Number.isFinite(record.runs) ? `${record.runs} runs. ` : ''}One mountain chapter.</h3></div><p>Runs, distance, and recorded descent define this objective; ordinary resort days remain in the Skiing logbook instead.</p></div>${storyStatGrid(stats)}</section>`;
  }

  function challengeFeature(record, components, compositeContext = null) {
    if (record.discipline !== 'challenge' || components.length < 2) return '';
    const ordered = [...components].sort((x, y) => (x.date || '').localeCompare(y.date || ''));
    const days = inclusiveDays(record.date, record.endDate);
    const cards = ordered.map((item, index) => { const attrs = compositeColorAttrs(item.id, compositeContext); return `<a class="story-component${attrs.className}"${attrs.style} href="${A.recordHref(item)}"><span>${String(index + 1).padStart(2, '0')}</span><small>${A.esc(A.recordType(item))}${item.date ? ` · ${A.esc(A.formatDate(item.date))}` : ''}</small><strong>${A.esc(item.name)}</strong><em>${A.esc(item.officialTime || item.distance || (Number.isFinite(item.distanceMi) ? `${item.distanceMi} mi` : 'Open record'))}</em></a>`; }).join('');
    const stats = [
      ['Components', String(ordered.length)],
      ['Days', String(days)],
      Number.isFinite(record.distanceMi) ? ['Combined distance', `${record.distanceMi} mi`] : null,
      record.region ? ['Region', record.region] : null
    ];
    return `<section class="story-objective-feature challenge-feature"><div class="story-objective-head"><div><p class="eyebrow">Chapter anatomy</p><h3>${ordered.length} components. One story.</h3></div><p>The individual races or events stay independently browsable while this Story preserves the larger challenge or weekend they formed together.</p></div>${storyStatGrid(stats)}<div class="story-component-chain">${cards}</div></section>`;
  }

  function storyModules(record, all, relationships, compositeContext = null) {
    const stories = all.filter(item => item.kind === 'adventure').sort((x, y) => (x.date || '').localeCompare(y.date || ''));
    const chapter = Math.max(1, stories.findIndex(item => item.id === record.id) + 1);
    const rels = relationships.filter(rel => rel.adventureId === record.id || (rel.memberIds || []).includes(record.id));
    const byId = new Map(all.map(item => [item.id, item]));
    const relatedFromRelationships = uniq(rels.flatMap(rel => (rel.memberIds || []).map(id => byId.get(id))).filter(Boolean));
    const relatedSummits = (record.linkedSummits || []).map(id => byId.get(id)).filter(Boolean);
    const genericConnected = relatedFromRelationships.filter(item => item.id !== record.id && !relatedSummits.some(summit => summit.id === item.id));
    const allConnected = uniq([...genericConnected, ...relatedSummits]).filter(item => item.id !== record.id);
    const mountain = mountainLoopFeature(record, relatedSummits);
    const traverse = traverseFeature(record);
    const ski = skiFeature(record);
    const challenge = challengeFeature(record, genericConnected, compositeContext);
    let connections = '';
    if (mountain) connections = `${mountain}${genericConnected.length ? genericStoryConnections(genericConnected, compositeContext) : ''}`;
    else if (challenge) connections = challenge;
    else if (traverse) connections = `${traverse}${allConnected.length ? genericStoryConnections(allConnected, compositeContext) : ''}`;
    else if (ski) connections = `${ski}${allConnected.length ? genericStoryConnections(allConnected, compositeContext) : ''}`;
    else connections = genericStoryConnections(allConnected, compositeContext);

    const companions = companionsFor(record);
    const companionHtml = companions.length ? `<article class="story-companion-fact"><small>With</small><strong>${companions.map(companion => A.esc(companion.name)).join(' · ')}</strong><span>${companions.map(companion => A.esc(companion.relationship || 'Companion')).join(' · ')}</span></article>` : '';
    const editorial = `<section class="story-record-editorial"><div class="story-record-folio"><span>Story ${String(chapter).padStart(2, '0')}</span><span>${A.esc(typeForStory(record))}</span><span>${A.esc(record.region || '')}</span></div><div class="story-record-deck"><p class="eyebrow">The chapter</p><h2>${A.esc(record.note || 'A day that earned its own chapter in Adventures.')}</h2></div><div class="story-record-at-a-glance${companions.length ? ' has-companions' : ''}"><article><small>When</small><strong>${A.esc(storySpanFor(record))}</strong></article><article><small>Where</small><strong>${A.esc(record.location || '—')}</strong></article><article><small>Scale</small><strong>${A.esc(storyHeadlineFor(record))}</strong><span>${A.esc(storySecondaryFor(record))}</span></article>${companionHtml}</div></section>`;
    return `${editorial}${mediaSection(record)}${connections}`;
  }

  const availableMajorAsset = (record, kind) => kind === 'result' ? Boolean(record.officialTime || record.elapsedSeconds || record.resultUrl)
    : kind === 'course' ? Boolean(record.routeStatus === 'gps' || (record.routeFeatureIds || []).length)
    : false;
  const hasPhotos = record => mediaFor(record).length > 0;
  const hasStory = record => Boolean(record.story || record.storyBody);
  const paceSeconds = value => { const match = String(value || '').match(/(\d+):(\d+)/); return match ? Number(match[1]) * 60 + Number(match[2]) : null; };
  const clockSeconds = value => { const parts = String(value || '').split(':').map(Number); return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : null; };
  const paceLabel = seconds => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}/mi`;
  const clockLabel = seconds => { const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.round(seconds % 60); return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };
  const shortSplitLabel = label => label === 'Finish' ? 'F' : label === 'Half' ? 'H' : String(label || '').replace('K', 'k');

  function raceArc(record) {
    const splits = (record.officialSplits || []).map(split => ({ ...split, paceSeconds: paceSeconds(split.pace) })).filter(split => Number.isFinite(split.paceSeconds));
    if (splits.length < 2) return '';
    const width = 760, height = 250, left = 52, right = 18, top = 24, bottom = 44, plotW = width - left - right, plotH = height - top - bottom;
    const values = splits.map(split => split.paceSeconds);
    const min = Math.floor((Math.min(...values) - 20) / 30) * 30;
    const max = Math.ceil((Math.max(...values) + 20) / 30) * 30;
    const range = Math.max(60, max - min);
    const xy = splits.map((split, index) => ({ split, x: left + (plotW * index / (splits.length - 1)), y: top + ((split.paceSeconds - min) / range) * plotH }));
    const ticks = [];
    for (let tick = Math.ceil(min / 60) * 60; tick <= max; tick += 60) ticks.push(tick);
    const grid = ticks.map(tick => { const y = top + ((tick - min) / range) * plotH; return `<line class="major-arc-grid" x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}"></line><text class="major-arc-label" x="${left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${A.esc(paceLabel(tick).replace('/mi', ''))}</text>`; }).join('');
    const line = xy.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const points = xy.map(point => `<circle class="major-arc-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5"></circle><text class="major-arc-label" x="${point.x.toFixed(1)}" y="${height - 15}" text-anchor="middle">${A.esc(shortSplitLabel(point.split.label))}</text>`).join('');
    const fastest = splits.reduce((a, b) => a.paceSeconds <= b.paceSeconds ? a : b);
    const slowest = splits.reduce((a, b) => a.paceSeconds >= b.paceSeconds ? a : b);
    const half = record.officialSplits?.find(split => String(split.label).toLowerCase() === 'half');
    const finish = clockSeconds(record.officialTime);
    const halfSeconds = clockSeconds(half?.time);
    const secondHalf = Number.isFinite(finish) && Number.isFinite(halfSeconds) ? finish - halfSeconds : null;
    const diff = Number.isFinite(secondHalf) ? secondHalf - halfSeconds : null;
    return `<div class="major-race-arc"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Official segment pace progression from the marathon timing splits. Lower on the chart means a slower pace.">${grid}<polyline class="major-arc-line" points="${line}"></polyline>${points}</svg><div class="major-arc-note"><div><small>First half</small><strong>${A.esc(half?.time || '—')}</strong></div><div><small>Second half</small><strong>${A.esc(Number.isFinite(secondHalf) ? clockLabel(secondHalf) : '—')}${Number.isFinite(diff) ? ` · +${A.esc(clockLabel(diff))}` : ''}</strong></div><div><small>Race arc</small><strong>${A.esc(fastest.label)} ${A.esc(fastest.pace)} → toughest ${A.esc(slowest.label)} ${A.esc(slowest.pace)}</strong></div></div></div>`;
  }

  function splitRows(record) {
    return (record.officialSplits || []).map(split => `<tr><th scope="row">${A.esc(split.label)}</th><td>${A.esc(split.time || '—')}</td><td>${A.esc(split.segmentTime || '—')}</td><td>${A.esc(split.pace || '—')}</td></tr>`).join('');
  }

  function majorModule(record, majorsData) {
    if (!majorsData) return '';
    const major = (majorsData.majors || []).find(item => item.recordId === record.id);
    if (!major || major.status !== 'completed') return '';
    const completed = (majorsData.majors || []).filter(item => item.status === 'completed');
    const order = completed.findIndex(item => item.id === major.id) + 1;
    const result = record.officialTime || A.formatDuration(record.elapsedSeconds) || 'Recorded';
    const course = availableMajorAsset(record, 'course');
    const splits = record.officialSplits || [];
    const photos = hasPhotos(record);
    const story = hasStory(record);
    const placement = [record.officialPlace ? `Overall ${A.fmt.format(record.officialPlace)}` : '', record.genderPlace ? `Gender ${A.fmt.format(record.genderPlace)}` : '', record.ageGroupPlace ? `Age group ${A.fmt.format(record.ageGroupPlace)}` : ''].filter(Boolean);
    const resultLink = record.resultUrl ? `<a class="major-source-link" href="${A.esc(record.resultUrl)}" target="_blank" rel="noopener">Open official result ↗</a>` : '';
    const splitSection = splits.length ? `<section class="major-race-dossier"><div class="major-dossier-head"><div><p class="eyebrow">Official race dossier</p><h3>The race arc</h3></div><p>The chart and table use the official timing checkpoints from this result record. The chart visualizes normalized segment pace; the table preserves the exact splits.</p></div>${raceArc(record)}<div class="major-split-table-wrap"><table class="major-split-table"><thead><tr><th>Checkpoint</th><th>Cumulative</th><th>Segment</th><th>Segment pace</th></tr></thead><tbody>${splitRows(record)}</tbody></table></div></section>` : '';
    const officialDistance = record.officialDistanceMi ? `${record.officialDistanceMi} mi` : record.officialDistance || 'Marathon';
    const gpsDistance = Number.isFinite(record.stravaDistanceMi) ? `${record.stravaDistanceMi} mi` : Number.isFinite(record.distanceMi) ? `${record.distanceMi} mi` : '';
    const courseBridge = course ? `<section class="major-course-bridge"><div><p class="eyebrow">Course</p><h3>The official race, preserved through the personal GPS track.</h3><p>The organizer result owns the race distance and finish time; the watch recording owns the route geometry shown below.</p></div><div class="major-course-stats"><span>Official ${A.esc(officialDistance)}</span>${gpsDistance ? `<span>GPS ${A.esc(gpsDistance)}</span>` : ''}<span>Personal route ✓</span></div></section>` : '';
    const assetLine = `${availableMajorAsset(record, 'result') ? '✓ Result' : '＋ Result'} · ${splits.length ? '✓ Splits' : '＋ Splits'} · ${course ? '✓ Course' : '＋ Course'} · ${photos ? '✓ Photos' : '＋ Photos'} · ${story ? '✓ Story' : '＋ Story'}`;
    const storyTitle = record.storyTitle || 'The first earned Major.';
    const storyCopy = story ? (record.storyBody || record.story) : `${major.name} is the first completed race in this living World Marathon Majors passport. The verified result, split progression, and personal course are already preserved here. Photography and a personal race-day narrative can be added later without changing the evidence underneath.`;
    const media = mediaSection(record);
    return `<section class="sport-detail major-passport-detail" id="majorPassportDetail"><div class="sport-detail-head"><div><p class="eyebrow">World Marathon Majors passport</p><h2>Major ${String(Math.max(order, 1)).padStart(2, '0')} · ${A.esc(major.name.replace(' Marathon', ''))}</h2></div><p>An earned Major becomes a permanent passport entry: verified result, course, race-day evidence and the story behind it.</p></div><div class="major-result-hero"><div><small>Official finish</small><strong>${A.esc(result)}</strong><span>${A.esc(A.formatDate(record.date))} · Bib ${A.esc(record.bib || '—')}</span></div><div class="major-result-places">${placement.map(item => `<span>${A.esc(item)}</span>`).join('')}</div>${resultLink}</div><div class="sport-detail-grid major-passport-grid"><article class="sport-panel"><small>Major completed</small><strong>✓ ${A.esc(major.name.replace(' Marathon', ''))}</strong><p>${A.esc(record.location || major.city)} · ${A.esc(record.division ? `Division ${record.division}` : 'Completed')}</p></article><article class="sport-panel"><small>Course</small><strong>${course ? '✓ Personal GPS' : 'Not yet attached'}</strong><p>${course ? 'The recorded race route remains the personal GPS layer for this entry.' : 'Course geometry can be added when verified.'}</p></article><article class="sport-panel"><small>Passport assets</small><strong>${A.esc(assetLine)}</strong><p>Only verified or genuinely attached assets are marked complete.</p></article></div>${splitSection}${courseBridge}${media}<section class="major-story-slot"><div><p class="eyebrow">Race chapter</p><h3>${A.esc(storyTitle)}</h3><p>${A.esc(storyCopy)}</p></div><aside><small>Collection</small><strong>${A.esc(assetLine).replaceAll(' · ', '<br>')}</strong></aside></section><div class="detail-callout"><strong>Follow the full Majors journey</strong><p><a href="${A.pageHref('races.html')}#world-majors">Open the World Marathon Majors passport →</a></p></div></section>`;
  }

  function heroSection(ctx) {
    const { record, label } = ctx;
    const actions = [
      record.resultUrl ? `<a class="button-link" href="${A.esc(record.resultUrl)}" target="_blank" rel="noreferrer">View published result</a>` : '',
      `<a class="button-link secondary" href="${A.pageHref('map.html')}">Explore on map</a>`
    ].filter(Boolean).join('');
    const chips = [label, record.date ? A.formatDate(record.date) : record.year, record.location, record.participationMode ? `${record.participationMode} participation` : null, record.routeInfo?.provenance ? provenanceLabel(record.routeInfo.provenance) : null]
      .filter(Boolean).map(value => `<span class="almanac-chip">${A.esc(value)}</span>`).join('');
    const storyClass = record.kind === 'adventure' ? ' story-record-hero' : '';
    return `<section class="hero${storyClass}"><p class="eyebrow">Adventures · ${record.kind === 'adventure' ? 'Story' : A.esc(label)}</p><h1>${A.esc(record.name)}</h1><p>${A.esc(record.currentName ? `Now known as ${record.currentName}. ` : '')}${A.esc(record.location || '')}${record.date ? ` · ${A.esc(A.formatDate(record.date))}` : ''}${record.endDate ? ` – ${A.esc(A.formatDate(record.endDate))}` : ''}</p><div class="almanac-strip">${chips}</div><div class="record-actions">${actions}</div></section>`;
  }

  function metricsSection(ctx) {
    const { record, isSummit, isRace, isDownhill, headlineValue } = ctx;
    if (record.kind === 'adventure') return '';
    return `<section class="metrics"><div class="metric"><strong>${A.esc(headlineValue || '—')}</strong><span>${isSummit ? 'elevation' : isRace ? 'result / distance' : 'headline metric'}</span></div><div class="metric"><strong>${record.distanceMi ? `${A.esc(record.distanceMi)} mi` : '—'}</strong><span>recorded distance</span></div><div class="metric"><strong>${!isDownhill && record.elevationGainM ? `${A.fmt.format(Math.round(record.elevationGainM))} m` : '—'}</strong><span>${isDownhill ? 'pedaled gain not used' : 'recorded gain'}</span></div><div class="metric"><strong>${record.elapsedSeconds ? A.esc(A.formatDuration(record.elapsedSeconds)) : '—'}</strong><span>elapsed time</span></div></section>`;
  }

  function profileSection(ctx) {
    const { record, label, index, ordered } = ctx;
    if (record.kind === 'adventure') return '';
    const groupLabel = groupFor(record).replaceAll('-', ' ');
    return `<section class="profile"><div class="profile-copy"><p class="eyebrow">The record</p><h2>${A.esc(record.note || 'A place, a date, and the effort behind it.')}</h2><div class="fact-list"><div class="fact"><small>Date</small><strong>${A.esc(A.formatDate(record.date) || String(record.year || '—'))}</strong></div><div class="fact"><small>Location</small><strong>${A.esc(record.location || '—')}</strong></div><div class="fact"><small>Type</small><strong>${A.esc(label)}</strong></div><div class="fact"><small>Collection</small><strong>${A.esc(groupLabel)}</strong></div>${record.bib ? `<div class="fact"><small>Bib</small><strong>${A.esc(record.bib)}</strong></div>` : ''}${record.officialPlace ? `<div class="fact"><small>Place</small><strong>${A.esc(record.officialPlace)}</strong></div>` : ''}${record.eventSeries ? `<div class="fact"><small>Series</small><strong>${A.esc(record.eventSeries)}</strong></div>` : ''}${record.stravaActivityId ? `<div class="fact"><small>Activity</small><strong>Strava ${A.esc(record.stravaActivityId)}</strong></div>` : ''}</div></div><aside><p class="eyebrow">Context</p><div class="card"><p class="card-kicker">Archive position</p><h3>${index + 1} of ${ordered.length}</h3><p class="card-meta">Chronological position among ${A.esc(groupLabel)} records currently in Adventures.</p></div></aside></section>`;
  }

  function routeSection(ctx) {
    const { record, isSummit, compositeContext } = ctx;
    return `<section class="detail-route-section"><h2>${isSummit ? 'Recorded outing' : 'Course & location'}</h2><p id="routeMeta" class="card-meta">Loading route provenance…</p>${storyRouteKey(compositeContext)}<div id="detailMap" class="detail-map" aria-label="Map for ${A.esc(record.name)}"></div></section>`;
  }

  function chronologySection(ctx) {
    const { record, prev, next } = ctx;
    if (!prev && !next) return '';
    const isStory = record.kind === 'adventure';
    const groupLabel = groupFor(record).replaceAll('-', ' ');
    const prevLabel = isStory ? 'Previous story' : `Previous ${groupLabel} entry`;
    const nextLabel = isStory ? 'Next story' : `Next ${groupLabel} entry`;
    return `<nav class="chronology-nav" aria-label="Nearby entries">${prev ? `<a class="chronology-link" href="${A.recordHref(prev)}"><small>${A.esc(prevLabel)}</small><strong>← ${A.esc(prev.name)}</strong></a>` : '<div></div>'}${next ? `<a class="chronology-link next" href="${A.recordHref(next)}"><small>${A.esc(nextLabel)}</small><strong>${A.esc(next.name)} →</strong></a>` : ''}</nav>`;
  }

  function compose(ctx) {
    const { record, all, relationships, related, byId, majorsData } = ctx;
    const story = record.kind === 'adventure';
    const major = majorModule(record, majorsData);
    const genericMedia = !story && !major ? mediaSection(record) : '';
    return [
      heroSection(ctx),
      metricsSection(ctx),
      story ? storyModules(record, all, relationships, ctx.compositeContext) : profileSection(ctx),
      story ? '' : officialRaceResult(record),
      story ? '' : relatedSection(record, related, byId),
      story ? '' : sportModule(record, all, related),
      story ? '' : major,
      genericMedia,
      routeSection(ctx),
      chronologySection(ctx)
    ].join('');
  }

  async function loadMajorsData(record) {
    if (record.kind !== 'race') return null;
    try {
      const response = await fetch('data/world-majors.json');
      if (!response.ok) throw new Error('Unable to load World Majors passport');
      return await response.json();
    } catch (error) {
      console.warn('World Majors detail metadata unavailable', error);
      return null;
    }
  }

  let activeCompositeRouteContext = null;
  async function renderRecordMap(record) {
    const compositeContext = activeCompositeRouteContext;
    const el = document.getElementById('detailMap');
    if (!el) return;
    try {
      const [payloads, recordOverride] = await Promise.all([AdventureRoutes.loadAll(), AdventureRoutes.recordProvenance(record.id)]);
      const features = payloads.flatMap(payload => payload.features || []).filter(feature => (feature.properties?.adventureIds || []).includes(record.id));
      const hasPoint = Number.isFinite(record.lat) && Number.isFinite(record.lon);
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
        const geo = L.geoJSON({ type: 'FeatureCollection', features }, { style: feature => { const color = AdventureRoutes.compositeRouteColor(feature, compositeContext); return { ...(color ? { color } : {}), weight: 4.5, opacity: feature.properties?.provenance === 'historical-course' ? .64 : .86, dashArray: feature.properties?.provenance === 'historical-course' ? '8 6' : null, lineCap: 'round', lineJoin: 'round' }; } }).addTo(map);
        map.fitBounds(geo.getBounds(), { padding: [30, 30], maxZoom: 14 });
      } else {
        L.circleMarker([record.lat, record.lon], { radius: 8, weight: 2, fillOpacity: .9 }).addTo(map);
        map.setView([record.lat, record.lon], record.kind === 'summit' ? 10 : 11);
      }
      setTimeout(() => map.invalidateSize({ pan: false }), 120);
      setTimeout(() => { map.invalidateSize({ pan: false }); tiles.redraw(); }, 450);
    } catch (error) {
      console.error(error);
      const current = document.getElementById('detailMap');
      if (current) current.outerHTML = '<div class="empty">Route map could not be loaded.</div>';
    }
  }

  async function run() {
    if (!key) {
      page.innerHTML = '<div class="empty">Adventure not found.</div>';
      return;
    }
    try {
      const [all, relationships] = await Promise.all([A.load(), A.loadRelationships()]);
      const record = all.find(item => item.id === key || item.slug === key);
      if (!record) throw new Error('Adventure not found.');
      const majorsData = await loadMajorsData(record);
      A.shell(groupFor(record));

      const related = relationships.filter(rel => (rel.memberIds || []).includes(record.id) || rel.adventureId === record.id);
      const byId = new Map(all.map(item => [item.id, item]));
      const peers = all.filter(item => item.id !== record.id && groupFor(item) === groupFor(record)).sort((x, y) => dateKey(x).localeCompare(dateKey(y)));
      const ordered = [...peers, record].sort((x, y) => dateKey(x).localeCompare(dateKey(y)));
      const index = ordered.findIndex(item => item.id === record.id);
      const prev = index > 0 ? ordered[index - 1] : null;
      const next = index < ordered.length - 1 ? ordered[index + 1] : null;
      const label = labelFor(record);
      const isSummit = record.kind === 'summit';
      const isRace = record.kind === 'race';
      const isDownhill = record.discipline === 'mountain-bike' && (record.mtbMode === 'downhill' || record.mapCategory === 'downhill-mtb');
      const headlineValue = isSummit ? (Number.isFinite(record.elevationFt) ? `${A.fmt.format(record.elevationFt)}′` : '—')
        : record.officialTime || record.distance || (record.distanceMi ? `${record.distanceMi} mi` : '');
      const compositeContext = AdventureRoutes.compositeRouteContext(record.id, relationships, all);
      const ctx = { record, all, relationships, related, byId, ordered, index, prev, next, label, isSummit, isRace, isDownhill, headlineValue, majorsData, compositeContext };

      document.body.classList.remove('story-record-page', 'story-theme-ski', 'story-theme-mountain', 'story-theme-traverse', 'story-theme-challenge', 'has-record-media');
      delete document.body.dataset.storyTheme;
      if (record.kind === 'adventure') {
        const theme = storyThemeFor(record);
        document.body.classList.add('story-record-page', `story-theme-${theme}`);
        document.body.dataset.storyTheme = theme;
      }
      if (mediaFor(record).length) document.body.classList.add('has-record-media');

      document.title = `${record.name} | Alex Ford Adventures`;
      const description = `${record.kind === 'adventure' ? typeForStory(record) : label} · ${record.location || 'Alex Ford Adventures'}${record.date ? ` · ${A.formatDate(record.date)}` : ''}`;
      page.innerHTML = compose(ctx);
      A.refreshMeta(description);

      activeCompositeRouteContext = compositeContext;
      await renderRecordMap(record);
      if (A.isProduction() && /detail\.html$/.test(location.pathname)) {
        history.replaceState(null, '', A.recordHref(record));
        A.refreshMeta(description);
      }
    } catch (error) {
      console.error('Record renderer', error);
      page.innerHTML = `<div class="empty">${A.esc(error.message)}</div>`;
    }
  }

  run();
})();
