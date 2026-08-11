window.AdventureCatalog = (() => {
  let cache = null;
  let relationshipCache = null;
  const fetchJson = async (path) => {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.json();
  };

  function validate(records) {
    const errors = [], warnings = [], seen = new Set();
    const allowedKinds = new Set(['summit','race','adventure']);
    records.forEach((record, index) => {
      const where = record.id || `record ${index + 1}`;
      if (!record.id) errors.push(`${where}: missing id`);
      else if (seen.has(record.id)) errors.push(`${record.id}: duplicate id`);
      else seen.add(record.id);
      if (!record.name) errors.push(`${where}: missing name`);
      if (!allowedKinds.has(record.kind)) errors.push(`${where}: invalid kind ${record.kind}`);
      if (record.kind === 'race' && !record.discipline) errors.push(`${where}: race missing discipline`);
      if (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) errors.push(`${where}: invalid date ${record.date}`);
      if (record.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(record.endDate)) errors.push(`${where}: invalid endDate ${record.endDate}`);
      if ((record.lat == null) !== (record.lon == null)) errors.push(`${where}: lat/lon must be provided together`);
      if (Number.isFinite(record.lat) && (record.lat < -90 || record.lat > 90)) errors.push(`${where}: latitude out of range`);
      if (Number.isFinite(record.lon) && (record.lon < -180 || record.lon > 180)) errors.push(`${where}: longitude out of range`);
      if (record.year && record.date && Number(record.date.slice(0,4)) !== Number(record.year)) warnings.push(`${where}: year does not match date`);
      if (record.distanceMi != null && (!Number.isFinite(record.distanceMi) || record.distanceMi < 0)) errors.push(`${where}: invalid distanceMi`);
      if (record.elevationFt != null && (!Number.isFinite(record.elevationFt) || record.elevationFt < 0)) errors.push(`${where}: invalid elevationFt`);
      if (record.kind === 'adventure' && record.discipline === 'mountain-bike') warnings.push(`${where}: mountain-bike event should normally be kind=race`);
    });
    return { errors, warnings, valid: errors.length === 0 };
  }

  async function loadManifest() {
    return fetchJson('data/catalog.json');
  }

  async function load({ fresh = false } = {}) {
    if (cache && !fresh) return cache;
    const manifest = await loadManifest();
    const [sourcePayloads, matches] = await Promise.all([
      Promise.all(manifest.sources.map(source => fetchJson(source.path).then(payload => ({ source, payload })))),
      fetchJson(manifest.matchLayer)
    ]);

    const records = new Map();
    for (const { source, payload } of sourcePayloads) {
      for (const item of payload.adventures || []) {
        const prior = records.get(item.id) || {};
        records.set(item.id, { ...prior, ...item, _catalogSource: source.path });
      }
    }

    for (const [id, match] of Object.entries(matches.matches || {})) {
      if (records.has(id)) records.set(id, { ...records.get(id), ...match });
    }

    for (const id of manifest.removeIds || []) records.delete(id);
    for (const [id, override] of Object.entries(manifest.overrides || {})) {
      if (!records.has(id)) throw new Error(`Catalog override references unknown id: ${id}`);
      records.set(id, { ...records.get(id), ...override });
    }

    const adventures = [...records.values()];
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

  async function relationshipsFor(recordId) {
    const relationships = await loadRelationships();
    return relationships.filter(rel => (rel.memberIds || []).includes(recordId) || rel.adventureId === recordId);
  }

  return { load, validate, loadRelationships, relationshipsFor };
})();
