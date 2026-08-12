window.AdventureCatalog = (() => {
  let cache = null;
  let loadPromise = null;
  let relationshipCache = null;
  let relationshipPromise = null;

  const fetchJson = async (path) => {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.json();
  };

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
    });
    return { errors, warnings, valid: errors.length === 0 };
  }

  async function loadCompiled() {
    const payload = await fetchJson('data/public-records.json');
    if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.records)) throw new Error('Compiled public-records artifact has an invalid schema.');
    if (Number.isFinite(payload.recordCount) && payload.recordCount !== payload.records.length) throw new Error('Compiled public-records record count does not match its payload.');
    return payload.records;
  }

  async function resolveLoad() {
    const records = await loadCompiled();
    const report = validate(records);
    if (!report.valid) throw new Error(`Catalog validation failed: ${report.errors.join('; ')}`);
    if (report.warnings.length) console.warn('Adventure catalog warnings:', report.warnings);
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
      const payload = await fetchJson('data/relationships.json');
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
