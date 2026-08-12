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
    const payload = await fetchJson('data/public-records.json');
    if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.records)) throw new Error('Compiled public-records artifact has an invalid schema.');
    if (Number.isFinite(payload.recordCount) && payload.recordCount !== payload.records.length) throw new Error('Compiled public-records record count does not match its payload.');
    return payload.records;
  }

  async function resolveLoad() {
    const records = await loadCompiled();
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
