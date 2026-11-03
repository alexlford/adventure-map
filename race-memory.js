(() => {
  'use strict';

  const A = window.AdventureSite;
  const page = document.getElementById('page');
  if (!A || !page) return;

  const MEMORY_SOURCES = [
    'data/race-memories.json',
    'data/race-memories-archive.json',
    'data/race-memories-turkey-trots.json',
  ];
  const DIMENSION_SOURCE = 'data/image-dimensions.json';
  // Photos narrower than this are low-resolution stand-ins; show them near their
  // true size instead of stretching them across the frame.
  const LOW_RES_WIDTH = 480;
  const PHOTO_MANIFEST_SOURCE = 'data/event-photo-manifest.json';
  let imageDimensions = {};

  const fetchJson = async path => {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.json();
  };

  const loadMemories = async () => {
    const payloads = await Promise.all(MEMORY_SOURCES.map(async path => {
      try {
        return await fetchJson(path);
      } catch (error) {
        console.warn(`Race memory metadata unavailable: ${path}`, error);
        return null;
      }
    }));

    return payloads.reduce((records, payload) => {
      Object.assign(records, payload?.records || {});
      return records;
    }, {});
  };

  const loadImageDimensions = async () => {
    const dimensions = {};
    try {
      const payload = await fetchJson(PHOTO_MANIFEST_SOURCE);
      for (const photo of payload?.photos || []) {
        if (photo?.path && photo?.pixelWidth > 0 && photo?.pixelHeight > 0) {
          dimensions[photo.path] = { width: photo.pixelWidth, height: photo.pixelHeight };
        }
      }
    } catch (error) {
      console.warn('Event photo dimension metadata unavailable', error);
    }
    try {
      const payload = await fetchJson(DIMENSION_SOURCE);
      Object.assign(dimensions, payload?.images && typeof payload.images === 'object' ? payload.images : {});
    } catch (error) {
      console.warn('Image dimension metadata unavailable', error);
    }
    return dimensions;
  };

  const imageKey = src => {
    const clean = String(src || '').trim().split(/[?#]/, 1)[0];
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) {
      try { return new URL(clean).pathname.replace(/^\/+/, ''); }
      catch { return clean; }
    }
    return clean.replace(/^\.\//, '').replace(/^\/+/, '');
  };
  const imageAttrs = (photo, priority = false) => {
    const size = imageDimensions[imageKey(photo.src)];
    const dimensions = size?.width && size?.height ? ` width="${size.width}" height="${size.height}"` : '';
    return `${dimensions} loading="${priority ? 'eager' : 'lazy'}" decoding="async"${priority ? ' fetchpriority="high"' : ''}`;
  };

  const currentKey = () => {
    const query = new URLSearchParams(location.search);
    const cleanMatch = location.pathname.match(/\/record\/([^/]+)\/?$/);
    return query.get('record') || query.get('id') || (cleanMatch ? decodeURIComponent(cleanMatch[1]) : '');
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function waitForLegacyDetail() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const hero = page.querySelector('.hero');
      const route = page.querySelector('.detail-route-section');
      const map = route?.querySelector('.detail-map');
      if (hero && route && (!map || map.classList.contains('leaflet-container') || map.classList.contains('empty'))) return;
      await sleep(50);
    }
  }

  const officialDistance = record => {
    if (record.officialDistance) return record.officialDistance;
    if (Number.isFinite(record.officialDistanceMi)) return `${Number(record.officialDistanceMi.toFixed(1))} mi`;
    return record.distance || '—';
  };

  const finishTime = record => {
    const value = String(record.officialTime || record.result || '—').replace(/^0(?=\d:)/, '');
    return value.replace(/\.\d+$/, '');
  };

  function marathonDetails(record) {
    const half=(record.officialSplits||[]).find(split=>split.label==='Half');
    const secondHalf=half&&Number.isFinite(record.elapsedSeconds)?record.elapsedSeconds-half.elapsedSeconds:null;
    const halfClock=Number.isFinite(secondHalf)?`${Math.floor(secondHalf/3600)}:${String(Math.floor(secondHalf/60)%60).padStart(2,'0')}:${String(secondHalf%60).padStart(2,'0')}`:null;
    const facts = [
      record.officialPace ? ['Average pace', record.officialPace] : null,
      record.bib ? ['Bib', record.bib] : null,
      half ? ['First half',half.time.replace(/^0/,'')] : null,
      halfClock ? ['Second half',halfClock] : null,
      record.award ? ['Award', record.award] : null,
      record.officialPlace ? ['Overall place', String(record.officialPlace)] : null,
      record.ageGroupPlace ? ['Age-group place', String(record.ageGroupPlace)] : null
    ].filter(Boolean);
    const splits = (record.officialSplits || []).filter(s => s.time);
    const showClock=splits.some(split=>split.timeOfDay);
    if (!facts.length && !splits.length) return '';
    return `<details class="marathon-details"><summary>Race details${splits.length ? ' & splits' : ''}</summary><dl>${facts.map(([k,v]) => `<div><dt>${A.esc(k)}</dt><dd>${A.esc(v)}</dd></div>`).join('')}</dl>${splits.length ? `<div class="marathon-splits"><table><thead><tr><th>Checkpoint</th><th>Time</th><th>Pace / mile</th>${showClock?'<th>Local time</th>':''}</tr></thead><tbody>${splits.map(s => `<tr><th scope="row">${A.esc(s.label)}</th><td>${A.esc(s.time.replace(/\.\d+$/, ''))}</td><td>${A.esc((s.pace || '').replace('/mi', ''))}</td>${showClock?`<td>${A.esc(s.timeOfDay||'—')}</td>`:''}</tr>`).join('')}</tbody></table></div>${record.id==='new-york-city-marathon-2026'?'<p>All 34 timing checkpoints are transcribed from the NYRR app. Metric checkpoints use exact 5K distances; local times retain the app’s minute precision (America/New_York).</p>':''}` : ''}</details>`;
  }

  function stravaDetails(record) {
    const splits=record.stravaSplits||[];
    if(!splits.length)return '';
    const duration=seconds=>Number.isFinite(seconds)?A.formatDuration(seconds):'—';
    return `<details class="marathon-details"><summary>Strava activity & mile splits</summary><p>Watch metrics from the supplied Strava screenshots. These paces describe the watch’s measured miles and remain separate from official race timing.</p><dl><div><dt>Watch distance</dt><dd>${A.esc(record.stravaDistanceMi)} mi</dd></div><div><dt>Moving time</dt><dd>${A.esc(duration(record.stravaMovingSeconds))}</dd></div><div><dt>Elapsed time</dt><dd>${A.esc(duration(record.stravaElapsedSeconds))}</dd></div><div><dt>Moving pace</dt><dd>${A.esc(record.stravaPace||'—')}</dd></div></dl><div class="marathon-splits"><table><thead><tr><th>Watch segment</th><th>Pace / mile</th><th>Net elevation (ft)</th></tr></thead><tbody>${splits.map(split=>`<tr><th scope="row">${A.esc(split.label)}</th><td>${A.esc(split.pace)}</td><td>${A.esc(split.elevationChangeFt)}</td></tr>`).join('')}</tbody></table></div></details>`;
  }

  const photoFigure = (photo, className = '') => {
    const aspect = String(photo.aspect || photo.layout || '').toLowerCase();
    const layoutClass = aspect === '4:3' || aspect === 'four-three' ? ' race-memory-photo-four-three' : '';
    const priority = className.includes('hero');
    const size = imageDimensions[imageKey(photo.src)];
    const lowRes = size?.width > 0 && size.width < LOW_RES_WIDTH;
    const lowResClass = lowRes ? ' race-memory-photo-lowres' : '';
    const lowResStyle = lowRes ? ` style="--photo-natural-width:${size.width}px"` : '';
    return `<figure class="race-memory-photo ${className}${layoutClass}${lowResClass}"${lowResStyle}><img src="${A.esc(photo.src)}" alt="${A.esc(photo.alt || '')}"${imageAttrs(photo, priority)}><figcaption>${photo.caption ? `${A.esc(photo.caption)} · ` : ''}<a href="${A.esc(photo.src)}" target="_blank" rel="noopener">Open full photo ↗</a></figcaption></figure>`;
  };

  const fallbackPhotoSrc = img => {
    const src = String(img.getAttribute('src') || '');
    return /\.webp$/i.test(src) ? src.replace(/\.webp$/i, '.svg') : '';
  };

  const settlePhoto = img => {
    const figure = img.closest('.race-memory-photo');
    const applyLayout = () => {
      if (img.naturalHeight > img.naturalWidth * 1.15) figure?.classList.add('race-memory-photo-portrait');
      const isVector = /\.svg(?:[?#]|$)/i.test(img.currentSrc || img.getAttribute('src') || '');
      if (figure && !isVector && img.naturalWidth > 0 && img.naturalWidth < LOW_RES_WIDTH && !figure.classList.contains('race-memory-photo-lowres')) {
        figure.style.setProperty('--photo-natural-width', `${img.naturalWidth}px`);
        figure.classList.add('race-memory-photo-lowres');
      }
    };
    const attachFallbackOutcome = () => {
      img.addEventListener('load', applyLayout, { once: true });
      img.addEventListener('error', () => figure?.remove(), { once: true });
    };
    const tryFallback = () => {
      const fallback = fallbackPhotoSrc(img);
      if (!fallback || img.dataset.fallbackUsed === 'true') return false;
      img.dataset.fallbackUsed = 'true';
      img.src = fallback;
      const fullPhoto = figure?.querySelector('figcaption a');
      if (fullPhoto) fullPhoto.href = fallback;
      attachFallbackOutcome();
      return true;
    };
    const handleError = () => {
      if (!tryFallback()) figure?.remove();
    };
    if (img.complete) {
      if (img.naturalWidth) applyLayout();
      else handleError();
      return;
    }
    img.addEventListener('load', applyLayout, { once: true });
    img.addEventListener('error', handleError, { once: true });
  };

  function memoryMarkup(record, memory) {
    const isRace = record.kind === 'race';
    const photos = Array.isArray(memory.photos) ? memory.photos.filter(photo => photo?.src) : [];
    const heroPhoto = photos[0];
    const gallery = photos.slice(1);
    const paragraphs = (memory.memory || []).filter(Boolean).map(text => `<p>${A.esc(text)}</p>`).join('');
    const milestone = memory.milestone?.value ? `<div class="race-memory-stat race-memory-milestone"><small>${A.esc(memory.milestone.label || 'Milestone')}</small><strong>${A.esc(memory.milestone.value)}</strong><span>${A.esc(memory.milestone.note || '')}</span></div>` : '';
    const finish = finishTime(record);
    const finishCard = isRace && finish !== '—' ? `<div class="race-memory-stat race-memory-finish"><small>Official finish</small><strong>${A.esc(finish)}</strong><span>Official race result</span></div>` : '';
    const distance = officialDistance(record);
    const distanceCard = distance !== '—' ? `<div class="race-memory-stat"><small>Distance</small><strong>${A.esc(distance)}</strong><span>${isRace ? 'Official race distance' : 'Series distance'}</span></div>` : '';
    const goal = memory.goal?.label ? `<div class="race-memory-stat race-memory-goal"><small>Goal</small><strong>${A.esc(memory.goal.label)}</strong><span>${A.esc(memory.goal.status || '')}${memory.goal.status === 'Achieved' ? ' ✓' : ''}</span></div>` : '';
    const resultCards = `${milestone}${finishCard}${distanceCard}${goal}`;
    const results = resultCards ? `<div class="race-memory-results">${resultCards}</div>` : '';
    const resultLink = isRace && record.resultUrl ? `<a class="race-memory-source" href="${A.esc(record.resultUrl)}" target="_blank" rel="noopener">Official result ↗</a>` : '';
    const memoryLabel = memory.typeLabel || (isRace ? 'Race memory' : 'Series memory');

    return `<section class="race-memory-hero"><p class="eyebrow">${A.esc(memoryLabel)} · ${A.esc(String(record.year || record.date?.slice(0, 4) || ''))}</p><h1>${A.esc(record.name)}</h1><p class="race-memory-meta">${[record.date ? A.formatDate(record.date) : '', record.location || ''].filter(Boolean).map(A.esc).join(' · ')}</p><p class="race-memory-deck">${A.esc(memory.headline || '')}</p>${results}${resultLink}</section>${heroPhoto ? photoFigure(heroPhoto, 'race-memory-photo-hero') : ''}<section class="race-memory-story"><header><p class="eyebrow">${A.esc(memory.memoryTitle || 'What I remember')}</p><h2>${A.esc(memory.headline || record.name)}</h2></header><div class="race-memory-story-copy">${paragraphs}</div></section>${gallery.length ? `<section class="race-memory-gallery" aria-label="Race photos">${gallery.map(photo => photoFigure(photo)).join('')}</section>` : ''}`;
  }

  async function enhance() {
    const key = currentKey();
    if (!key) return;

    const [memories, dimensions, records] = await Promise.all([loadMemories(), loadImageDimensions(), A.load()]);
    imageDimensions = dimensions;
    const record = records.find(item => item.id === key || item.slug === key);
    if (!record || (record.kind !== 'race' && record.kind !== 'adventure')) return;
    const race = record.kind === 'race';
    let memory = memories[record.id] || memories[record.slug] || memories[key];
    if (race) {
      memory = { ...memory, photos: [...(memory?.photos || [])] };
      if (memory.milestone?.label === 'Official time') delete memory.milestone;
      for (const photo of record.media || []) {
        if (photo.src && !memory.photos.some(p => p.src === photo.src)) memory.photos.push(photo);
      }
    }
    if (!memory) return;

    await waitForLegacyDetail();

    const routeSection = page.querySelector('.detail-route-section');
    const chronology = page.querySelector('.chronology-nav');
    const related = page.querySelector('.record-related');
    routeSection?.remove();
    chronology?.remove();

    page.innerHTML = memoryMarkup(record, memory);
    if (race) {
      document.body.classList.add('marathon-memory-page');
      if (!memory.memory?.length) page.querySelector('.race-memory-story')?.remove();
      if (!memory.headline) page.querySelector('.race-memory-deck')?.remove();
      page.querySelectorAll('.race-memory-stat span').forEach(el => {
        if (['Official race result', 'Official race distance'].includes(el.textContent)) el.remove();
      });
      const finishLabel = page.querySelector('.race-memory-finish small');
      if (finishLabel) finishLabel.textContent = 'Finish time';
      page.insertAdjacentHTML('beforeend', marathonDetails(record));
      page.insertAdjacentHTML('beforeend', stravaDetails(record));
      if ((!memory.memory?.length || record.routeStatus === 'historical-course') && record.note) page.insertAdjacentHTML('beforeend', `<details class="event-notes"><summary>Notes from the day</summary><p>${A.esc(record.note)}</p></details>`);
    }
    page.querySelectorAll('.race-memory-photo img').forEach(settlePhoto);
    document.body.classList.add('race-memory-page');
    page.dataset.raceMemory = 'true';

    if (routeSection) {
      routeSection.classList.add('race-memory-route');
      const heading = routeSection.querySelector('h2');
      if (heading) heading.textContent = record.kind === 'race' ? 'The course' : 'The routes';
      if(record.id==='new-york-city-marathon-2026') routeSection.insertAdjacentHTML('afterbegin',`<p class="race-course-source">Official 2026 pink-start course · reconstructed with 34 timing checkpoints. <a href="${A.esc(record.routeSourceUrl)}" target="_blank" rel="noopener">NYRR course map ↗</a></p>`);
      if(record.id==='breckenridge-half-marathon-2026') routeSection.insertAdjacentHTML('afterbegin',`<p class="race-course-source">Organizer course reconstruction · 1,676 published route points. <a href="${A.esc(record.routeSourceUrl)}" target="_blank" rel="noopener">RunBreck course map ↗</a></p>`);
      if(record.id==='air-force-5k-2026') routeSection.insertAdjacentHTML('afterbegin',`<p class="race-course-source">Approximate course reconstruction · campus turns and start/finish positions inferred. <a href="${A.esc(record.routeSourceUrl)}" target="_blank" rel="noopener">Official 5K course map ↗</a></p>`);
      page.append(routeSection);
    }
    if (related) page.append(related);
    if (chronology) page.append(chronology);

    const finish = finishTime(record);
    const description = `${record.name}${record.kind === 'race' && finish !== '—' ? ` · ${finish}` : ''} · ${memory.headline || record.location || ''}`;
    A.refreshMeta(description);

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => window.dispatchEvent(new Event('resize')), 180);
    });
  }

  enhance().catch(error => console.warn('Race memory enhancement', error));
})();
