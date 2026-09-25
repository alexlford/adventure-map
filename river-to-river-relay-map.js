(() => {
  'use strict';

  const SERIES_SLUG = 'river-to-river-relay-series';
  const DATA_PATH = 'data/river-to-river-relay-legs.json';
  const ROUTE_PATH = 'data/historical-routes-v2.geojson';
  const DEFAULT_COLORS = ['#d97706', '#8b5cf6', '#1779a8'];

  const cleanMatch = location.pathname.match(/\/record\/([^/]+)\/?$/);
  const query = new URLSearchParams(location.search);
  const key = query.get('record') || query.get('id') || (cleanMatch ? decodeURIComponent(cleanMatch[1]) : '');
  if (key !== SERIES_SLUG && key !== 'river-to-river-relay-series-story') return;
  if (!window.L) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  const fetchJson = async path => {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.json();
  };

  const haversine = (a, b) => {
    const rad = Math.PI / 180;
    const lat1 = a[1] * rad;
    const lat2 = b[1] * rad;
    const dLat = (b[1] - a[1]) * rad;
    const dLon = (b[0] - a[0]) * rad;
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
    return 2 * 3958.7613 * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  function routeIndex(coordinates) {
    const cumulative = [0];
    for (let i = 1; i < coordinates.length; i += 1) {
      cumulative.push(cumulative[i - 1] + haversine(coordinates[i - 1], coordinates[i]));
    }
    return { cumulative, total: cumulative.at(-1) || 0 };
  }

  function pointAtDistance(coordinates, index, distance) {
    const target = Math.max(0, Math.min(index.total, distance));
    if (target <= 0) return coordinates[0].slice();
    if (target >= index.total) return coordinates.at(-1).slice();
    let i = 1;
    while (i < index.cumulative.length && index.cumulative[i] < target) i += 1;
    const start = coordinates[i - 1];
    const end = coordinates[i];
    const low = index.cumulative[i - 1];
    const high = index.cumulative[i];
    const t = high > low ? (target - low) / (high - low) : 0;
    return [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t
    ];
  }

  function sliceRoute(coordinates, index, startFraction, endFraction) {
    const startDistance = index.total * Math.max(0, Math.min(1, startFraction));
    const endDistance = index.total * Math.max(0, Math.min(1, endFraction));
    const points = [pointAtDistance(coordinates, index, startDistance)];
    for (let i = 1; i < coordinates.length - 1; i += 1) {
      const d = index.cumulative[i];
      if (d > startDistance && d < endDistance) points.push(coordinates[i].slice());
    }
    points.push(pointAtDistance(coordinates, index, endDistance));
    return points;
  }

  function cssColor(token, fallback) {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function yearColors(appearances) {
    const candidates = [
      cssColor('--activity-road-races', DEFAULT_COLORS[0]),
      cssColor('--activity-adventures', DEFAULT_COLORS[1]),
      cssColor('--activity-nordic', DEFAULT_COLORS[2])
    ];
    return new Map(appearances.map((appearance, index) => [appearance.year, candidates[index] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]]));
  }

  function legendHtml(appearances, colors) {
    const items = appearances.map(appearance => {
      const sections = appearance.sections.map(item => item.section).join(' · ');
      return `<div class="story-route-key-item" style="--route-color:${esc(colors.get(appearance.year))}"><span class="story-route-key-line" aria-hidden="true"></span><span><strong>${esc(appearance.year)}</strong><small>Runner ${esc(appearance.runner)} · Sections ${esc(sections)}</small></span></div>`;
    }).join('');
    return `<div class="story-route-key relay-leg-key" aria-label="River to River Relay year colors"><span class="story-route-key-label">My relay legs</span><div class="story-route-key-items">${items}</div></div>`;
  }

  async function render() {
    const section = document.querySelector('.detail-route-section');
    if (!section) return false;
    if (section.dataset.r2rLegOverlay === 'true') return true;

    const currentMap = section.querySelector('#detailMap');
    const emptyState = !currentMap ? section.querySelector('.empty') : null;
    const normalMapReady = currentMap?.classList.contains('leaflet-container');
    const emptyStateReady = Boolean(emptyState);
    if (!normalMapReady && !emptyStateReady) return false;

    const [legData, routeData] = await Promise.all([fetchJson(DATA_PATH), fetchJson(ROUTE_PATH)]);
    const feature = (routeData.features || []).find(item => item?.properties?.id === legData.courseFeatureId || item?.id === legData.courseFeatureId);
    const coordinates = feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : null;
    if (!coordinates?.length || coordinates.length < 2) throw new Error('River to River course geometry is unavailable.');

    const appearances = legData.appearances || [];
    const colors = yearColors(appearances);
    const index = routeIndex(coordinates);
    section.querySelector('#storyRouteKey')?.remove();
    section.querySelector('.relay-leg-key')?.remove();
    section.querySelector('.relay-leg-note')?.remove();

    const meta = section.querySelector('#routeMeta');
    if (meta) meta.textContent = 'The full 80-mile course with the legs I ran highlighted by year.';
    section.querySelector('h2')?.replaceChildren(document.createTextNode('The course'));

    const replacement = document.createElement('div');
    replacement.id = 'detailMap';
    replacement.className = 'detail-map has-composite-routes';
    replacement.setAttribute('aria-label', 'River to River Relay course with Alex Ford relay legs highlighted by year');

    const target = currentMap || emptyState;
    target.replaceWith(replacement);
    replacement.insertAdjacentHTML('beforebegin', legendHtml(appearances, colors));

    const note = document.createElement('p');
    note.className = 'card-meta relay-leg-note';
    note.textContent = 'The muted line is the full relay course. The colored sections are the legs I ran in each year.';
    replacement.insertAdjacentElement('afterend', note);

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const baseLatLngs = coordinates.map(([lon, lat]) => [lat, lon]);
    const initialBounds = L.latLngBounds(baseLatLngs);
    const initialCenter = initialBounds.getCenter();
    const map = L.map(replacement, {
      center: initialCenter,
      zoom: 9,
      scrollWheelZoom: false,
      worldCopyJump: true,
      zoomControl: true,
      preferCanvas: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false
    });

    let activeTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      updateWhenIdle: false,
      keepBuffer: 3
    }).addTo(map);

    let tileFallbackUsed = false;
    activeTiles.on('tileerror', () => {
      if (tileFallbackUsed) return;
      tileFallbackUsed = true;
      map.removeLayer(activeTiles);
      activeTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        updateWhenIdle: false,
        keepBuffer: 3
      }).addTo(map);
      activeTiles.on('load', () => map.invalidateSize({ pan: false }));
    });
    activeTiles.on('load', () => map.invalidateSize({ pan: false }));

    const renderer = L.canvas({ padding: 0.5 });
    const base = L.polyline(baseLatLngs, {
      renderer,
      color: cssColor('--muted', '#667085'),
      weight: 5,
      opacity: 0.42,
      dashArray: '8 6',
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(map);

    const courseDistance = Number(legData.courseDistanceMi) || 80;
    for (const appearance of appearances) {
      const color = colors.get(appearance.year);
      for (const segment of appearance.sections || []) {
        const line = sliceRoute(coordinates, index, segment.startMi / courseDistance, segment.endMi / courseDistance);
        const latLngs = line.map(([lon, lat]) => [lat, lon]);
        const layer = L.polyline(latLngs, {
          renderer,
          color,
          weight: 8,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
        const distance = (segment.endMi - segment.startMi).toFixed(2).replace(/0$/, '');
        layer.bindTooltip(`${appearance.year} · Runner ${appearance.runner} · Section ${segment.section} · ${distance} mi`, { sticky: true });
        layer.bringToFront();
      }
    }

    map.fitBounds(base.getBounds(), { padding: [28, 28], maxZoom: 10, animate: false });
    window.stabilizeLeafletMap?.(map, replacement);
    map.invalidateSize({ pan: false });
    setTimeout(() => map.invalidateSize({ pan: false }), 120);
    setTimeout(() => {
      map.invalidateSize({ pan: false });
      activeTiles.redraw?.();
    }, 450);

    section.dataset.r2rLegOverlay = 'true';
    return true;
  }

  let attempts = 0;
  const wait = () => {
    render().then(done => {
      if (done || attempts++ >= 240) return;
      setTimeout(wait, 50);
    }).catch(error => {
      console.warn('River to River relay leg overlay', error);
    });
  };
  wait();
})();
