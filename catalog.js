window.AdventureCatalog = (() => {
  let cache = null;
  let loadPromise = null;
  let relationshipCache = null;
  let relationshipPromise = null;

  const requestLabel = path => {
    try {
      const url = new URL(path, location.href);
      return url.pathname.replace(/^\/+/, '');
    } catch {
      return String(path);
    }
  };

  const fetchJson = async (path) => {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${requestLabel(path)} (${response.status})`);
    return response.json();
  };

  const catalogBaseUrl = () => {
    const script = [...document.scripts].reverse().find(node => /catalog\.js(?:[?#]|$)/.test(node.src));
    return script ? new URL('.', script.src) : new URL('./', location.href);
  };

  const catalogAssetUrl = path => new URL(String(path || '').replace(/^\/+/, ''), catalogBaseUrl()).href;

  const normalizeMediaSrc = src => {
    if (!src) return '';
    try { return new URL(src, catalogBaseUrl()).href; }
    catch { return String(src); }
  };

  const photoAlt = (photo, record) => {
    const name = photo.eventName || record.name || 'Adventure';
    const filename = String(photo.filename || '');
    if (/finish-group/.test(filename)) return `Finish group at ${name}`;
    if (/character-photo/.test(filename)) return `Character photo at ${name}`;
    if (/with-dog|dog-skiing/.test(filename)) return `Nordic skiing with a dog at ${name}`;
    if (/sunrise-ascent/.test(filename)) return `Sunrise ascent on ${name}`;
    if (/finish/.test(filename)) return `Finish photo from ${name}`;
    if (/trail/.test(filename)) return `Trail scene from ${name}`;
    if (/course-wide/.test(filename)) return `Wide race-course scene from ${name}`;
    if (/course/.test(filename)) return `Race-course scene from ${name}`;
    return `Photo from ${name}`;
  };

  async function enrichEventPhotos(records) {
    let payload;
    try {
      payload = await fetchJson(catalogAssetUrl('data/event-photo-manifest.json'));
    } catch (error) {
      console.warn('Event photo manifest unavailable; continuing without photo enrichment.', error);
      return records;
    }
    if (!payload || !Array.isArray(payload.photos)) return records;

    const photosByRecord = new Map();
    payload.photos.forEach(photo => {
      if (!photo || photo.status !== 'canonical' || !photo.path) return;
      const ids = new Set([photo.eventId, ...(Array.isArray(photo.relatedEventIds) ? photo.relatedEventIds : [])].filter(Boolean));
      ids.forEach(id => {
        if (!photosByRecord.has(id)) photosByRecord.set(id, []);
        photosByRecord.get(id).push(photo);
      });
    });

    return records.map(record => {
      const additions = photosByRecord.get(record.id);
      if (!additions?.length) return record;
      const existing = Array.isArray(record.media) ? record.media.filter(Boolean) : [];
      const seen = new Set(existing.map(item => normalizeMediaSrc(item?.src)).filter(Boolean));
      const manifestMedia = additions.flatMap(photo => {
        const src = catalogAssetUrl(photo.path);
        if (seen.has(src)) return [];
        seen.add(src);
        return [{
          type: 'image',
          src,
          alt: photo.alt || photoAlt(photo, record),
          caption: photo.caption || [photo.eventName || record.name, photo.date].filter(Boolean).join(' · '),
          source: 'event-photo-manifest',
          sourceFilename: photo.source || null,
          repositoryBlobSha: photo.repositoryBlobSha || null
        }];
      });
      if (!manifestMedia.length) return record;
      return {
        ...record,
        media: [...existing, ...manifestMedia],
        mediaTitle: record.mediaTitle || 'Scenes from the day'
      };
    });
  }

  // Semantic record rules are enforced once at build time by data/event-schema.json.
  // Runtime validation intentionally covers only publication identity/integrity so the
  // browser cannot become a second, drifting implementation of the record schema.
  function validate(records) {
    const errors = [], warnings = [], seen = new Set(), seenSlugs = new Map();
    records.forEach((record, index) => {
      const where = record.id || `record ${index + 1}`;
      if (!record.id) errors.push(`${where}: missing id`);
      else if (seen.has(record.id)) errors.push(`${record.id}: duplicate id`);
      else seen.add(record.id);
      if (!record.name) errors.push(`${where}: missing name`);
      if (!record.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug)) errors.push(`${where}: invalid record slug ${record.slug || '(missing)'}`);
      else if (seenSlugs.has(record.slug)) errors.push(`${where}: duplicate record slug ${record.slug} also used by ${seenSlugs.get(record.slug)}`);
      else seenSlugs.set(record.slug, where);
    });
    return { errors, warnings, valid: errors.length === 0 };
  }

  async function loadCompiled() {
    const payload = await fetchJson(catalogAssetUrl('data/public-records.json'));
    if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.records)) throw new Error('Compiled public-records artifact has an invalid schema.');
    if (Number.isFinite(payload.recordCount) && payload.recordCount !== payload.records.length) throw new Error('Compiled public-records record count does not match its payload.');
    return payload.records;
  }

  async function resolveLoad() {
    const compiled = await loadCompiled();
    const records = await enrichEventPhotos(compiled);
    const report = validate(records);
    if (!report.valid) throw new Error(`Catalog validation failed: ${report.errors.join('; ')}`);
    cache = records;
    return records;
  }

  function load({ fresh = false } = {}) {
    if (cache && !fresh) return Promise.resolve(cache);
    if (loadPromise && !fresh) return loadPromise;
    const pending = resolveLoad();
    if (fresh) return pending;
    loadPromise = pending.finally(() => { loadPromise = null; });
    return loadPromise;
  }

  async function resolveRelationships() {
    try {
      const payload = await fetchJson(catalogAssetUrl('data/relationships.json'));
      relationshipCache = Array.isArray(payload.relationships) ? payload.relationships : [];
    } catch (error) {
      console.warn('Adventure relationships unavailable; continuing without related-record enrichment.', error);
      relationshipCache = [];
    }
    return relationshipCache;
  }

  function loadRelationships({ fresh = false } = {}) {
    if (relationshipCache && !fresh) return Promise.resolve(relationshipCache);
    if (relationshipPromise && !fresh) return relationshipPromise;
    const pending = resolveRelationships();
    if (fresh) return pending;
    relationshipPromise = pending.finally(() => { relationshipPromise = null; });
    return relationshipPromise;
  }

  async function relationshipsFor(recordId) {
    const relationships = await loadRelationships();
    return relationships.filter(rel => (rel.memberIds || []).includes(recordId) || rel.adventureId === recordId);
  }

  return { load, validate, loadRelationships, relationshipsFor };
})();
