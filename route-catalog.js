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

  const decodeComponent = (encoded, state) => {
    let result = 0;
    let shift = 0;
    let b;
    do {
      if (state.index >= encoded.length) throw new Error('Truncated encoded route');
      b = encoded.charCodeAt(state.index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return (result & 1) ? ~(result >> 1) : (result >> 1);
  };

  const decodePolyline = encoded => {
    const state = { index: 0 };
    let lat = 0;
    let lon = 0;
    const coordinates = [];
    while (state.index < encoded.length) {
      const coordinateStart = state.index;
      try {
        lat += decodeComponent(encoded, state);
        lon += decodeComponent(encoded, state);
        coordinates.push([lon / 1e5, lat / 1e5]);
      } catch (error) {
        const trimEnd = encoded.length - coordinateStart;
        if (!coordinates.length || trimEnd < 1 || trimEnd > 8 || state.index !== encoded.length) throw error;
        break;
      }
    }
    if (coordinates.length < 2) throw new Error('Encoded route contains fewer than two coordinates');
    return coordinates;
  };

  const polylineCollection = payload => ({
    type: 'FeatureCollection',
    features: (payload.routes || []).map(route => {
      const lines = (route.lines || []).map(decodePolyline);
      const activityIds = (route.activityIds || []).map(String);
      return {
        type: 'Feature',
        id: route.id,
        properties: {
          featureId: route.id,
          adventureIds: route.adventureIds || [],
          provenance: 'personal-gps',
          category: route.category,
          source: 'Strava GPS export',
          density: route.density || null,
          mtbMode: route.mtbMode || null,
          stravaActivityIds: activityIds,
          stravaActivityId: activityIds.length === 1 ? activityIds[0] : null,
        },
        geometry: lines.length === 1
          ? { type: 'LineString', coordinates: lines[0] }
          : { type: 'MultiLineString', coordinates: lines },
      };
    })
  });

  const featurePriority = feature => {
    const p = feature.properties || {};
    if (p.density === 'dense') return 30;
    if (p.provenance === 'personal-gps') return 20;
    if (p.provenance === 'historical-course') return 10;
    return 0;
  };

  const unionAdventureIds = (a, b) => [...new Set([...(a || []), ...(b || [])])];

  const dedupeFeatures = features => {
    const byId = new Map();
    const anonymous = [];
    for (const feature of features) {
      const id = keyFor(feature);
      if (!id) {
        anonymous.push(feature);
        continue;
      }
      const current = byId.get(id);
      if (!current) {
        byId.set(id, feature);
        continue;
      }
      const adventureIds = unionAdventureIds(current.properties?.adventureIds, feature.properties?.adventureIds);
      const preferred = featurePriority(feature) > featurePriority(current) ? feature : current;
      byId.set(id, {
        ...preferred,
        properties: { ...(preferred.properties || {}), adventureIds }
      });
    }
    return [...byId.values(), ...anonymous];
  };

  const expandCombinedStoryIds = (features, relPayload) => {
    const rels = relPayload?.relationships || [];
    return features.map(feature => {
      const ids = new Set(feature.properties?.adventureIds || []);
      let changed = true;
      while (changed) {
        changed = false;
        for (const rel of rels) {
          if (!rel.adventureId || ids.has(rel.adventureId)) continue;
          if ((rel.memberIds || []).some(id => ids.has(id))) {
            ids.add(rel.adventureId);
            changed = true;
          }
        }
      }
      return {
        ...feature,
        properties: { ...(feature.properties || {}), adventureIds: [...ids] }
      };
    });
  };

  async function loadAll() {
    const cfg = await config();
    const routeFiles = cfg.routeFiles || [];
    const polylineFiles = cfg.polylineFiles?.length ? cfg.polylineFiles : ['data/activity-route-polylines.json'];
    const [geoPayloads, polylinePayloads, relPayload] = await Promise.all([
      Promise.all(routeFiles.map(fetchJson)),
      Promise.all(polylineFiles.map(fetchJson)),
      relationships(),
    ]);
    const normalizedGeo = await Promise.all(geoPayloads.map(normalizeCollection));
    const normalizedPolyline = await Promise.all(polylinePayloads.map(payload => normalizeCollection(polylineCollection(payload))));
    const allFeatures = [...normalizedGeo, ...normalizedPolyline].flatMap(payload => payload.features || []);
    const features = expandCombinedStoryIds(dedupeFeatures(allFeatures), relPayload);
    return [{ type: 'FeatureCollection', features }];
  }

  async function recordProvenance(recordId) {
    const cfg = await config();
    return cfg.recordOverrides?.[recordId] || null;
  }

  return { config, normalizeFeature, normalizeCollection, loadAll, recordProvenance, keyFor };
})();