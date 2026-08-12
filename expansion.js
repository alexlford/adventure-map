const MTB_GREEN = '#2f7d4a';
CATEGORY.mtb = { ...CATEGORY.mtb, color: MTB_GREEN };
CATEGORY.road = { label: 'Road race', color: '#d97706' };
CATEGORY.trail = { label: 'Trail race', color: '#b45309' };
CATEGORY['mountain-bike'] = { label: 'Mountain bike race', color: '#2f7d4a' };

// The shared Leaflet theme predates the forest-green MTB palette. Keep the master
// map authoritative here so archive dots, route lines, focused endpoints, and the
// legend all use the same MTB color without affecting the other activity colors.
if (window.AdventureMapTheme?.routeColor) {
  const priorRouteColor = window.AdventureMapTheme.routeColor;
  window.AdventureMapTheme.routeColor = record => {
    const isMtb = record?.discipline === 'mountain-bike' || record?.mapCategory === 'mountain-bike' || record?.mapCategory === 'downhill-mtb';
    return isMtb ? MTB_GREEN : priorRouteColor(record);
  };
}
document.querySelectorAll('.legend span').forEach(item => {
  if (item.textContent.trim() === 'MTB') item.querySelector('.legend-dot')?.style.setProperty('background', MTB_GREEN);
});

function updateRouteCount() {
  const routeCount = document.getElementById('routeCount');
  if (!routeCount || !state.routes) return;
  routeCount.textContent = new Set(state.routes.features.flatMap(feature => feature.properties?.adventureIds || [])).size;
}

function mergeSupplementalRoutes(payloads, attempt = 0) {
  if (state.routes) {
    const existing = new Set(state.routes.features.map(feature => feature.id || feature.properties?.featureId || feature.properties?.id));
    payloads.flatMap(payload => payload.features || []).forEach(feature => {
      const id = feature.id || feature.properties?.featureId || feature.properties?.id;
      if (!existing.has(id)) {
        state.routes.features.push(feature);
        existing.add(id);
      }
    });
    updateRouteCount();
    renderPreservingFocus();
    return;
  }
  if (attempt < 40) setTimeout(() => mergeSupplementalRoutes(payloads, attempt + 1), 100);
}

function decodePolyline(encoded) {
  let index=0, lat=0, lon=0, coordinates=[];
  while(index<encoded.length){
    let result=0,shift=0,b;
    do{b=encoded.charCodeAt(index++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
    lat += (result&1)?~(result>>1):(result>>1);
    result=0;shift=0;
    do{b=encoded.charCodeAt(index++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
    lon += (result&1)?~(result>>1):(result>>1);
    coordinates.push([lon/1e5,lat/1e5]);
  }
  return coordinates;
}

function activityRoutesToGeoJson(payload){
  return {
    type:'FeatureCollection',
    features:(payload.routes||[]).map(route=>{
      const lines=(route.lines||[]).map(decodePolyline);
      return {
        type:'Feature',
        id:route.id,
        properties:{featureId:route.id,adventureIds:route.adventureIds||[],provenance:'personal-gps',category:route.category,source:'Strava GPS export',mtbMode:route.mtbMode||null},
        geometry:lines.length===1?{type:'LineString',coordinates:lines[0]}:{type:'MultiLineString',coordinates:lines}
      };
    })
  };
}

window.addEventListener('load', async () => {
  try {
    const urls=['data/mined-routes.geojson','data/historical-routes-v2.geojson','data/event-routes.geojson'];
    const [responses,activityResponse]=await Promise.all([Promise.all(urls.map(url=>fetch(url))),fetch('data/activity-route-polylines.json')]);
    responses.forEach((response,i)=>{if(!response.ok)throw new Error(`Unable to load supplemental routes ${urls[i]} (${response.status})`)});
    if(!activityResponse.ok)throw new Error(`Unable to load day-level activity routes (${activityResponse.status})`);
    const payloads=await Promise.all(responses.map(response=>response.json().then(x=>AdventureRoutes.normalizeCollection(x))));
    payloads.push(await AdventureRoutes.normalizeCollection(activityRoutesToGeoJson(await activityResponse.json())));
    mergeSupplementalRoutes(payloads);
  } catch (error) { console.error(error); }
});
