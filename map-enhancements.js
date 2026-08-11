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

  function invalidate() {
    const m = window.adventureMap;
    if (m && typeof m.invalidateSize === 'function') m.invalidateSize({pan:false});
  }

  function placeMapForViewport() {
    if (!shell || !sidebar || !brand || !mapPanel) return;
    if (mobileQuery.matches) {
      if (mapPanel.parentElement !== sidebar || mapPanel.previousElementSibling !== brand) brand.insertAdjacentElement('afterend', mapPanel);
    } else if (mapPanel.parentElement !== shell) {
      if (desktopNext && desktopNext.parentNode === shell) shell.insertBefore(mapPanel, desktopNext);
      else shell.appendChild(mapPanel);
    }
    requestAnimationFrame(invalidate);
  }

  function refreshMapSize() {
    requestAnimationFrame(() => requestAnimationFrame(invalidate));
  }

  placeMapForViewport();
  window.addEventListener('load', () => { placeMapForViewport(); setTimeout(refreshMapSize, 120); setTimeout(refreshMapSize, 500); });
  window.addEventListener('resize', refreshMapSize, {passive:true});
  window.addEventListener('orientationchange', () => setTimeout(() => { placeMapForViewport(); refreshMapSize(); }, 180));
  mobileQuery.addEventListener?.('change', placeMapForViewport);
  window.visualViewport?.addEventListener('resize', refreshMapSize, {passive:true});
})();