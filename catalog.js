window.AdventureCatalog = (() => {
  let cache = null;
  let relationshipCache = null;
  const fetchJson = async (path) => {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.json();
  };

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
    return {
      ...record,
      recordClass: record.kind,
      sport: sportFor(record),
      startDate,
      finishDate,
      distanceInfo: {
        km: Number.isFinite(record.distanceKm) ? record.distanceKm : null,
        mi: Number.isFinite(record.distanceMi) ? record.distanceMi : null,
        label: record.distance || null
      },
      locationInfo: {
        label: record.location || null,
        region: record.region || null,
        lat: Number.isFinite(record.lat) ? record.lat : null,
        lon: Number.isFinite(record.lon) ? record.lon : null,
        precision: record.coordinatePrecision || (Number.isFinite(record.lat) && Number.isFinite(record.lon) ? 'unknown' : null)
      },
      evidence: {
        source: record.matchSource || null,
        confidence: record.matchConfidence || 'unknown'
      },
      routeInfo: {
        status: record.routeStatus || null,
        provenance: record.routeProvenance || null
      }
    };
  }

  function validate(records) {
    const errors = [], warnings = [], seen = new Set();
    const allowedKinds = new Set(['summit','race','adventure','event','outing']);
    const allowedConfidence = new Set(['confirmed','verified','high','medium','low','unknown']);
    records.forEach((record, index) => {
      const where = record.id || `record ${index + 1}`;
      if (!record.id) errors.push(`${where}: missing id`);
      else if (seen.has(record.id)) errors.push(`${record.id}: duplicate id`);
      else seen.add(record.id);
      if (!record.name) errors.push(`${where}: missing name`);
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
      if (record.elevationFt != null && (!Number.isFinite(record.elevationFt) || record.elevationFt < 0)) errors.push(`${where}: invalid elevationFt`);
      if (record.matchConfidence && !allowedConfidence.has(record.matchConfidence)) warnings.push(`${where}: noncanonical confidence ${record.matchConfidence}`);
      if (record.kind === 'adventure' && record.discipline === 'mountain-bike') warnings.push(`${where}: mountain-bike event should normally be kind=race or outing`);
      if (record.kind === 'event' && /race/i.test(record.note || '') && !/not a race|rather than a race/i.test(record.note || '')) warnings.push(`${where}: event note mentions race; review classification`);
    });
    return { errors, warnings, valid: errors.length === 0 };
  }

  async function loadManifest() { return fetchJson('data/catalog.json'); }
  async function load({ fresh = false } = {}) {
    if (cache && !fresh) return cache;
    const manifest = await loadManifest();
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
    const adventures = [...records.values()].map(normalizeRecord);
    const report = validate(adventures);
    if (!report.valid) throw new Error(`Catalog validation failed: ${report.errors.join('; ')}`);
    if (report.warnings.length) console.warn('Adventure catalog warnings:', report.warnings);
    cache = adventures;
    return adventures;
  }
  async function loadRelationships({ fresh = false } = {}) {
    if (relationshipCache && !fresh) return relationshipCache;
    const manifest = await loadManifest();
    if (!manifest.relationshipLayer) return [];
    const payload = await fetchJson(manifest.relationshipLayer);
    relationshipCache = payload.relationships || [];
    return relationshipCache;
  }
  async function relationshipsFor(recordId) { const relationships = await loadRelationships(); return relationships.filter(rel => (rel.memberIds || []).includes(recordId) || rel.adventureId === recordId); }
  return { load, validate, normalizeRecord, loadRelationships, relationshipsFor };
})();
