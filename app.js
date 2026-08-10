const CATEGORY = {
  summit: { label: 'Summit', color: '#16836d' },
  marathon: { label: 'Marathon', color: '#e45d32' },
  relay: { label: 'Relay', color: '#7d4bb3' },
  nordic: { label: 'Nordic', color: '#1779a8' }
};

const state = {
  adventures: [],
  routes: null,
  filter: 'all',
  search: '',
  markers: new Map(),
  routeLayers: new Map()
};

const map = L.map('map', { worldCopyJump: true, zoomControl: true, minZoom: 2 }).setView([34, -112], 3);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const routeLayer = L.layerGroup().addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const searchInput = document.getElementById('searchInput');
const fitButton = document.getElementById('fitButton');
const adventureList = document.getElementById('adventureList');
const resultCount = document.getElementById('resultCount');

function categoryFor(adventure) {
  return adventure.kind === 'summit' ? 'summit' : adventure.discipline;
}
function mapped(adventure) {
  return Number.isFinite(adventure.lat) && Number.isFinite(adventure.lon);
}
function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}
function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(y, m - 1, d));
}
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function searchText(adventure) {
  return [
    adventure.name, adventure.currentName, adventure.year, adventure.date, adventure.location,
    adventure.region, adventure.distance, adventure.distanceMi, adventure.elevationFt,
    adventure.stravaActivityName, categoryFor(adventure)
  ].filter(Boolean).join(' ').toLowerCase();
}
function filteredAdventures() {
  const query = state.search.trim().toLowerCase();
  return state.adventures.filter((adventure) => {
    const passesFilter = state.filter === 'all' || categoryFor(adventure) === state.filter;
    const passesSearch = !query || searchText(adventure).includes(query);
    return passesFilter && passesSearch;
  });
}
function routeStatusLabel(adventure) {
  if (adventure.routeStatus === 'gps') return 'GPS route from Strava';
  if (adventure.routeStatus === 'withheld-privacy') return 'GPS verified · route withheld for privacy';
  if (adventure.kind === 'summit' && adventure.date) return 'Summit matched to Strava activity';
  if (adventure.coordinatePrecision === 'unmapped') return 'Location needed';
  return adventure.kind === 'summit' ? 'Summit coordinate' : 'Race location placeholder';
}
function popupCard(adventure) {
  const category = CATEGORY[categoryFor(adventure)];
  const primaryValue = adventure.kind === 'summit'
    ? `${formatNumber(adventure.elevationFt)} ft`
    : [adventure.year, adventure.distance].filter(Boolean).join(' · ');
  const alias = adventure.currentName ? `<p class="popup-alias">Now known as ${escapeHtml(adventure.currentName)}</p>` : '';
  const date = adventure.date ? `<p class="popup-meta">${escapeHtml(formatDate(adventure.date))}${adventure.endDate ? ` – ${escapeHtml(formatDate(adventure.endDate))}` : ''}</p>` : '';
  const metrics = adventure.distanceMi && adventure.stravaActivityId
    ? `<p class="popup-meta">Strava: ${escapeHtml(adventure.distanceMi)} mi${adventure.elevationGainM ? ` · ${escapeHtml(Math.round(adventure.elevationGainM))} m gain` : ''}${adventure.elapsedSeconds ? ` · ${escapeHtml(formatDuration(adventure.elapsedSeconds))} elapsed` : ''}</p>`
    : '';
  return `<article class="popup-card"><p class="popup-kicker">${escapeHtml(category.label)}</p><h3 class="popup-title">${escapeHtml(adventure.name)}</h3>${alias}<p class="popup-meta">${escapeHtml(primaryValue)}${primaryValue ? ' · ' : ''}${escapeHtml(adventure.location)}</p>${date}${metrics}<span class="popup-status">${escapeHtml(routeStatusLabel(adventure))}</span></article>`;
}
function coordinateKey(adventure) {
  return `${adventure.lat.toFixed(5)},${adventure.lon.toFixed(5)}`;
}
function renderMarkers(adventures) {
  markerLayer.clearLayers();
  state.markers.clear();
  const groups = new Map();
  adventures.filter(mapped).forEach((adventure) => {
    const key = coordinateKey(adventure);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(adventure);
  });
  groups.forEach((group) => {
    const first = group[0];
    const category = categoryFor(first);
    const sameCategory = group.every((item) => categoryFor(item) === category);
    const color = sameCategory ? CATEGORY[category].color : '#17202a';
    const marker = L.circleMarker([first.lat, first.lon], {
      radius: group.length > 1 ? 9 : 7,
      color: '#ffffff',
      weight: 2,
      fillColor: color,
      fillOpacity: 0.95
    });
    marker.bindPopup(group.map(popupCard).join(''), { maxWidth: 360 });
    marker.addTo(markerLayer);
    group.forEach((item) => state.markers.set(item.id, marker));
  });
}
function visibleRouteFeatures(adventures) {
  if (!state.routes) return [];
  const ids = new Set(adventures.map((a) => a.id));
  return state.routes.features.filter((feature) => feature.properties.adventureIds.some((id) => ids.has(id)));
}
function renderRoutes(adventures) {
  routeLayer.clearLayers();
  state.routeLayers.clear();
  visibleRouteFeatures(adventures).forEach((feature) => {
    const linked = feature.properties.adventureIds
      .map((id) => state.adventures.find((item) => item.id === id))
      .filter(Boolean);
    const category = feature.properties.category || categoryFor(linked[0]);
    const geo = L.geoJSON(feature, {
      style: {
        color: CATEGORY[category]?.color || '#17202a',
        weight: category === 'summit' ? 3 : 4,
        opacity: 0.78
      }
    }).addTo(routeLayer);
    if (linked.length) geo.bindPopup(linked.map(popupCard).join(''), { maxWidth: 360 });
    feature.properties.adventureIds.forEach((id) => {
      if (!state.routeLayers.has(id)) state.routeLayers.set(id, []);
      state.routeLayers.get(id).push(geo);
    });
  });
}
function itemMeta(adventure) {
  const parts = [];
  if (adventure.date) parts.push(formatDate(adventure.date));
  parts.push(adventure.location);
  if (adventure.currentName) parts.push(`now ${adventure.currentName}`);
  if (adventure.routeStatus === 'gps') parts.push('GPS route');
  if (adventure.routeStatus === 'withheld-privacy') parts.push('GPS verified');
  if (!mapped(adventure)) parts.push('location needed');
  return parts.filter(Boolean).join(' · ');
}
function itemValue(adventure) {
  if (adventure.kind === 'summit') return `${formatNumber(adventure.elevationFt)}′`;
  if (adventure.distanceMi && adventure.stravaActivityId) return `${adventure.distanceMi} mi`;
  return [adventure.year, adventure.distance].filter(Boolean).join(' · ');
}
function focusAdventure(adventure) {
  const routeGroups = state.routeLayers.get(adventure.id) || [];
  if (routeGroups.length) {
    const bounds = L.latLngBounds([]);
    routeGroups.forEach((group) => group.eachLayer((layer) => {
      if (layer.getBounds) bounds.extend(layer.getBounds());
    }));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [46, 46], maxZoom: 13 });
    routeGroups[0].openPopup?.();
    return;
  }
  if (mapped(adventure)) {
    map.flyTo([adventure.lat, adventure.lon], Math.max(map.getZoom(), adventure.kind === 'summit' ? 9 : 8), { duration: 0.8 });
    state.markers.get(adventure.id)?.openPopup();
  }
}
function renderList(adventures) {
  resultCount.textContent = `${adventures.length} shown`;
  adventureList.innerHTML = '';
  adventures.slice().sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'summit' ? -1 : 1;
    if (a.kind === 'summit') return (b.elevationFt ?? 0) - (a.elevationFt ?? 0);
    return (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name);
  }).forEach((adventure) => {
    const category = categoryFor(adventure);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `adventure-item${mapped(adventure) ? '' : ' is-unmapped'}`;
    button.innerHTML = `<span class="item-dot" style="background:${CATEGORY[category].color}"></span><span><span class="item-title">${escapeHtml(adventure.name)}</span><span class="item-meta">${escapeHtml(itemMeta(adventure))}</span></span><span class="item-value">${escapeHtml(itemValue(adventure))}</span>`;
    if (mapped(adventure) || state.routeLayers.has(adventure.id)) button.addEventListener('click', () => focusAdventure(adventure));
    adventureList.appendChild(button);
  });
}
function fitVisible(adventures) {
  const bounds = L.latLngBounds([]);
  adventures.filter(mapped).forEach((item) => bounds.extend([item.lat, item.lon]));
  visibleRouteFeatures(adventures).forEach((feature) => {
    feature.geometry.coordinates.forEach(([lon, lat]) => bounds.extend([lat, lon]));
  });
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [38, 38], maxZoom: 8 });
}
function render() {
  const adventures = filteredAdventures();
  renderRoutes(adventures);
  renderMarkers(adventures);
  renderList(adventures);
}

document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
  render();
  fitVisible(filteredAdventures());
}));
searchInput.addEventListener('input', () => { state.search = searchInput.value; render(); });
searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') fitVisible(filteredAdventures()); });
fitButton.addEventListener('click', () => fitVisible(filteredAdventures()));

async function init() {
  try {
    const [adventureResponse, stravaResponse, routeResponse] = await Promise.all([
      fetch('data/adventures.json'),
      fetch('data/strava-matches.json'),
      fetch('data/routes.geojson')
    ]);
    if (!adventureResponse.ok) throw new Error(`Unable to load adventure data (${adventureResponse.status})`);
    if (!stravaResponse.ok) throw new Error(`Unable to load Strava match data (${stravaResponse.status})`);
    if (!routeResponse.ok) throw new Error(`Unable to load route data (${routeResponse.status})`);
    const [adventurePayload, stravaPayload, routePayload] = await Promise.all([
      adventureResponse.json(), stravaResponse.json(), routeResponse.json()
    ]);
    state.adventures = adventurePayload.adventures.map((adventure) => ({
      ...adventure,
      ...(stravaPayload.matches[adventure.id] || {})
    }));
    state.routes = routePayload;
    document.getElementById('summitCount').textContent = state.adventures.filter((item) => item.kind === 'summit').length;
    document.getElementById('raceCount').textContent = state.adventures.filter((item) => item.kind === 'race').length;
    document.getElementById('routeCount').textContent = new Set(routePayload.features.flatMap((feature) => feature.properties.adventureIds)).size;
    render();
    fitVisible(state.adventures);
  } catch (error) {
    adventureList.innerHTML = `<p>Adventure data could not be loaded. ${escapeHtml(error.message)}</p>`;
    console.error(error);
  }
}
init();
