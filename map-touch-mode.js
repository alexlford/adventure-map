(() => {
  'use strict';

  const map = window.AdventureMapRuntime?.leaflet;
  const panel = document.querySelector('.map-panel');
  if (!map || !panel) return;

  const style = document.createElement('style');
  style.textContent = `
    .map-touch-toggle{display:none}
    @media(max-width:820px) and (pointer:coarse){
      .map-panel.is-touch-passive #map{touch-action:pan-y}
      .map-panel.is-touch-active #map{touch-action:none}
      .map-touch-toggle{display:inline-flex;position:absolute;z-index:720;right:13px;top:13px;align-items:center;justify-content:center;min-height:38px;padding:8px 11px;border:1px solid rgba(255,255,255,.5);border-radius:999px;background:rgba(23,32,42,.82);box-shadow:0 8px 24px rgba(23,32,42,.18);color:#fff;font:inherit;font-size:.7rem;font-weight:850;letter-spacing:.01em;backdrop-filter:blur(9px);cursor:pointer}
      .map-touch-toggle:focus-visible{outline:3px solid rgba(255,255,255,.6);outline-offset:2px}
      .map-panel.is-touch-passive .leaflet-control-zoom{opacity:.42;pointer-events:none}
      .map-panel.is-touch-active .map-touch-toggle{background:rgba(255,255,255,.94);border-color:rgba(23,32,42,.14);color:#17202a}
      .map-panel.is-touch-passive:before{content:'Scroll the page normally · tap Explore map to pan + zoom';position:absolute;z-index:710;left:13px;bottom:13px;max-width:calc(100% - 26px);padding:7px 10px;border:1px solid rgba(255,255,255,.42);border-radius:999px;background:rgba(23,32,42,.78);box-shadow:0 7px 22px rgba(23,32,42,.15);color:#fff;font-size:.62rem;font-weight:750;line-height:1.2;pointer-events:none;backdrop-filter:blur(8px)}
    }
    @media(max-width:520px) and (pointer:coarse){
      .map-touch-toggle{top:11px;right:11px;min-height:36px;padding:7px 10px;font-size:.67rem}
      .map-panel.is-touch-passive:before{left:11px;bottom:11px;max-width:calc(100% - 22px);font-size:.59rem}
    }
  `;
  document.head.appendChild(style);

  const media = window.matchMedia('(max-width:820px) and (pointer:coarse)');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'map-touch-toggle';
  button.setAttribute('aria-controls', 'map');
  panel.appendChild(button);

  let active = false;
  const disable = handler => handler?.disable?.();
  const enable = handler => handler?.enable?.();

  function setActive(next) {
    active = Boolean(next && media.matches);
    panel.classList.toggle('is-touch-active', active);
    panel.classList.toggle('is-touch-passive', media.matches && !active);
    button.hidden = !media.matches;
    button.textContent = active ? 'Done' : 'Explore map';
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Finish interacting with map and return to page scrolling' : 'Enable map panning and zooming');

    if (media.matches && !active) {
      disable(map.dragging);
      disable(map.touchZoom);
      disable(map.doubleClickZoom);
      disable(map.boxZoom);
      disable(map.keyboard);
      disable(map.scrollWheelZoom);
    } else {
      enable(map.dragging);
      enable(map.touchZoom);
      enable(map.doubleClickZoom);
      enable(map.boxZoom);
      enable(map.keyboard);
      disable(map.scrollWheelZoom);
    }
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }

  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    setActive(!active);
  });

  media.addEventListener?.('change', () => setActive(false));
  window.addEventListener('orientationchange', () => setTimeout(() => setActive(false), 180), { passive: true });
  setActive(false);
})();
