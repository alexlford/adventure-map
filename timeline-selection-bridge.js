(() => {
  'use strict';

  const A = window.AdventureSite;
  if (!A) return;

  const params = new URLSearchParams(location.search);
  const ids = [...new Set((params.get('selection') || '').split(',').map(value => value.trim()).filter(Boolean))];
  if (!ids.length) return;

  const selected = new Set(ids);
  const originalLoad = A.load;
  A.load = async () => (await originalLoad()).filter(record => selected.has(record.id));

  function ensureStyle() {
    if (document.getElementById('timelineSelectionBridgeStyle')) return;
    const style = document.createElement('style');
    style.id = 'timelineSelectionBridgeStyle';
    style.textContent = `
      .archive-source-context{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:10px 13px;border:1px solid color-mix(in srgb,var(--accent) 18%,var(--line));border-radius:12px;background:rgba(255,255,255,.55)}
      .archive-source-context span{font-size:.78rem;font-weight:800;color:var(--ink)}
      .archive-source-context a{font-size:.72rem;font-weight:800;color:var(--accent);text-decoration:none}
      @media(max-width:560px){.archive-source-context{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function restoreMapLinkSelection() {
    const link = document.getElementById('timelineMapLink');
    if (!link) return;
    const url = new URL(link.getAttribute('href') || 'map.html', location.href);
    if (url.searchParams.has('selection')) return;
    url.searchParams.set('selection', ids.join(','));
    url.searchParams.set('source', 'timeline');
    link.setAttribute('href', `${url.pathname}${url.search}${url.hash}`);
  }

  function mountContext() {
    if (document.querySelector('.archive-source-context')) return;
    const resultBar = document.querySelector('.archive-result-bar');
    if (!resultBar) return;
    ensureStyle();
    const source = params.get('source') === 'map' ? 'Map selection' : 'Selected archive set';
    const wrap = document.createElement('div');
    wrap.className = 'archive-source-context';
    wrap.innerHTML = `<span>${source} · ${ids.length} record${ids.length === 1 ? '' : 's'}</span><a href="${location.pathname}">Show full timeline →</a>`;
    resultBar.insertAdjacentElement('beforebegin', wrap);
  }

  const summary = document.getElementById('timelineResultSummary');
  if (summary) new MutationObserver(() => restoreMapLinkSelection()).observe(summary, { childList: true, subtree: true, characterData: true });

  document.getElementById('timelineReset')?.addEventListener('click', event => {
    event.preventDefault();
    location.assign(location.pathname);
  }, { capture: true });

  mountContext();
  restoreMapLinkSelection();
})();
