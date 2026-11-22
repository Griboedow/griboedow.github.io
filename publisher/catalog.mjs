const titleOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function escape(text) {
  return String(text).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function words(name) {
  const text = name.replace(/[-_]+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fallbackTitle(path) {
  const parts = path.split('/');
  const file = parts.pop().replace(/\.[^.]+$/, '');
  return words(file.toLowerCase() === 'readme' ? parts.pop() || 'Overview' : file);
}

const chuaHtml = {
  'results/chua-knot-atlas/knot-atlas.html': 'Knot atlas',
  'results/chua-layer-atlas/atlas.html': 'Periodic-window layer atlas',
  'results/chua-layer-atlas/family-gallery.html': 'Orbit family gallery',
  'results/chua-layer-cards/cards.html': 'Illustrated family cards',
  'results/chua-link-search/linked-pairs.html': 'Linked orbit pairs',
  'results/chua-linked-attractors/linked-attractors.html': 'Linked attractors',
  'results/chua-overlap-geometry/guide.html': 'Overlap geometry guide',
  'results/chua-slope-volumes/volumes.html': 'Diode slope volumes',
};

// These reports are first-party output. HTML viewers and browser applications
// elsewhere in the source trees can depend on data files or a running server.
export function catalogSupplements(project, paths) {
  const repo = project.repo.split('/').pop();
  const entries = [];
  for (const path of paths) {
    let title;
    if (repo === 'chua-gpu-atlas' && /^results\/chua-[^/]+\/[^/]+\.html$/.test(path)) {
      title = chuaHtml[path] || words(path.split('/').pop().replace(/\.html$/, ''));
    }
    if (repo === 'math-models') {
      if (path === 'vehicles/toy-physics/reports/report.html') title = 'Trike MINI vehicle physics report';
      if (/^yarn\/stand-simulator\/results\/.+\/report\.html$/.test(path)) {
        const sections = path.split('/').slice(3, -1);
        title = sections.map(words).join(' · ');
      }
    }
    if (title) {
      const source = path.split('/').map(encodeURIComponent).join('/');
      entries.push({
        path, title,
        url: `https://github.com/Griboedow/${repo}/blob/${encodeURIComponent(project.branch || 'main')}/${source}`,
        format: 'HTML source',
      });
    }
  }
  return entries;
}

const groups = new Map([
  ['overview', 'Project overview'],
  ['yarn', 'Rotating yarn stands'],
  ['vehicles', 'Printed toy vehicles'],
  ['chua', 'Circuit studies and methods'],
  ['motors', 'Molecular motors'],
  ['algorithms', 'Numerical algorithms'],
  ['geometry', 'Attractor geometry and dynamics'],
  ['studies', 'Research articles and methods'],
  ['results', 'Results and supporting evidence'],
  ['supplements', 'Illustrated reports and interactive atlases'],
  ['references', 'Code, data and project notes'],
]);

function groupFor(repo, entry) {
  const { path } = entry;
  if (entry.format === 'HTML report' || entry.format === 'HTML source') return 'supplements';
  if (['README.md', 'docs/README.md', 'docs/research-index.md', 'docs/research-guide.md'].includes(path)) return 'overview';
  if (path.startsWith('yarn/')) return 'yarn';
  if (path.startsWith('vehicles/')) return 'vehicles';
  if (path.startsWith('results/')) return 'results';
  if (!path.startsWith('docs/')) return 'references';
  if (repo === 'chua-gpu-atlas') return 'chua';
  if (/^docs\/(motor-|replication-instability\/)/.test(path)) return 'motors';
  if (/^docs\/(ada(belief|delta|max)|anderson-|coupled-operators-|cyclic-raar|fastica-|raar-|rk(23|45)-|scalar-optimizer-|sinkhorn-|yogi-)/.test(path)) return 'algorithms';
  if (/^docs\/(attractor-|canonical-sphere|chaotic-forms|gaussian-vortex|geometry-search|icosahedral-|polyhedral-|product-alphabet|shape-search|soft-(constellation|sphere|symbolic)|spherical-constellation|tetrahedral-)/.test(path)) return 'geometry';
  return 'studies';
}

export function renderCatalog(project, entries) {
  const repo = project.repo.split('/').pop();
  const grouped = new Map();
  const nameCounts = new Map();
  for (const entry of entries) {
    const title = entry.title?.trim() || fallbackTitle(entry.path);
    const name = title.toLowerCase();
    const id = groupFor(repo, entry);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push({ ...entry, title });
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }

  const sections = [];
  const menu = [];
  for (const [id, heading] of groups) {
    const items = grouped.get(id);
    if (!items?.length) continue;
    items.sort((a, b) => titleOrder.compare(a.title, b.title) || titleOrder.compare(a.path, b.path));
    const list = items.map(({ path, title, url }) => {
      const context = nameCounts.get(title.toLowerCase()) > 1
        ? ` <small class="catalog-context">${escape(path)}</small>` : '';
      return `<li data-entry-path="${escape(path)}"><a href="${escape(url)}">${escape(title)}${context}</a></li>`;
    }).join('\n');
    sections.push(`<section class="catalog-group" id="${id}" aria-labelledby="${id}-heading">
      <h2 id="${id}-heading">${heading} <span class="catalog-count">(${items.length})</span></h2>
      <ul class="catalog-list">${list}</ul>
    </section>`);
    menu.push(`<li><a href="#${id}">${heading}</a></li>`);
  }

  const description = project.description ? `<p class="lead">${escape(project.description)}</p>` : '';
  return `<div class="catalog" data-catalog>
    <header class="study-head catalog-head">
      <h1>All studies</h1>
      ${description}
    </header>
    <form class="catalog-filter" role="search" data-catalog-filter hidden>
      <label for="catalog-search">Filter this catalog</label>
      <input id="catalog-search" name="q" type="search" placeholder="Title or source path" autocomplete="off">
      <button type="reset">Clear</button>
      <output for="catalog-search" role="status" aria-live="polite"></output>
    </form>
    <nav class="catalog-nav" aria-label="Catalog sections"><ul>${menu.join('')}</ul></nav>
    ${sections.join('\n')}
  </div>
  <script defer src="/catalog.js"></script>`;
}
