(() => {
  'use strict';

  const A = window.AdventureSite;
  const page = document.getElementById('page');
  if (!A || !page) return;

  const query = new URLSearchParams(location.search);
  const cleanMatch = location.pathname.match(/\/record\/([^/]+)\/?$/);
  const recordKey = query.get('record') || query.get('id') || (cleanMatch ? decodeURIComponent(cleanMatch[1]) : '');
  if (!recordKey) return;

  const mapHref = A.pageHref(`map.html?record=${encodeURIComponent(recordKey)}`);
  const apply = () => {
    const action = [...page.querySelectorAll('.record-actions a')].find(link => /Explore on map/i.test(link.textContent || ''));
    if (!action) return false;
    action.href = mapHref;
    action.setAttribute('aria-label','Explore this record on the full Adventure Map');
    return true;
  };

  if (apply()) return;
  const observer = new MutationObserver(() => {
    if (apply()) observer.disconnect();
  });
  observer.observe(page,{childList:true,subtree:true});
  setTimeout(() => observer.disconnect(),10000);
})();
