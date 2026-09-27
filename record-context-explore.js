(() => {
  'use strict';

  const A = window.AdventureSite;
  const P = window.AdventureRecordPresentation;
  const page = document.getElementById('page');
  if (!A || !P || !page) return;

  const query = new URLSearchParams(location.search);
  const cleanMatch = location.pathname.match(/\/record\/([^/]+)\/?$/);
  const key = query.get('record') || query.get('id') || (cleanMatch ? decodeURIComponent(cleanMatch[1]) : '');
  if (!key) return;

  const normalize = value => String(value || '').trim().toLowerCase();
  const yearFor = record => String(record.startDate || record.date || record.year || '').slice(0, 4);
  const locationLabel = record => record.locationInfo?.label || record.location || '';
  const regionLabel = record => record.locationInfo?.region || record.region || '';
  const viewFor = record => {
    const group = P.groupFor(record);
    return group === 'mountain-biking' ? 'mtb' : group;
  };
  const activityLabel = view => ({
    races: 'Races', summits: 'Summits', skiing: 'Alpine skiing', mtb: 'Mountain biking', nordic: 'Nordic skiing', adventures: 'Stories'
  }[view] || 'Adventures');

  function timelineHref(params = {}) {
    const url = new URL(A.pageHref('timeline.html'), document.baseURI);
    Object.entries(params).forEach(([name, value]) => {
      if (value) url.searchParams.set(name, String(value));
    });
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function safeReturnHref(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.origin);
      if (url.origin !== location.origin) return '';
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return '';
    }
  }

  function ensureStyle() {
    if (document.getElementById('recordContextExploreStyle')) return;
    const style = document.createElement('style');
    style.id = 'recordContextExploreStyle';
    style.textContent = `
      .record-context-explore{margin:34px 0}
      .record-context-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:14px}
      .record-context-head h2{margin:0}.record-context-head p{max-width:620px;margin:5px 0 0;color:var(--muted)}
      .record-context-back{flex:0 0 auto;font-size:.76rem;font-weight:800;color:var(--accent);text-decoration:none}
      .record-context-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .record-context-card{display:grid;gap:6px;padding:16px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.5);color:inherit;text-decoration:none}
      .record-context-card small{font-size:.66rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
      .record-context-card strong{font-size:1rem}.record-context-card span{font-size:.76rem;color:var(--muted)}
      .record-context-card:hover{border-color:color-mix(in srgb,var(--accent) 34%,var(--line));background:rgba(255,255,255,.72)}
      @media(max-width:760px){.record-context-head{align-items:flex-start;flex-direction:column}.record-context-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function buildCards(record, all) {
    const cards = [];
    const year = yearFor(record);
    const yearCount = year ? all.filter(item => yearFor(item) === year).length : 0;
    if (year && yearCount > 1) cards.push({ kicker: 'Same year', title: year, detail: `${yearCount} records from ${year}`, href: timelineHref({ year }) });

    const place = locationLabel(record);
    const region = regionLabel(record);
    const exactCount = place ? all.filter(item => normalize(locationLabel(item)) === normalize(place)).length : 0;
    if (place && exactCount > 1) {
      cards.push({ kicker: 'Same place', title: place, detail: `${exactCount} records here`, href: timelineHref({ q: place }) });
    } else if (region) {
      const regionCount = all.filter(item => normalize(regionLabel(item)) === normalize(region)).length;
      if (regionCount > 1) cards.push({ kicker: 'Same region', title: region, detail: `${regionCount} records in this region`, href: timelineHref({ place: region }) });
    }

    const view = viewFor(record);
    const activityCount = all.filter(item => viewFor(item) === view).length;
    if (view && activityCount > 1) cards.push({ kicker: 'Same activity', title: activityLabel(view), detail: `${activityCount} records in this chapter`, href: timelineHref({ view }) });

    return cards.slice(0, 3);
  }

  function mount(record, all) {
    if (page.querySelector('.record-context-explore')) return true;
    if (!page.querySelector('.hero') || page.querySelector('.empty')) return false;
    const cards = buildCards(record, all);
    const returnHref = safeReturnHref(query.get('from'));
    if (!cards.length && !returnHref) return true;
    ensureStyle();
    const section = document.createElement('section');
    section.className = 'record-context-explore';
    section.innerHTML = `<div class="record-context-head"><div><p class="eyebrow">Keep exploring</p><h2>Put this record back in context.</h2><p>Move from the individual day back into the year, place, or activity around it.</p></div>${returnHref ? `<a class="record-context-back" href="${A.esc(returnHref)}">← Back to your archive view</a>` : ''}</div><div class="record-context-grid">${cards.map(card => `<a class="record-context-card" href="${A.esc(card.href)}"><small>${A.esc(card.kicker)}</small><strong>${A.esc(card.title)}</strong><span>${A.esc(card.detail)} →</span></a>`).join('')}</div>`;
    const chronology = page.querySelector(':scope > .chronology-nav');
    if (chronology) chronology.insertAdjacentElement('beforebegin', section);
    else page.appendChild(section);
    return true;
  }

  A.load().then(all => {
    const record = all.find(item => item.id === key || item.slug === key);
    if (!record) return;
    if (mount(record, all)) return;
    const observer = new MutationObserver(() => {
      if (mount(record, all)) observer.disconnect();
    });
    observer.observe(page, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }).catch(() => {});
})();
