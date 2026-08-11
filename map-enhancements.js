(() => {
  const originalPopupCard = window.popupCard;
  if (typeof originalPopupCard === 'function') {
    window.popupCard = function(adventure) {
      const html = originalPopupCard(adventure);
      const link = `<p class="popup-detail"><a href="detail.html?id=${encodeURIComponent(adventure.id)}">View full record →</a></p>`;
      return html.replace('</article>', `${link}</article>`);
    };
  }

  const shell = document.querySelector('.app-shell');
  const sidebar = document.querySelector('.sidebar');
  const brand = document.querySelector('.brand-block');
  const mapPanel = document.querySelector('.map-panel');
  const desktopNext = mapPanel?.nextSibling || null;
  const mobileQuery = window.matchMedia('(max-width: 820px)');

  function placeMapForViewport() {
    if (!shell || !sidebar || !brand || !mapPanel) return;
    if (mobileQuery.matches) {
      if (mapPanel.parentElement !== sidebar || mapPanel.previousElementSibling !== brand) brand.insertAdjacentElement('afterend', mapPanel);
    } else if (mapPanel.parentElement !== shell) {
      if (desktopNext && desktopNext.parentNode === shell) shell.insertBefore(mapPanel, desktopNext);
      else shell.appendChild(mapPanel);
    }
    requestAnimationFrame(() => {
      if (window.map && typeof window.map.invalidateSize === 'function') window.map.invalidateSize({pan:false});
    });
  }

  function refreshMapSize() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (window.map && typeof window.map.invalidateSize === 'function') window.map.invalidateSize({pan:false});
    }));
  }

  placeMapForViewport();
  window.addEventListener('load', () => { placeMapForViewport(); setTimeout(refreshMapSize, 120); setTimeout(refreshMapSize, 500); });
  window.addEventListener('resize', refreshMapSize, {passive:true});
  window.addEventListener('orientationchange', () => setTimeout(() => { placeMapForViewport(); refreshMapSize(); }, 180));
  mobileQuery.addEventListener?.('change', placeMapForViewport);
  window.visualViewport?.addEventListener('resize', refreshMapSize, {passive:true});
})();