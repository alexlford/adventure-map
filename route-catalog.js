window.AdventureRoutes = (() => {
  let configPromise;
  const fetchJson = async path => {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`Failed to load ${path} (${r.status})`);
    return r.json();
  };
  const config = () => configPromise ||= fetchJson('data/route-catalog.json');
  const keyFor = feature => feature.id || feature.properties?.featureId || feature.properties?.id || null;
  const inferProvenance = feature => {
    const p = feature.properties || {};
    const source = `${p.source || ''} ${p.routeType || ''}`.toLowerCase();
    if (source.includes('historical') || source.includes('official') || source.includes('published')) return 'historical-course';
    if (p.stravaActivityId || source.includes('strava') || feature.id?.startsWith('strava-')) return 'personal-gps';
    return 'personal-gps';
  };
  async function normalizeFeature(feature) {
    const cfg = await config();
    const id = keyFor(feature);
    const override = id ? cfg.featureOverrides?.[id] : null;
    const properties = { ...(feature.properties || {}), ...(override || {}) };
    properties.provenance ||= inferProvenance({ ...feature, properties });
    return { ...feature, properties };
  }
  async function normalizeCollection(collection) {
    return { ...collection, features: await Promise.all((collection.features || []).map(normalizeFeature)) };
  }
  async function loadAll() {
    const cfg = await config();
    const payloads = await Promise.all(cfg.routeFiles.map(fetchJson));
    return Promise.all(payloads.map(normalizeCollection));
  }
  async function recordProvenance(recordId) {
    const cfg = await config();
    return cfg.recordOverrides?.[recordId] || null;
  }
  return { config, normalizeFeature, normalizeCollection, loadAll, recordProvenance, keyFor };
})();
