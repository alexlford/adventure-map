window.AdventureChapterIndexState = (() => {
  'use strict';

  let cleanup = () => {};

  function mount(nav, headings) {
    cleanup();
    if (!nav || !Array.isArray(headings) || !headings.length) return;

    const links = new Map(
      [...nav.querySelectorAll('a[href^="#"]')]
        .map(link => [decodeURIComponent(link.getAttribute('href').slice(1)),link])
        .filter(([id]) => id)
    );
    const targets = headings.filter(heading => heading?.id && links.has(heading.id));
    if (!targets.length) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    let activeId = '';
    let frame = 0;
    const setActive = id => {
      if (!id || id === activeId || !links.has(id)) return;
      activeId = id;
      links.forEach((link,key) => {
        const current = key === id;
        link.classList.toggle('is-current',current);
        if (current) link.setAttribute('aria-current','location');
        else link.removeAttribute('aria-current');
      });
      const active = links.get(id);
      active?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:reducedMotion?'auto':'smooth'});
    };

    const update = () => {
      frame = 0;
      const activationLine = Math.min(window.innerHeight * .32, 280);
      let current = targets[0];
      for (const target of targets) {
        if (target.getBoundingClientRect().top <= activationLine) current = target;
        else break;
      }
      setActive(current.id);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    const onHashChange = () => {
      const id = decodeURIComponent(location.hash.replace(/^#/,''));
      if (links.has(id)) setActive(id);
      else schedule();
    };

    nav.addEventListener('click',event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      if (links.has(id)) setActive(id);
    });
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('hashchange',onHashChange);

    const initialHash = decodeURIComponent(location.hash.replace(/^#/,''));
    if (links.has(initialHash)) setActive(initialHash);
    else update();

    cleanup = () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll',schedule);
      window.removeEventListener('resize',schedule);
      window.removeEventListener('hashchange',onHashChange);
      cleanup = () => {};
    };
  }

  return {mount};
})();
