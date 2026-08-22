window.AdventureRoutes = (() => {
  let configPromise;
  let relationshipsPromise;
  let allPromise;
  let detailIndexPromise;
  const detailFilePromises = new Map();
  const detailRecordPromises = new Map();
  const DETAIL_INDEX_PATH = 'data/route-detail-index.json';
  const fetchJson = async path => {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`Failed to load ${path} (${r.status})`);
    return r.json();
  };
  const config = () => configPromise ||= fetchJson('data/route-catalog.json');
  const relationships = () => relationshipsPromise ||= (window.AdventureCatalog?.loadRelationships
    ? window.AdventureCatalog.loadRelationships().then(items => ({ relationships: items }))
    : fetchJson('data/relationships.json')
  ).catch(() => ({ relationships: [] }));
  const COMPOSITE_COLOR_TOKENS = Object.freeze({
    mtb: ['--activity-mtb', '#2f7d4a'],
    nordic: ['--activity-nordic', '#1779a8'],
    'road-races': ['--activity-road-races', '#d97706'],
    'trail-races': ['--activity-trail-races', '#b45309'],
    skiing: ['--activity-skiing', '#16a6c9'],
    summits: ['--activity-summits', '#16836d'],
    adventures: ['--activity-adventures', '#8b5cf6'],
    mixed: ['--activity-mixed', '#59636d']
  });
  const COMPOSITE_FALLBACK_ORDER = Object.freeze(['adventures', 'nordic', 'trail-races', 'skiing', 'road-races', 'summits', 'mtb', 'mixed']);
  const routeLayerForRecord = record => {
    if (!record) return 'adventures';
    if (record.kind === 'summit') return 'summits';
    if (record.mapCategory === 'ski' || record.discipline === 'ski') return 'skiing';
    if (record.discipline === 'mountain-bike' || record.mapCategory === 'mountain-bike' || record.mapCategory === 'downhill-mtb') return 'mtb';
    if (record.discipline === 'nordic' || record.mapCategory === 'nordic') return 'nordic';
    if (record.kind === 'race' && record.discipline === 'trail') return 'trail-races';
    if (record.kind === 'race') return 'road-races';
    return record.kind === 'event' && record.discipline === 'nordic' ? 'nordic' : 'adventures';
  };
  const compositeThemeColor = key => {
    const [token, fallback] = COMPOSITE_COLOR_TOKENS[key] || COMPOSITE_COLOR_TOKENS.mixed;
    try {
      const value = window.getComputedStyle?.(document.documentElement)?.getPropertyValue(token)?.trim();
      if (value) return value;
    } catch (_error) {}
    return fallback;
  };
  function compositeRouteContext(recordId, relationshipItems = [], records = []) {
    if (!recordId || !Array.isArray(relationshipItems) || !Array.isArray(records)) return null;
    const relationship = relationshipItems.find(rel => rel?.adventureId === recordId && Array.isArray(rel.memberIds) && rel.memberIds.length > 1);
    if (!relationship) return null;
    const byId = new Map(records.map(record => [record.id, record]));
    const usedKeys = new Set();
    const members = relationship.memberIds.map((id, index) => {
      const record = byId.get(id) || null;
      const semanticKey = routeLayerForRecord(record);
      let colorKey = semanticKey;
      if (usedKeys.has(colorKey)) colorKey = COMPOSITE_FALLBACK_ORDER.find(key => !usedKeys.has(key)) || COMPOSITE_FALLBACK_ORDER[index % COMPOSITE_FALLBACK_ORDER.length];
      usedKeys.add(colorKey);
      return Object.freeze({ id, index, record, semanticKey, colorKey, color: compositeThemeColor(colorKey) });
    });
    return Object.freeze({ recordId, relationship, members: Object.freeze(members) });
  }
  const compositeRouteColorForId = (memberId, context) => context?.members?.find(member => member.id === memberId)?.color || null;
  const compositeRouteColor = (feature, context) => {
    if (!context) return null;
    const owners = feature?.properties?.adventureIds || [];
    const member = context.members.find(item => owners.includes(item.id));
    return member?.color || null;
  };
  const keyFor = feature => feature.id || feature.properties?.featureId || feature.properties?.id || null;
  const geometryPointCount = feature => feature?.geometry?.type === 'LineString'
    ? (feature.geometry.coordinates || []).length
    : feature?.geometry?.type === 'MultiLineString'
      ? (feature.geometry.coordinates || []).reduce((sum, line) => sum + (line?.length || 0), 0)
      : 0;
  const detailRank = feature => {
    if (feature?.properties?.publicationSelected === true) return 4;
    const resolution = String(feature?.properties?.routeResolution || feature?.properties?.density || '').toLowerCase();
    if (resolution.includes('full-source') || resolution.includes('dense-source')) return 3;
    if (resolution.includes('rdp-3m')) return 2;
    return 1;
  };
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
  function dedupeFeatureIds(collections) {
    const winners = new Map();
    collections.forEach((collection, collectionIndex) => {
      (collection.features || []).forEach((feature, featureIndex) => {
        const id = keyFor(feature);
        if (!id) return;
        const prior = winners.get(id);
        const candidateRank = detailRank(feature);
        const candidatePoints = geometryPointCount(feature);
        const priorRank = prior ? detailRank(prior.feature) : -1;
        const priorPoints = prior ? geometryPointCount(prior.feature) : -1;
        if (!prior || candidateRank > priorRank || (candidateRank === priorRank && candidatePoints >= priorPoints)) {
          winners.set(id, { collectionIndex, featureIndex, feature });
        }
      });
    });
    if (!winners.size) return collections;
    return collections.map((collection, collectionIndex) => ({
      ...collection,
      features: (collection.features || []).filter((feature, featureIndex) => {
        const id = keyFor(feature);
        if (!id) return true;
        const winner = winners.get(id);
        return winner?.collectionIndex === collectionIndex && winner?.featureIndex === featureIndex;
      })
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
    const features = (payload.routes || []).flatMap(route => {
      if (!route.id) throw new Error(`${path}: invalid encoded route`);
      const sourceActivityIds = Array.isArray(route.stravaActivityIds)
        ? route.stravaActivityIds.map(String)
        : route.stravaActivityId != null ? [String(route.stravaActivityId)] : [];
      const baseProperties = {
        stravaActivityId: sourceActivityIds.length === 1 ? sourceActivityIds[0] : null,
        stravaActivityIds: sourceActivityIds,
        adventureIds: route.adventureIds || [],
        provenance: 'personal-gps',
        source: payload.source || 'Strava GPS export',
        category: route.category || null,
        mtbMode: route.mtbMode || null,
        density: route.density || null,
        segmentType: route.segmentType || null,
        segmentCount: route.segmentCount || null,
        note: route.note || null,
        supersedesFeatureId: route.supersedesFeatureId || null,
        routeResolution: route.sampling || payload.sampling || null,
        geometryClass: route.geometryClass || payload.geometryClass || null,
        publicationSelected: route.publicationSelected === true
      };

      if (Array.isArray(route.segments) && route.segments.length) {
        return route.segments.map((segment, segmentIndex) => {
          if (typeof segment.line !== 'string' || !segment.line.length) throw new Error(`${path}: invalid encoded route segment`);
          const segmentId = segmentIndex === 0 ? route.id : `${route.id}::segment-${segmentIndex + 1}`;
          return {
            type: 'Feature',
            id: segmentId,
            properties: {
              ...baseProperties,
              featureId: segmentId,
              routeFeatureId: route.id,
              geometryEvidence: segment.evidence || 'recorded',
              geometryConfidence: segment.confidence || null
            },
            geometry: { type: 'LineString', coordinates: decodePolyline(segment.line) }
          };
        });
      }

      if (!Array.isArray(route.lines) || !route.lines.length) throw new Error(`${path}: invalid encoded route`);
      const lines = route.lines.map(decodePolyline);
      return [{
        type: 'Feature',
        id: route.id,
        properties: {
          ...baseProperties,
          featureId: route.id,
          geometryEvidence: route.geometryEvidence || 'recorded'
        },
        geometry: lines.length === 1
          ? { type: 'LineString', coordinates: lines[0] }
          : { type: 'MultiLineString', coordinates: lines }
      }];
    });
    return normalizeCollection({ type: 'FeatureCollection', features });
  }
  async function loadAvailable(paths, loader, label) {
    const settled = await Promise.allSettled(paths.map(path => loader(path)));
    const available = [];
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') available.push(result.value);
      else console.warn(`${label} unavailable: ${paths[index]}`, result.reason);
    });
    return available;
  }
  async function resolveAll() {
    const cfg = await config();
    const routeFiles = cfg.routeFiles || [];
    const polylineFiles = cfg.polylineFiles?.length ? cfg.polylineFiles : ['data/activity-route-polylines.json'];
    const [normalizedRoutes, polylinePayloads, relationshipPayload] = await Promise.all([
      loadAvailable(routeFiles, async path => normalizeCollection(await fetchJson(path)), 'Route source'),
      loadAvailable(polylineFiles, polylineCollection, 'Polyline route source'),
      relationships()
    ]);
    const collections = [...normalizedRoutes, ...polylinePayloads];
    if (!collections.length && (routeFiles.length || polylineFiles.length)) throw new Error('Unable to load public route geometry.');
    const preferredCollections = dedupeFeatureIds(suppressSupersededFeatures(collections));
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
  async function resolveDetailIndex() {
    const index = await fetchJson(DETAIL_INDEX_PATH);
    if (index?.schemaVersion !== 1 || !index.records || typeof index.records !== 'object') {
      throw new Error('Invalid route detail index');
    }
    return index;
  }
  function detailIndex({ fresh = false } = {}) {
    if (fresh) return resolveDetailIndex();
    if (!detailIndexPromise) detailIndexPromise = resolveDetailIndex().catch(error => {
      detailIndexPromise = null;
      throw error;
    });
    return detailIndexPromise;
  }
  function detailLoader(path, format = null) {
    if (format === 'geojson' || String(path).toLowerCase().endsWith('.geojson')) {
      return async target => normalizeCollection(await fetchJson(target));
    }
    return polylineCollection;
  }
  function detailFile(path, { fresh = false, format = null } = {}) {
    const loader = detailLoader(path, format);
    const cacheKey = `${format || "auto"}:${path}`;
    if (fresh) return loader(path);
    if (!detailFilePromises.has(cacheKey)) {
      detailFilePromises.set(cacheKey, loader(path).catch(error => {
        detailFilePromises.delete(cacheKey);
        throw error;
      }));
    }
    return detailFilePromises.get(cacheKey);
  }
  async function resolveDetailForAdventure(adventureId, options = {}) {
    const index = await detailIndex(options);
    const entry = index.records?.[adventureId];
    if (!entry) return null;
    const collection = await detailFile(entry.file, { ...options, format: entry.format || null });
    const features = (collection.features || []).filter(feature => keyFor(feature) === entry.featureId || feature.properties?.routeFeatureId === entry.featureId);
    if (!features.length) throw new Error(`Detail route ${entry.featureId} is missing from ${entry.file}`);
    return {
      entry: { ...entry },
      collection: { type: 'FeatureCollection', features },
    };
  }
  function loadDetailForAdventure(adventureId, { fresh = false } = {}) {
    if (fresh) return resolveDetailForAdventure(adventureId, { fresh: true });
    if (!detailRecordPromises.has(adventureId)) {
      detailRecordPromises.set(adventureId, resolveDetailForAdventure(adventureId).catch(error => {
        detailRecordPromises.delete(adventureId);
        throw error;
      }));
    }
    return detailRecordPromises.get(adventureId);
  }
  async function detailSourceForAdventure(adventureId) {
    const index = await detailIndex();
    return index.records?.[adventureId] ? { ...index.records[adventureId] } : null;
  }
  async function recordProvenance(recordId) {
    const cfg = await config();
    return cfg.recordOverrides?.[recordId] || null;
  }
  return {
    config,
    normalizeFeature,
    normalizeCollection,
    loadAll,
    detailIndex,
    detailSourceForAdventure,
    loadDetailForAdventure,
    recordProvenance,
    compositeRouteContext,
    compositeRouteColor,
    compositeRouteColorForId,
    routeLayerForRecord,
    keyFor
  };
})();