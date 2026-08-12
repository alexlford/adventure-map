window.AdventureCatalog = (() => {
  let cache = null;
  let loadPromise = null;
  let relationshipCache = null;
  let relationshipPromise = null;
  let manifestPromise = null;

  const fetchJson = async (path) => {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.json();
  };

  const slugify = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-');
  const recordSlug = (record) => record.slug || [record.date || record.year, record.name].filter(Boolean).map(slugify).filter(Boolean).join('-') || slugify(record.id);
  const sportFor = (record) => {
    if (record.kind === 'summit') return 'mountaineering';
    if (record.discipline === 'nordic') return 'nordic-skiing';
    if (record.discipline === 'mountain-bike') return 'mountain-biking';
    if (record.discipline === 'ski-objective' || record.discipline === 'ski') return 'alpine-skiing';
    if (record.discipline === 'mountain-loop' || record.discipline === 'trek' || record.discipline === 'hike') return 'hiking';
    if (record.kind === 'race') return 'running';
    return 'adventure';
  };

  function normalizeRecord(record) {
    const startDate = record.date || (record.year ? `${record.year}-01-01` : null);
    const finishDate = record.endDate || startDate;
    const officialKm = Number(record.officialDistanceKm);
    const officialMi = Number(record.officialDistanceMi);
    const recordedKm = Number(record.distanceKm);
    const recordedMi = Number(record.distanceMi);
    const hasOfficialDistance = Number.isFinite(officialKm) || Number.isFinite(officialMi) || Boolean(record.officialDistance);
    return {
      ...record,
      slug: recordSlug(record),
      recordClass: record.kind,
      sport: sportFor(record),
      startDate,
      finishDate,
      distanceInfo: {
        km: Number.isFinite(officialKm) ? officialKm : (Number.isFinite(recordedKm) ? recordedKm : null),
        mi: Number.isFinite(officialMi) ? officialMi : (Number.isFinite(recordedMi) ? recordedMi : null),
        label: record.officialDistance || record.distance || null,
        source: hasOfficialDistance ? 'official' : 'recorded'
      },
      locationInfo: {
        label: record.location || null,
        region: record.region || null,
        lat: Number.isFinite(record.lat) ? record.lat : null,
        lon: Number.isFinite(record.lon) ? record.lon : null,
        precision: record.coordinatePrecision || (Number.isFinite(record.lat) && Number.isFinite(record.lon) ? 'unknown' : null)
      },
      evidence: {
        source: record.resultSource || record.matchSource || null,
        matchSource: record.matchSource || null,
        resultSource: record.resultSource || null,
        confidence: record.matchConfidence || 'unknown'
      },
      routeInfo: {
        status: record.routeStatus || null,
        provenance: record.routeProvenance || null
      }
    };
  }

  function validate(records) {
    const errors = [], warnings = [], seen = new Set(), seenSlugs = new Map();
    const allowedKinds = new Set(['summit','race','adventure','event','outing']);
    const allowedConfidence = new Set(['confirmed','verified','high','medium','low','unknown']);
    records.forEach((record, index) => {
      const where = record.id || `record ${index + 1}`;
      if (!record.id) errors.push(`${where}: missing id`);
      else if (seen.has(record.id)) errors.push(`${record.id}: duplicate id`);
      else seen.add(record.id);
      if (!record.name) errors.push(`${where}: missing name`);
      if (!record.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug)) errors.push(`${where}: invalid record slug ${record.slug || '(missing)'}`);
      else if (seenSlugs.has(record.slug)) errors.push(`${where}: duplicate record slug ${record.slug} also used by ${seenSlugs.get(record.slug)}`);
      else seenSlugs.set(record.slug, where);
      if (!allowedKinds.has(record.kind)) errors.push(`${where}: invalid kind ${record.kind}`);
      if ((record.kind === 'race' || record.kind === 'event' || record.kind === 'outing') && !record.discipline) errors.push(`${where}: ${record.kind} missing discipline`);
      if (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) errors.push(`${where}: invalid date ${record.date}`);
      if (record.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(record.endDate)) errors.push(`${where}: invalid endDate ${record.endDate}`);
      if ((record.lat == null) !== (record.lon == null)) errors.push(`${where}: lat/lon must be provided together`);
      if (Number.isFinite(record.lat) && (record.lat < -90 || record.lat > 90)) errors.push(`${where}: latitude out of range`);
      if (Number.isFinite(record.lon) && (record.lon < -180 || record.lon > 180)) errors.push(`${where}: longitude out of range`);
      if (record.year && record.date && Number(record.date.slice(0,4)) !== Number(record.year)) warnings.push(`${where}: year does not match date`);
      if (record.distanceMi != null && (!Number.isFinite(record.distanceMi) || record.distanceMi < 0)) errors.push(`${where}: invalid distanceMi`);
      if (record.distanceKm != null && (!Number.isFinite(record.distanceKm) || record.distanceKm < 0)) errors.push(`${where}: invalid distanceKm`);
      if (record.officialDistanceMi != null && (!Number.isFinite(record.officialDistanceMi) || record.officialDistanceMi < 0)) errors.push(`${where}: invalid officialDistanceMi`);
      if (record.officialDistanceKm != null && (!Number.isFinite(record.officialDistanceKm) || record.officialDistanceKm < 0)) errors.push(`${where}: invalid officialDistanceKm`);
      if (record.elevationFt != null && (!Number.isFinite(record.elevationFt) || record.elevationFt < 0)) errors.push(`${where}: invalid elevationFt`);
      if (record.matchConfidence && !allowedConfidence.has(record.matchConfidence)) warnings.push(`${where}: noncanonical confidence ${record.matchConfidence}`);
      if (record.kind === 'adventure' && record.discipline === 'mountain-bike') warnings.push(`${where}: mountain-bike event should normally be kind=race or outing`);
      if (record.kind === 'event' && /race/i.test(record.note || '') && !/not a race|rather than a race/i.test(record.note || '')) warnings.push(`${where}: event note mentions race; review classification`);
    });
    return { errors, warnings, valid: errors.length === 0 };
  }

  function loadManifest({ fresh = false } = {}) {
    if (!fresh && manifestPromise) return manifestPromise;
    const pending = fetchJson('data/catalog.json');
    if (fresh) return pending;
    manifestPromise = pending.catch(error => {
      manifestPromise = null;
      throw error;
    });
    return manifestPromise;
  }

  async function loadFromSources({ fresh = false } = {}) {
    const manifest = await loadManifest({ fresh });
    const [sourcePayloads, matches] = await Promise.all([
      Promise.all(manifest.sources.map(source => fetchJson(source.path).then(payload => ({ source, payload })))),
      fetchJson(manifest.matchLayer)
    ]);
    const records = new Map();
    for (const { source, payload } of sourcePayloads) for (const item of payload.adventures || []) records.set(item.id, { ...(records.get(item.id) || {}), ...item, _catalogSource: source.path });
    for (const [id, match] of Object.entries(matches.matches || {})) if (records.has(id)) records.set(id, { ...records.get(id), ...match });
    for (const id of manifest.removeIds || []) records.delete(id);
    for (const [id, override] of Object.entries(manifest.overrides || {})) {
      if (!records.has(id)) throw new Error(`Catalog override references unknown id: ${id}`);
      records.set(id, { ...records.get(id), ...override });
    }
    return [...records.values()].map(normalizeRecord);
  }

  async function loadCompiled() {
    const payload = await fetchJson('data/public-records.json');
    if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.records)) throw new Error('Compiled public-records artifact has an invalid schema.');
    if (Number.isFinite(payload.recordCount) && payload.recordCount !== payload.records.length) throw new Error('Compiled public-records record count does not match its payload.');
    return payload.records;
  }

  async function resolveLoad({ fresh = false } = {}) {
    let adventures;
    try {
      adventures = await loadCompiled();
    } catch (compiledError) {
      console.warn('Compiled Adventure catalog unavailable; falling back to source layers.', compiledError);
      adventures = await loadFromSources({ fresh });
    }
    const report = validate(adventures);
    if (!report.valid) throw new Error(`Catalog validation failed: ${report.errors.join('; ')}`);
    if (report.warnings.length) console.warn('Adventure catalog warnings:', report.warnings);
    cache = adventures;
    return adventures;
  }

  function load({ fresh = false } = {}) {
    if (cache && !fresh) return Promise.resolve(cache);
    if (loadPromise && !fresh) return loadPromise;
    const pending = resolveLoad({ fresh });
    if (fresh) return pending;
    loadPromise = pending.finally(() => { loadPromise = null; });
    return loadPromise;
  }

  async function resolveRelationships({ fresh = false } = {}) {
    const manifest = await loadManifest({ fresh });
    if (!manifest.relationshipLayer) return [];
    const payload = await fetchJson(manifest.relationshipLayer);
    relationshipCache = payload.relationships || [];
    return relationshipCache;
  }

  function loadRelationships({ fresh = false } = {}) {
    if (relationshipCache && !fresh) return Promise.resolve(relationshipCache);
    if (relationshipPromise && !fresh) return relationshipPromise;
    const pending = resolveRelationships({ fresh });
    if (fresh) return pending;
    relationshipPromise = pending.finally(() => { relationshipPromise = null; });
    return relationshipPromise;
  }

  async function relationshipsFor(recordId) {
    const relationships = await loadRelationships();
    return relationships.filter(rel => (rel.memberIds || []).includes(recordId) || rel.adventureId === recordId);
  }

  return { load, validate, normalizeRecord, loadRelationships, relationshipsFor, recordSlug };
})();
