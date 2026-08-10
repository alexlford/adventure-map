CATEGORY.adventure = { label: 'Challenge / Trek', color: '#8b5cf6' };

const baseCategoryFor = categoryFor;
categoryFor = function(adventure) {
  if (adventure.kind === 'adventure') return 'adventure';
  return baseCategoryFor(adventure);
};

window.addEventListener('load', async () => {
  try {
    const response = await fetch('data/notable-adventures.json');
    if (!response.ok) throw new Error(`Unable to load notable adventures (${response.status})`);
    const payload = await response.json();
    const existingIds = new Set(state.adventures.map((item) => item.id));
    payload.adventures.forEach((item) => {
      if (!existingIds.has(item.id)) state.adventures.push(item);
    });

    const filterRow = document.querySelector('.filter-row');
    if (filterRow && !filterRow.querySelector('[data-filter="adventure"]')) {
      const button = document.createElement('button');
      button.className = 'filter-button';
      button.type = 'button';
      button.dataset.filter = 'adventure';
      button.textContent = 'Challenges / Treks';
      button.addEventListener('click', () => {
        state.filter = 'adventure';
        document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
        render();
        fitVisible(filteredAdventures());
      });
      filterRow.appendChild(button);
    }

    const legend = document.querySelector('.legend');
    if (legend && !legend.querySelector('.adventure-legend')) {
      const item = document.createElement('span');
      item.className = 'adventure-legend';
      item.innerHTML = '<i class="legend-dot" style="background:#8b5cf6"></i> Challenge / Trek';
      legend.appendChild(item);
    }

    render();
  } catch (error) {
    console.error(error);
  }
});