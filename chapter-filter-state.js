window.AdventureFilterState = (() => {
  'use strict';

  function setup({param='view',allowed=[],fallback='all',onChange,selector='[data-filter]'}) {
    const valid = new Set(allowed);
    const buttons = [...document.querySelectorAll(selector)];
    const read = () => {
      const value = new URLSearchParams(location.search).get(param);
      return valid.has(value) ? value : fallback;
    };
    const reflect = value => {
      buttons.forEach(button => {
        const active = button.dataset.filter === value;
        button.classList.toggle('is-active',active);
        if (active) button.setAttribute('aria-pressed','true');
        else button.setAttribute('aria-pressed','false');
      });
    };
    const syncUrl = value => {
      const url = new URL(location.href);
      if (!value || value === fallback) url.searchParams.delete(param);
      else url.searchParams.set(param,value);
      history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`);
    };
    const apply = (value,{sync=true}={}) => {
      const next = valid.has(value) ? value : fallback;
      reflect(next);
      onChange?.(next);
      if (sync) syncUrl(next);
      return next;
    };

    buttons.forEach(button => button.addEventListener('click',() => apply(button.dataset.filter)));
    const initial = apply(read(),{sync:false});
    return {apply,get value(){return read();},initial};
  }

  return {setup};
})();
