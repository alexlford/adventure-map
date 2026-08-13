(() => {
  'use strict';

  const runtime = window.AdventureMapRuntime;
  const internal = runtime?.internal;
  if (!runtime || !internal) return;

  const resultCount = document.getElementById('resultCount');
  const results = document.querySelector('.results-section');
  if (results) results.removeAttribute('aria-live');
  if (resultCount) {
    resultCount.setAttribute('role', 'status');
    resultCount.setAttribute('aria-live', 'polite');
    resultCount.setAttribute('aria-atomic', 'true');
  }

  function decorateMarkers() {
    internal.markerGroups().forEach(({ marker, ids }) => {
      const node = marker.getElement?.();
      if (!node) return;
      const records = internal.recordsByIds(ids);
      const cluster = Boolean(marker.__adventureCluster);
      const label = cluster
        ? `Zoom into ${records.length} nearby adventure records`
        : records.length > 1
          ? `Open ${records.length} adventure records at this location`
          : records[0]?.name || 'Open map details';
      node.setAttribute('aria-label', label);
      if (node.dataset.adventureKeyboard === 'true') return;
      node.dataset.adventureKeyboard = 'true';
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-keyshortcuts', 'Enter Space');
      node.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        marker.fire?.('click');
        if (!cluster) marker.openPopup?.();
      });
      node.addEventListener('focus', () => marker.fire?.('mouseover'));
      node.addEventListener('blur', () => marker.fire?.('mouseout'));
    });
  }

  function decorateArchive() {
    const current = runtime.snapshot();
    document.querySelectorAll('.adventure-item').forEach(button => {
      const active = Boolean(current.focusId) && button.dataset.id === current.focusId;
      button.setAttribute('aria-controls', 'map');
      button.setAttribute('aria-pressed', String(active));
      if (button.classList.contains('is-unmapped')) {
        button.setAttribute('aria-disabled', 'true');
        if (!button.title) button.title = 'No public map location or route is available for this record.';
      } else {
        button.removeAttribute('aria-disabled');
      }
    });
  }

  function decorate() {
    decorateMarkers();
    decorateArchive();
  }

  const mapNode = document.getElementById('map');
  if (mapNode) {
    mapNode.setAttribute('aria-label', 'Adventure map. Use Tab to move through interactive routes and locations, then press Enter or Space for details.');
    const observer = new MutationObserver(() => requestAnimationFrame(decorate));
    observer.observe(mapNode, { childList: true, subtree: true });
  }
  const listNode = document.getElementById('adventureList');
  if (listNode) {
    const observer = new MutationObserver(() => requestAnimationFrame(decorateArchive));
    observer.observe(listNode, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  requestAnimationFrame(decorate);
})();
