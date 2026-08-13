(() => {
  'use strict';

  const runtime = window.AdventureMapRuntime;
  const internal = runtime?.internal;
  const colors = window.AdventureMapTheme?.colors || {};
  if (!runtime || !internal) return;

  internal.setCategoryDefinitions({
    road: { label: 'Road race', color: colors['road-races'] || colors.mixed },
    trail: { label: 'Trail race', color: colors['trail-races'] || colors.mixed },
    'mountain-bike': { label: 'Mountain bike race', color: colors.mtb || colors.mixed }
  });

  function decodePolyline(encoded) {
    let index = 0;
    let lat = 0;
    let lon = 0;
    const coordinates = [];
    while (index < encoded.length) {
      let result = 0;
      let shift = 0;
      let b;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      result = 0;
      shift = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lon += (result & 1) ? ~(result >> 1) : (result >> 1);
      coordinates.push([lon / 1e5, lat / 1e5]);
    }
    return coordinates;
  }

  function activityRoutesToGeoJson(payload) {
    return {
      type: 'FeatureCollection',
      features: (payload.routes || []).map(route => {
        const lines = (route.lines || []).map(decodePolyline);
        return {
          type: 'Feature',
          id: route.id,
          properties: {
            featureId: route.id,
            adventureIds: route.adventureIds || [],
            provenance: 'personal-gps',
            category: route.category,
            source: 'Strava GPS export',
            mtbMode: route.mtbMode || null
          },
          geometry: lines.length === 1
            ? { type: 'LineString', coordinates: lines[0] }
            : { type: 'MultiLineString', coordinates: lines }
        };
      })
    };
  }

  window.addEventListener('load', async () => {
    try {
      await runtime.ready();
      const urls = ['data/mined-routes.geojson', 'data/historical-routes-v2.geojson', 'data/event-routes.geojson'];
      const [responses, activityResponse] = await Promise.all([
        Promise.all(urls.map(url => fetch(url))),
        fetch('data/activity-route-polylines.json')
      ]);
      responses.forEach((response, index) => {
        if (!response.ok) throw new Error(`Unable to load supplemental routes ${urls[index]} (${response.status})`);
      });
      if (!activityResponse.ok) throw new Error(`Unable to load day-level activity routes (${activityResponse.status})`);
      const payloads = await Promise.all(
        responses.map(response => response.json().then(value => AdventureRoutes.normalizeCollection(value)))
      );
      payloads.push(await AdventureRoutes.normalizeCollection(activityRoutesToGeoJson(await activityResponse.json())));
      internal.mergeRouteCollections(payloads);
    } catch (error) {
      console.error(error);
    }
  });
})();
