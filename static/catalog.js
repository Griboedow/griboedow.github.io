(() => {
  const catalog = document.querySelector('[data-catalog]');
  if (!catalog) return;

  const filter = catalog.querySelector('[data-catalog-filter]');
  const input = filter.elements.q;
  const status = filter.querySelector('output');
  const normalize = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const nav = catalog.querySelector('.catalog-nav');
  const groups = [...catalog.querySelectorAll('.catalog-group')].map(section => ({
    section,
    navigationItem: nav.querySelector(`a[href="#${section.id}"]`).parentElement,
    count: section.querySelector('.catalog-count'),
    entries: [...section.querySelectorAll('[data-entry-path]')].map(item => ({
      item,
      searchText: normalize(`${item.textContent} ${item.dataset.entryPath}`),
    })),
  }));
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);

  function update() {
    const terms = normalize(input.value).trim().split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const { section, navigationItem, count, entries } of groups) {
      let matches = 0;
      for (const { item, searchText } of entries) {
        const matched = terms.every(term => searchText.includes(term));
        item.hidden = !matched;
        if (matched) matches++;
      }
      section.hidden = navigationItem.hidden = matches === 0;
      count.textContent = `(${matches})`;
      visible += matches;
    }
    nav.hidden = !visible;
    status.textContent = terms.length ? (visible ? `${visible} of ${total} entries` : 'No matching entries.') : '';
  }
  filter.addEventListener('submit', event => event.preventDefault());
  filter.addEventListener('input', update);
  filter.addEventListener('reset', event => {
    event.preventDefault();
    input.value = '';
    update();
    input.focus();
  });
  filter.hidden = false;
  update();
})();
