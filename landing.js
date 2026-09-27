(() => {
  const storyPath = 'data/homepage-stories.json';
  const photoIndexPath = 'data/photo-index.json';

  const dateKey = record => record.finishDate || record.endDate || record.date || record.startDate || '';
  const startKey = record => record.startDate || record.date || dateKey(record);
  const localToday = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const recordPriority = record => {
    let score = 0;
    if (startKey(record) && dateKey(record) && startKey(record) < dateKey(record)) score += 4;
    if (record.kind === 'adventure' || record.recordClass === 'adventure') score += 3;
    if (record.discipline === 'challenge') score += 2;
    return score;
  };

  const completedRecords = records => {
    const today = localToday();
    return records.filter(record => record?.slug && dateKey(record) && dateKey(record) <= today);
  };

  const latestRecord = records => completedRecords(records)
    .sort((a, b) => {
      const byDate = dateKey(b).localeCompare(dateKey(a));
      if (byDate) return byDate;
      const byPriority = recordPriority(b) - recordPriority(a);
      if (byPriority) return byPriority;
      return startKey(a).localeCompare(startKey(b));
    })[0] || null;

  const recentRecords = (records, featuredId, limit = 4) => completedRecords(records)
    .filter(record => record.id !== featuredId)
    .sort((a, b) => {
      const byDate = dateKey(b).localeCompare(dateKey(a));
      if (byDate) return byDate;
      const byPriority = recordPriority(b) - recordPriority(a);
      if (byPriority) return byPriority;
      return String(a.name || '').localeCompare(String(b.name || ''));
    })
    .slice(0, limit);

  const parseDate = value => new Date(`${value}T12:00:00`);
  const formatSingleDate = (value, includeYear = true) => {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      ...(includeYear ? { year: 'numeric' } : {})
    }).format(parseDate(value));
  };

  const formatDateRange = record => {
    const start = startKey(record);
    const end = dateKey(record);
    if (!start) return '';
    if (!end || start === end) return formatSingleDate(start);
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();
    if (sameMonth) {
      const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(startDate);
      return `${month} ${startDate.getDate()}–${endDate.getDate()}, ${endDate.getFullYear()}`;
    }
    if (sameYear) return `${formatSingleDate(start, false)} – ${formatSingleDate(end)}`;
    return `${formatSingleDate(start)} – ${formatSingleDate(end)}`;
  };

  const cleanNumber = value => Number.isFinite(value) ? value : null;
  const distanceLabel = record => {
    if (record.distanceInfo?.label) return record.distanceInfo.label;
    const miles = cleanNumber(record.distanceInfo?.mi) ?? cleanNumber(record.officialDistanceMi) ?? cleanNumber(record.distanceMi);
    if (miles !== null) return `${miles >= 10 ? miles.toFixed(1) : miles.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} mi`;
    const km = cleanNumber(record.distanceInfo?.km) ?? cleanNumber(record.officialDistanceKm) ?? cleanNumber(record.distanceKm);
    if (km !== null) return `${km >= 10 ? km.toFixed(1) : km.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} km`;
    return '';
  };

  const formatSeconds = seconds => {
    if (!Number.isFinite(seconds)) return '';
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  const timeLabel = record => record.officialTime || record.finishTime || formatSeconds(record.elapsedSeconds);
  const activityLabel = record => {
    const map = {
      'mountain-biking': 'Mountain biking',
      'nordic-skiing': 'Nordic skiing',
      'alpine-skiing': 'Alpine skiing',
      mountaineering: 'Mountaineering',
      hiking: 'Hiking',
      running: 'Running',
      adventure: 'Adventure'
    };
    return map[record.sport] || map[record.discipline] || (record.kind === 'race' ? 'Race' : 'Adventure');
  };

  const fallbackStory = record => {
    const distance = distanceLabel(record);
    const activity = activityLabel(record).toLowerCase();
    const location = record.locationInfo?.label || record.location || '';
    if (distance && location) return `${distance} of ${activity} in ${location}.`;
    if (location) return `${activityLabel(record)} in ${location}.`;
    if (distance) return `${distance} of ${activity}.`;
    return `${activityLabel(record)} added to the archive.`;
  };

  const defaultStats = record => {
    const stats = [];
    const add = (value, label) => {
      if (!value || stats.some(stat => stat.value === value && stat.label === label)) return;
      stats.push({ value, label });
    };

    add(distanceLabel(record), 'Distance');
    add(timeLabel(record), record.officialTime ? 'Official time' : 'Elapsed time');

    if (Number.isFinite(record.ageGroupPlace) && Number.isFinite(record.ageGroupFieldSize)) {
      add(`${record.ageGroupPlace} / ${record.ageGroupFieldSize}`, record.ageGroup || 'Age group');
    }
    if (Number.isFinite(record.elevationGainM)) add(`${Math.round(record.elevationGainM * 3.28084).toLocaleString()} ft`, 'Elevation gain');
    if (Number.isFinite(record.elevationFt)) add(`${Math.round(record.elevationFt).toLocaleString()} ft`, 'Summit elevation');
    add(activityLabel(record), 'Activity');
    add(String(parseDate(dateKey(record)).getFullYear()), 'Year');

    return stats.slice(0, 3);
  };

  const loadJson = async (path, fallback) => {
    try {
      const response = await fetch(path, { cache: 'no-cache' });
      if (!response.ok) return fallback;
      return await response.json();
    } catch {
      return fallback;
    }
  };

  const loadStories = async () => {
    const payload = await loadJson(storyPath, {});
    return payload?.records && typeof payload.records === 'object' ? payload.records : {};
  };

  const loadPhotoIndex = async () => {
    const payload = await loadJson(photoIndexPath, {});
    return payload?.records && typeof payload.records === 'object' ? payload.records : {};
  };

  const renderLatest = (record, override = {}) => {
    const title = document.getElementById('latest-title');
    const meta = document.getElementById('latest-meta');
    const card = document.getElementById('latest-card');
    const kicker = document.getElementById('latest-kicker');
    const copy = document.getElementById('latest-copy');
    const stats = document.getElementById('latest-stats');
    if (!title || !meta || !card || !kicker || !copy || !stats) return;

    const location = record.locationInfo?.label || record.location || '';
    title.textContent = record.name;
    meta.textContent = [formatDateRange(record), location].filter(Boolean).join(' · ');
    card.href = `record/${record.slug}/`;
    card.setAttribute('aria-label', `Open ${record.name}`);
    kicker.textContent = override.kicker || 'The newest adventure in the archive.';
    copy.textContent = override.story || fallbackStory(record);

    const statItems = Array.isArray(override.stats) && override.stats.length ? override.stats.slice(0, 3) : defaultStats(record);
    stats.replaceChildren(...statItems.map(stat => {
      const item = document.createElement('div');
      const value = document.createElement('strong');
      const label = document.createElement('span');
      value.textContent = stat.value;
      label.textContent = stat.label;
      item.append(value, label);
      return item;
    }));
    stats.setAttribute('aria-label', `${record.name} details`);
  };

  const createRecentCard = (record, photoRecord) => {
    const card = document.createElement('a');
    card.className = 'recent-card';
    card.href = `record/${record.slug}/`;
    card.setAttribute('aria-label', `Open ${record.name}`);

    const media = document.createElement('div');
    media.className = 'recent-media';
    const photo = photoRecord?.primary;
    if (photo?.path) {
      card.classList.add('has-photo');
      const image = document.createElement('img');
      image.src = photo.path;
      image.alt = photo.caption || `${record.name} archive photo`;
      image.loading = 'lazy';
      image.decoding = 'async';
      if (Number.isFinite(photo.width)) image.width = photo.width;
      if (Number.isFinite(photo.height)) image.height = photo.height;
      media.appendChild(image);
    } else {
      const activity = document.createElement('strong');
      const year = document.createElement('span');
      activity.textContent = activityLabel(record);
      year.textContent = String(parseDate(dateKey(record)).getFullYear());
      media.append(activity, year);
    }

    const copy = document.createElement('div');
    copy.className = 'recent-copy';
    const meta = document.createElement('p');
    const title = document.createElement('h3');
    const location = document.createElement('span');
    meta.textContent = [formatDateRange(record), activityLabel(record)].filter(Boolean).join(' · ');
    title.textContent = record.name;
    location.textContent = record.locationInfo?.label || record.location || record.region || '';
    copy.append(meta, title, location);
    card.append(media, copy);
    return card;
  };

  const renderRecent = (records, featuredId, photoIndex) => {
    const portals = document.querySelector('.home-portals');
    if (!portals) return;
    let section = document.querySelector('.home-recent');
    if (!section) {
      section = document.createElement('section');
      section.className = 'home-section home-recent';
      section.setAttribute('aria-labelledby', 'recent-title');
      const heading = document.createElement('div');
      heading.className = 'home-section-heading';
      const headingCopy = document.createElement('div');
      const eyebrow = document.createElement('p');
      const title = document.createElement('h2');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = 'Recently added';
      title.id = 'recent-title';
      title.textContent = 'Fresh from the archive.';
      headingCopy.append(eyebrow, title);
      const description = document.createElement('p');
      description.textContent = 'The newest completed records, with archive photos where I have them.';
      heading.append(headingCopy, description);
      const grid = document.createElement('div');
      grid.className = 'recent-grid';
      grid.id = 'recent-grid';
      section.append(heading, grid);
      portals.insertAdjacentElement('afterend', section);
    }

    const grid = section.querySelector('#recent-grid');
    const recent = recentRecords(records, featuredId);
    if (!grid || !recent.length) {
      section.remove();
      return;
    }
    grid.replaceChildren(...recent.map(record => createRecentCard(record, photoIndex[record.id])));
  };

  const initHomepage = async () => {
    if (!window.AdventureCatalog?.load) return;
    try {
      const [records, stories, photoIndex] = await Promise.all([
        window.AdventureCatalog.load(),
        loadStories(),
        loadPhotoIndex()
      ]);
      const featured = latestRecord([...records]);
      if (featured) renderLatest(featured, stories[featured.id] || {});
      renderRecent(records, featured?.id || null, photoIndex);
    } catch (error) {
      console.warn('Homepage archive content could not be refreshed; keeping the static homepage fallback.', error);
    }
  };

  initHomepage();
})();
