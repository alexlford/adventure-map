window.AdventureRoutes = (() => {
  let configPromise;
  let relationshipsPromise;
  const fetchJson = async path => {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`Failed to load ${path} (${r.status})`);
    return r.json();
  };
  const config = () => configPromise ||= fetchJson('data/route-catalog.json');
  const relationships = () => relationshipsPromise ||= fetchJson('data/relationships.json').catch(() => ({ relationships: [] }));
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
  function expandRelationshipOwnership(collections, payload) {
    const rels = (payload?.relationships || []).filter(rel => rel.adventureId && Array.isArray(rel.memberIds) && rel.memberIds.length);
    if (!rels.length) return collections;
    return collections.map(collection => ({
      ...collection,
      features: (collection.features || []).map(feature => {
        const owners = new Set(feature.properties?.adventureIds || []);
        for (const rel of rels) {
          if (rel.memberIds.some(memberId => owners.has(memberId))) owners.add(rel.adventureId);
        }
        return { ...feature, properties: { ...(feature.properties || {}), adventureIds: [...owners] } };
      })
    }));
  }
  function suppressSupersededFeatures(collections) {
    const superseded = new Set(
      collections.flatMap(collection => collection.features || [])
        .map(feature => feature.properties?.supersedesFeatureId)
        .filter(Boolean)
    );
    if (!superseded.size) return collections;
    return collections.map(collection => ({
      ...collection,
      features: (collection.features || []).filter(feature => !superseded.has(keyFor(feature)))
    }));
  }
  function decodeComponent(encoded, state, label) {
    let result = 0;
    let shift = 0;
    let b;
    do {
      if (state.index >= encoded.length) throw new Error(`Truncated ${label}`);
      b = encoded.charCodeAt(state.index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return (result & 1) ? ~(result >> 1) : (result >> 1);
  }
  function decodePolyline(encoded) {
    const state = { index: 0 };
    let lat = 0;
    let lon = 0;
    const coordinates = [];
    while (state.index < encoded.length) {
      const coordinateStart = state.index;
      try {
        lat += decodeComponent(encoded, state, 'latitude');
        lon += decodeComponent(encoded, state, 'longitude');
        const point = [lon / 1e5, lat / 1e5];
        if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90) {
          throw new Error('Encoded route contains an out-of-range coordinate');
        }
        coordinates.push(point);
      } catch (error) {
        const trimEnd = encoded.length - coordinateStart;
        if (!coordinates.length || trimEnd < 1 || trimEnd > 8 || state.index !== encoded.length) throw error;
        break;
      }
    }
    if (coordinates.length < 2) throw new Error('Encoded route contains fewer than two coordinates');
    return coordinates;
  }
  async function polylineCollection(path) {
    const payload = await fetchJson(path);
    const features = (payload.routes || []).map(route => {
      if (!route.id || !Array.isArray(route.lines) || !route.lines.length) throw new Error(`${path}: invalid encoded route`);
      const lines = route.lines.map(decodePolyline);
      return {
        type: 'Feature',
        id: route.id,
        properties: {
          featureId: route.id,
          stravaActivityId: route.stravaActivityId || null,
          adventureIds: route.adventureIds || [],
          provenance: 'personal-gps',
          source: payload.source || 'Strava GPS export',
          category: route.category || null,
          mtbMode: route.mtbMode || null,
          density: route.density || null,
          segmentType: route.segmentType || null,
          segmentCount: route.segmentCount || null,
          note: route.note || null,
          supersedesFeatureId: route.supersedesFeatureId || null
        },
        geometry: lines.length === 1
          ? { type: 'LineString', coordinates: lines[0] }
          : { type: 'MultiLineString', coordinates: lines }
      };
    });
    return normalizeCollection({ type: 'FeatureCollection', features });
  }
  async function loadAll() {
    const cfg = await config();
    const routeFiles = cfg.routeFiles || [];
    const polylineFiles = cfg.polylineFiles?.length ? cfg.polylineFiles : ['data/activity-route-polylines.json'];
    const [routePayloads, polylinePayloads, relationshipPayload] = await Promise.all([
      Promise.all(routeFiles.map(fetchJson)),
      Promise.all(polylineFiles.map(polylineCollection)),
      relationships()
    ]);
    const normalizedRoutes = await Promise.all(routePayloads.map(normalizeCollection));
    const preferredCollections = suppressSupersededFeatures([...normalizedRoutes, ...polylinePayloads]);
    return expandRelationshipOwnership(preferredCollections, relationshipPayload);
  }
  async function recordProvenance(recordId) {
    const cfg = await config();
    return cfg.recordOverrides?.[recordId] || null;
  }
  return { config, normalizeFeature, normalizeCollection, loadAll, recordProvenance, keyFor };
})();
