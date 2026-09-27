(() => {
  'use strict';

  const A = window.AdventureSite;
  const page = document.getElementById('page');
  if (!A || !page) return;

  const query = new URLSearchParams(location.search);
  const cleanMatch = location.pathname.match(/\/record\/([^/]+)\/?$/);
  const key = query.get('record') || query.get('id') || (cleanMatch ? decodeURIComponent(cleanMatch[1]) : '');
  if (!key) return;

  const waitForRenderedPage = record => new Promise(resolve => {
    const ready = () => page.querySelector('.hero h1')?.textContent?.trim() === record.name;
    if (ready()) return resolve(true);
    const observer = new MutationObserver(() => {
      if (!ready()) return;
      observer.disconnect();
      resolve(true);
    });
    observer.observe(page, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(ready());
    }, 5000);
  });

  const loadPhotoIndex = async () => {
    try {
      const response = await fetch('data/photo-index.json', { cache: 'no-cache' });
      if (!response.ok) return {};
      const payload = await response.json();
      return payload?.records && typeof payload.records === 'object' ? payload.records : {};
    } catch {
      return {};
    }
  };

  const dimensionAttrs = photo => [
    Number.isFinite(photo.width) ? ` width="${photo.width}"` : '',
    Number.isFinite(photo.height) ? ` height="${photo.height}"` : ''
  ].join('');

  const figure = (photo, cls = '') => {
    const caption = photo.caption || '';
    const alt = caption || `${photo.eventName || 'Adventure'} archive photo`;
    return `<figure class="record-photo ${cls}"><img src="${A.esc(photo.path)}" alt="${A.esc(alt)}" loading="lazy" decoding="async"${dimensionAttrs(photo)}>${caption ? `<figcaption>${A.esc(caption)}</figcaption>` : ''}</figure>`;
  };

  const render = (record, photoRecord) => {
    if (!photoRecord?.photos?.length || page.querySelector('.record-media')) return;
    const photos = photoRecord.photos.filter(photo => photo?.path);
    if (!photos.length) return;
    const [hero, ...rest] = photos;
    const section = document.createElement('section');
    section.className = 'record-media record-media-indexed';
    section.id = 'recordMedia';
    section.innerHTML = `<div class="record-media-head"><div><p class="eyebrow">Photo essay</p><h2>Scenes from the day</h2></div><p>Archive photography connected to this record.</p></div><div class="record-photo-essay">${figure(hero, 'record-photo-hero')}${rest.length ? `<div class="record-photo-grid">${rest.map((photo, index) => figure(photo, index === 0 && rest.length % 2 === 1 ? 'record-photo-wide' : '')).join('')}</div>` : ''}</div>`;
    const route = page.querySelector('.detail-route-section');
    const chronology = page.querySelector('.chronology-nav');
    if (route) route.insertAdjacentElement('beforebegin', section);
    else if (chronology) chronology.insertAdjacentElement('beforebegin', section);
    else page.appendChild(section);
    document.body.classList.add('has-record-media');
  };

  Promise.all([A.load(), loadPhotoIndex()]).then(async ([records, photoIndex]) => {
    const record = records.find(item => item.id === key || item.slug === key);
    if (!record) return;
    const rendered = await waitForRenderedPage(record);
    if (!rendered) return;
    render(record, photoIndex[record.id]);
  }).catch(error => console.warn('Indexed record photos unavailable.', error));
})();
