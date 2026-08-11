window.AdventureRoutes = (() => {
  let configPromise;
  let compiledPromise;
  const publicBuild = () => window.ADVENTURE_PUBLIC_BUILD === true;
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
  const decodePolyline = encoded => {
    let index = 0, lat = 0, lon = 0;
    const coordinates = [];
    while (index < encoded.length) {
      let result = 0, shift = 0, b;
      do {
        if (index >= encoded.length) throw new Error('truncated latitude');
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      result = 0; shift = 0;
      do {
        if (index >= encoded.length) throw new Error('truncated longitude');
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lon += (result & 1) ? ~(result >> 1) : (result >> 1);
      coordinates.push([lon / 1e5, lat / 1e5]);
    }
    return coordinates;
  };
  const repairedLine = (routeId, line, index, cfg) => {
    const trim = Number(cfg.polylineRepairs?.[routeId]?.trimEndByLine?.[String(index)] || 0);
    return trim > 0 ? line.slice(0, -trim) : line;
  };
  const activityRoutesToGeoJson = (payload, cfg) => ({
    type: 'FeatureCollection',
    features: (payload.routes || []).map(route => {
      const lines = (route.lines || []).map((line, index) => decodePolyline(repairedLine(route.id, line, index, cfg)));
      const repair = cfg.polylineRepairs?.[route.id] || null;
      return {
        type: 'Feature',
        id: route.id,
        properties: {
          featureId: route.id,
          adventureIds: route.adventureIds || [],
          provenance: 'personal-gps',
          category: route.category,
          source: 'Strava GPS export',
          mtbMode: route.mtbMode || null,
          routeRepair: repair?.note || null,
        },
        geometry: lines.length === 1
          ? { type: 'LineString', coordinates: lines[0] }
          : { type: 'MultiLineString', coordinates: lines },
      };
    }),
  });
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
  function mergeCollections(collections) {
    const features = [];
    const seen = new Set();
    collections.forEach(collection => (collection.features || []).forEach(feature => {
      const id = keyFor(feature);
      if (id && seen.has(id)) return;
      if (id) seen.add(id);
      features.push(feature);
    }));
    return { type: 'FeatureCollection', features };
  }
  async function compiledCollection({ fresh = false, path = 'data/public-routes.geojson' } = {}) {
    if (fresh || !compiledPromise) compiledPromise = fetchJson(path);
    const collection = await compiledPromise;
    if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error(`Compiled route collection ${path} is invalid`);
    if (collection.metadata?.featureCount != null && Number(collection.metadata.featureCount) !== collection.features.length) throw new Error(`Compiled route collection ${path} featureCount does not match features`);
    return collection;
  }
  async function loadAll() {
    if (publicBuild()) return compiledCollection();
    const cfg = await config();
    const [routePayloads, polylinePayloads] = await Promise.all([
      Promise.all((cfg.routeFiles || []).map(fetchJson)),
      Promise.all((cfg.polylineFiles || []).map(fetchJson)),
    ]);
    const collections = [
      ...routePayloads,
      ...polylinePayloads.map(payload => activityRoutesToGeoJson(payload, cfg)),
    ];
    return mergeCollections(await Promise.all(collections.map(normalizeCollection)));
  }
  async function loadCompiled(path = 'data/public-routes.geojson') {
    return compiledCollection({ fresh: true, path });
  }
  async function recordProvenance(recordId) {
    if (publicBuild()) {
      const collection = await compiledCollection();
      return collection.metadata?.recordOverrides?.[recordId] || null;
    }
    const cfg = await config();
    return cfg.recordOverrides?.[recordId] || null;
  }
  return { config, normalizeFeature, normalizeCollection, loadAll, loadCompiled, recordProvenance, keyFor };
})();
