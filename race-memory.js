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
    if (Number.isFinite(record.officialDistanceMi)) return `${record.officialDistanceMi} mi`;
    if (record.officialDistance) return record.officialDistance;
    return record.distance || '—';
  };

  const finishTime = record => String(record.officialTime || record.result || '—').replace(/^0(?=\d:)/, '');

  const photoFigure = (photo, className = '') => `<figure class="race-memory-photo ${className}"><img src="${A.esc(photo.src)}" alt="${A.esc(photo.alt || '')}" loading="${className.includes('hero') ? 'eager' : 'lazy'}" decoding="async">${photo.caption ? `<figcaption>${A.esc(photo.caption)}</figcaption>` : ''}</figure>`;

  function memoryMarkup(record, memory) {
    const photos = Array.isArray(memory.photos) ? memory.photos.filter(photo => photo?.src) : [];
    const heroPhoto = photos[0];
    const gallery = photos.slice(1);
    const paragraphs = (memory.memory || []).filter(Boolean).map(text => `<p>${A.esc(text)}</p>`).join('');
    const milestone = memory.milestone?.value ? `<div class="race-memory-stat race-memory-milestone"><small>${A.esc(memory.milestone.label || 'Milestone')}</small><strong>${A.esc(memory.milestone.value)}</strong><span>${A.esc(memory.milestone.note || '')}</span></div>` : '';
    const finish = finishTime(record);
    const finishCard = finish !== '—' ? `<div class="race-memory-stat race-memory-finish"><small>Official finish</small><strong>${A.esc(finish)}</strong><span>Official race result</span></div>` : '';
    const distance = officialDistance(record);
    const distanceCard = distance !== '—' ? `<div class="race-memory-stat"><small>Distance</small><strong>${A.esc(distance)}</strong><span>Official race distance</span></div>` : '';
    const goal = memory.goal?.label ? `<div class="race-memory-stat race-memory-goal"><small>Goal</small><strong>${A.esc(memory.goal.label)}</strong><span>${A.esc(memory.goal.status || '')}${memory.goal.status === 'Achieved' ? ' ✓' : ''}</span></div>` : '';
    const resultCards = `${milestone}${finishCard}${distanceCard}${goal}`;
    const results = resultCards ? `<div class="race-memory-results">${resultCards}</div>` : '';
    const resultLink = record.resultUrl ? `<a class="race-memory-source" href="${A.esc(record.resultUrl)}" target="_blank" rel="noopener">Official result ↗</a>` : '';

    return `<section class="race-memory-hero"><p class="eyebrow">Race memory · ${A.esc(String(record.year || record.date?.slice(0, 4) || ''))}</p><h1>${A.esc(record.name)}</h1><p class="race-memory-meta">${A.esc(record.date ? A.formatDate(record.date) : '')}${record.location ? ` · ${A.esc(record.location)}` : ''}</p><p class="race-memory-deck">${A.esc(memory.headline || '')}</p>${results}${resultLink}</section>${heroPhoto ? photoFigure(heroPhoto, 'race-memory-photo-hero') : ''}<section class="race-memory-story"><header><p class="eyebrow">${A.esc(memory.memoryTitle || 'What I remember')}</p><h2>${A.esc(memory.headline || record.name)}</h2></header><div class="race-memory-story-copy">${paragraphs}</div></section>${gallery.length ? `<section class="race-memory-gallery" aria-label="Race photos">${gallery.map(photo => photoFigure(photo)).join('')}</section>` : ''}`;
  }

  async function enhance() {
    const key = currentKey();
    if (!key) return;

    let payload;
    try {
      payload = await fetchJson('data/race-memories.json');
    } catch (error) {
      console.warn('Race memory metadata unavailable', error);
      return;
    }

    const records = await A.load();
    const record = records.find(item => item.id === key || item.slug === key);
    if (!record || record.kind !== 'race') return;
    const memory = payload?.records?.[record.id] || payload?.records?.[record.slug] || payload?.records?.[key];
    if (!memory) return;

    await waitForLegacyDetail();

    const routeSection = page.querySelector('.detail-route-section');
    const chronology = page.querySelector('.chronology-nav');
    routeSection?.remove();
    chronology?.remove();

    page.innerHTML = memoryMarkup(record, memory);
    document.body.classList.add('race-memory-page');
    page.dataset.raceMemory = 'true';

    if (routeSection) {
      routeSection.classList.add('race-memory-route');
      const heading = routeSection.querySelector('h2');
      const meta = routeSection.querySelector('#routeMeta');
      if (heading) heading.textContent = 'The course';
      if (meta) meta.textContent = 'Personal GPS track from race day.';
      page.append(routeSection);
    }
    if (chronology) page.append(chronology);

    const finish = finishTime(record);
    const description = `${record.name}${finish !== '—' ? ` · ${finish}` : ''} · ${memory.headline || record.location || ''}`;
    A.refreshMeta(description);

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => window.dispatchEvent(new Event('resize')), 180);
    });
  }

  enhance().catch(error => console.warn('Race memory enhancement', error));
})();
