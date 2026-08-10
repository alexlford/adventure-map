const CATEGORY = {
  summit: { label: 'Summit', color: '#16836d' },
  marathon: { label: 'Marathon', color: '#e45d32' },
  relay: { label: 'Relay', color: '#7d4bb3' },
  nordic: { label: 'Nordic', color: '#1779a8' }
};

const state = { adventures: [], filter: 'all', search: '', markers: new Map() };

const map = L.map('map', { worldCopyJump: true, zoomControl: true, minZoom: 2 }).setView([34, -112], 3);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const searchInput = document.getElementById('searchInput');
const fitButton = document.getElementById('fitButton');
const adventureList = document.getElementById('adventureList');
const resultCount = document.getElementById('resultCount');

function categoryFor(adventure) { return adventure.kind === 'summit' ? 'summit' : adventure.discipline; }
function mapped(adventure) { return Number.isFinite(adventure.lat) && Number.isFinite(adventure.lon); }
function formatNumber(value) { return new Intl.NumberFormat('en-US').format(value); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function searchText(adventure) { return [adventure.name, adventure.currentName, adventure.year, adventure.location, adventure.region, adventure.distance, adventure.elevationFt, categoryFor(adventure)].filter(Boolean).join(' ').toLowerCase(); }
function filteredAdventures() {
  const query = state.search.trim().toLowerCase();
  return state.adventures.filter((adventure) => {
    const passesFilter = state.filter === 'all' || categoryFor(adventure) === state.filter;
    const passesSearch = !query || searchText(adventure).includes(query);
    return passesFilter && passesSearch;
  });
}
function popupCard(adventure) {
  const category = CATEGORY[categoryFor(adventure)];
  const primaryValue = adventure.kind === 'summit' ? `${formatNumber(adventure.elevationFt)} ft` : [adventure.year, adventure.distance].filter(Boolean).join(' · ');
  const alias = adventure.currentName ? `<p class="popup-alias">Now known as ${escapeHtml(adventure.currentName)}</p>` : '';
  const status = adventure.kind === 'summit' ? 'Summit coordinate' : adventure.coordinatePrecision === 'unmapped' ? 'Location needed' : 'Race location placeholder · GPX pending';
  return `<article class="popup-card"><p class="popup-kicker">${escapeHtml(category.label)}</p><h3 class="popup-title">${escapeHtml(adventure.name)}</h3>${alias}<p class="popup-meta">${escapeHtml(primaryValue)}${primaryValue ? ' · ' : ''}${escapeHtml(adventure.location)}</p><span class="popup-status">${escapeHtml(status)}</span></article>`;
}
function coordinateKey(adventure) { return `${adventure.lat.toFixed(5)},${adventure.lon.toFixed(5)}`; }
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
    const marker = L.circleMarker([first.lat, first.lon], { radius: group.length > 1 ? 9 : 7, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 0.95 });
    marker.bindPopup(group.map(popupCard).join(''), { maxWidth: 340 });
    marker.addTo(markerLayer);
    group.forEach((item) => state.markers.set(item.id, marker));
  });
}
function itemMeta(adventure) {
  if (adventure.kind === 'summit') return `${adventure.location}${adventure.currentName ? ` · now ${adventure.currentName}` : ''}`;
  return `${adventure.location}${mapped(adventure) ? '' : ' · location needed'}`;
}
function itemValue(adventure) { return adventure.kind === 'summit' ? `${formatNumber(adventure.elevationFt)}′` : [adventure.year, adventure.distance].filter(Boolean).join(' · '); }
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
    if (mapped(adventure)) button.addEventListener('click', () => { map.flyTo([adventure.lat, adventure.lon], Math.max(map.getZoom(), adventure.kind === 'summit' ? 9 : 8), { duration: 0.8 }); state.markers.get(adventure.id)?.openPopup(); });
    adventureList.appendChild(button);
  });
}
function fitVisible(adventures) {
  const points = adventures.filter(mapped).map((item) => [item.lat, item.lon]);
  if (!points.length) return;
  map.fitBounds(L.latLngBounds(points), { padding: [38, 38], maxZoom: 8 });
}
function render() { const adventures = filteredAdventures(); renderMarkers(adventures); renderList(adventures); }
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('is-active', item === button)); render(); fitVisible(filteredAdventures()); }));
searchInput.addEventListener('input', () => { state.search = searchInput.value; render(); });
searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') fitVisible(filteredAdventures()); });
fitButton.addEventListener('click', () => fitVisible(filteredAdventures()));

async function init() {
  try {
    const response = await fetch('data/adventures.json');
    if (!response.ok) throw new Error(`Unable to load adventure data (${response.status})`);
    const payload = await response.json();
    state.adventures = payload.adventures;
    document.getElementById('summitCount').textContent = state.adventures.filter((item) => item.kind === 'summit').length;
    document.getElementById('raceCount').textContent = state.adventures.filter((item) => item.kind === 'race').length;
    document.getElementById('mappedCount').textContent = state.adventures.filter(mapped).length;
    render();
    fitVisible(state.adventures);
  } catch (error) {
    adventureList.innerHTML = `<p>Adventure data could not be loaded. ${escapeHtml(error.message)}</p>`;
    console.error(error);
  }
}
init();
