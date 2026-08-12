window.AdventureRoutes = (() => {
  let configPromise;
  let relationshipsPromise;
  let allPromise;
  const fetchText = async path => {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`Failed to load ${path} (${r.status})`);
    return r.text();
  };
  const fetchJson = async path => JSON.parse(await fetchText(path));
  const fetchPolylinePayload = async path => {
    if (!path.endsWith('.gz.b64')) return fetchJson(path);
    const encoded = (await fetchText(path)).trim();
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot decompress the high-resolution route archive.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
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
  function dedupeCollections(collections) {
    const seen = new Set();
    return collections.map(collection => ({
      ...collection,
      features: (collection.features || []).filter(feature => {
        const id = keyFor(feature);
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
    })).filter(collection => (collection.features || []).length);
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
    const payload = await fetchPolylinePayload(path);
    const features = (payload.routes || []).map(route => {
      if (!route.id || !Array.isArray(route.lines) || !route.lines.length) throw new Error(`${path}: invalid encoded route`);
      const lines = route.lines.map(decodePolyline);
      return {
        type: 'Feature',
        id: route.id,
        properties: {
          featureId: route.id,
          stravaActivityId: route.stravaActivityId || null,
          sourceActivityIds: route.sourceActivityIds || route.activityIds || [],
          adventureIds: route.adventureIds || [],
          provenance: 'personal-gps',
          source: payload.source || 'Strava GPS export',
          category: route.category || null,
          mtbMode: route.mtbMode || null,
          density: route.density || payload.quality?.mode || null,
          sourcePointCount: route.sourcePointCount || null,
          publishedPointCount: route.publishedPointCount || null,
          splitGapMeters: route.splitGapMeters || payload.quality?.splitGapMeters || null,
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
  async function resolveAll() {
    const cfg = await config();
    const preferredPolylineFiles = cfg.preferredPolylineFiles || [];
    const routeFiles = cfg.routeFiles || [];
    const polylineFiles = cfg.polylineFiles?.length ? cfg.polylineFiles : ['data/activity-route-polylines.json'];
    const [preferredPayloads, routePayloads, polylinePayloads, relationshipPayload] = await Promise.all([
      Promise.all(preferredPolylineFiles.map(polylineCollection)),
      Promise.all(routeFiles.map(fetchJson)),
      Promise.all(polylineFiles.map(polylineCollection)),
      relationships()
    ]);
    const normalizedRoutes = await Promise.all(routePayloads.map(normalizeCollection));
    const ordered = dedupeCollections([...preferredPayloads, ...normalizedRoutes, ...polylinePayloads]);
    const preferredCollections = suppressSupersededFeatures(ordered);
    return expandRelationshipOwnership(preferredCollections, relationshipPayload);
  }
  function loadAll({ fresh = false } = {}) {
    if (fresh) return resolveAll();
    if (!allPromise) allPromise = resolveAll().catch(error => {
      allPromise = null;
      throw error;
    });
    return allPromise;
  }
  async function recordProvenance(recordId) {
    const cfg = await config();
    return cfg.recordOverrides?.[recordId] || null;
  }
  return { config, normalizeFeature, normalizeCollection, loadAll, recordProvenance, keyFor };
})();
