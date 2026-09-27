(() => {
  const storyPath = 'data/homepage-stories.json';
  const additionsPath = 'data/archive-additions.json';
  const healthPath = 'data/archive-health.json';

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

  const latestRecord = records => {
    const today = localToday();
    return records
      .filter(record => record?.slug && dateKey(record) && dateKey(record) <= today)
      .sort((a, b) => {
        const byDate = dateKey(b).localeCompare(dateKey(a));
        if (byDate) return byDate;
        const byPriority = recordPriority(b) - recordPriority(a);
        if (byPriority) return byPriority;
        return startKey(a).localeCompare(startKey(b));
      })[0] || null;
  };

  const parseDate = value => new Date(`${value}T12:00:00`);
  const formatSingleDate = (value, includeYear = true) => {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      ...(includeYear ? { year: 'numeric' } : {})
    }).format(parseDate(value));
  };

  const formatAddedDate = value => {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
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

  const renderFeaturedAddition = (record, override = {}, addition = null) => {
    const title = document.getElementById('latest-title');
    const meta = document.getElementById('latest-meta');
    const card = document.getElementById('latest-card');
    const kicker = document.getElementById('latest-kicker');
    const copy = document.getElementById('latest-copy');
    const stats = document.getElementById('latest-stats');
    const added = document.getElementById('recent-feature-added');
    if (!title || !meta || !card || !kicker || !copy || !stats) return;

    const location = record.locationInfo?.label || record.location || '';
    title.textContent = record.name;
    meta.textContent = [formatDateRange(record), location].filter(Boolean).join(' · ');
    card.href = `record/${record.slug}/`;
    card.setAttribute('aria-label', `Open ${record.name}`);
    card.dataset.recordId = record.id;
    if (addition?.addedAt) card.dataset.addedAt = addition.addedAt;
    else delete card.dataset.addedAt;
    if (added) added.textContent = addition?.addedAt ? `Added ${formatAddedDate(addition.addedAt)}` : 'Latest adventure';
    kicker.textContent = override.kicker || 'A new record in the archive.';
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

  const buildRecentCard = (record, addition) => {
    const card = document.createElement('a');
    card.className = 'recent-card';
    card.href = `record/${record.slug}/`;
    card.dataset.recordId = record.id;
    card.dataset.addedAt = addition.addedAt;

    const added = document.createElement('span');
    added.className = 'recent-card-added';
    added.textContent = `Added ${formatAddedDate(addition.addedAt)}`;

    const title = document.createElement('strong');
    title.textContent = record.name;

    const location = record.locationInfo?.label || record.location || '';
    const meta = document.createElement('small');
    meta.textContent = [formatDateRange(record), location].filter(Boolean).join(' · ');

    const footer = document.createElement('span');
    footer.className = 'recent-card-footer';
    const activity = document.createElement('em');
    activity.textContent = activityLabel(record);
    const open = document.createElement('b');
    open.textContent = 'Open record →';
    footer.append(activity, open);

    card.append(added, title, meta, footer);
    return card;
  };

  const renderRecentAdditions = (entries, recordsById, featuredId) => {
    const list = document.getElementById('recently-added-list');
    if (!list) return;
    const cards = entries
      .filter(entry => entry.recordId !== featuredId)
      .map(entry => ({ entry, record: recordsById.get(entry.recordId) }))
      .filter(item => item.record?.slug)
      .slice(0, 3)
      .map(item => buildRecentCard(item.record, item.entry));
    if (cards.length) list.replaceChildren(...cards);
  };

  const renderArchiveSnapshot = (records, health) => {
    const setValue = (id, value) => {
      const node = document.getElementById(id);
      if (node && value != null && value !== '') node.textContent = value;
    };

    const years = records
      .map(record => startKey(record) || dateKey(record))
      .filter(Boolean)
      .map(value => Number(String(value).slice(0, 4)))
      .filter(Number.isFinite);
    const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '';

    setValue('snapshot-records', Number(health?.recordCount || records.length).toLocaleString());
    setValue('snapshot-routes', Number(health?.coverage?.Route?.complete || 0).toLocaleString());
    setValue('snapshot-photos', Number(health?.coverage?.Photo?.complete || 0).toLocaleString());
    setValue('snapshot-years', span);
  };

  const initHome = async () => {
    if (!window.AdventureCatalog?.load) return;
    try {
      const [records, storyPayload, additionPayload, health] = await Promise.all([
        window.AdventureCatalog.load(),
        loadJson(storyPath, {}),
        loadJson(additionsPath, { entries: [] }),
        loadJson(healthPath, null)
      ]);
      const stories = storyPayload?.records && typeof storyPayload.records === 'object' ? storyPayload.records : {};
      const additions = Array.isArray(additionPayload?.entries) ? additionPayload.entries : [];
      const recordsById = new Map(records.map(record => [record.id, record]));
      const validAdditions = additions.filter(entry => recordsById.get(entry.recordId)?.slug);
      const featuredAddition = validAdditions.find(entry => entry.featured) || validAdditions[0] || null;
      const featuredRecord = featuredAddition ? recordsById.get(featuredAddition.recordId) : latestRecord(records);

      if (featuredRecord) renderFeaturedAddition(featuredRecord, stories[featuredRecord.id] || {}, featuredAddition);
      if (validAdditions.length && featuredRecord) renderRecentAdditions(validAdditions, recordsById, featuredRecord.id);
      renderArchiveSnapshot(records, health);
    } catch (error) {
      console.warn('Homepage archive data could not be refreshed; keeping the static homepage fallback.', error);
    }
  };

  initHome();
})();
