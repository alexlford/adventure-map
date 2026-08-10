(() => {
  const originalPopupCard = window.popupCard;
  if (typeof originalPopupCard === 'function') {
    window.popupCard = function(adventure) {
      const html = originalPopupCard(adventure);
      const link = `<p class="popup-detail"><a href="detail.html?id=${encodeURIComponent(adventure.id)}">View full record →</a></p>`;
      return html.replace('</article>', `${link}</article>`);
    };
  }
})();