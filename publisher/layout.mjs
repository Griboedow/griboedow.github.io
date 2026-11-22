export const site = 'https://griboedow.github.io';

export function escape(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

export const names = {
  'chua-gpu-atlas': 'Chua GPU Atlas',
  'chaos-attractor-lab': 'Chaos Attractor Lab',
  'math-models': 'Mathematical Models'
};

export function catalogUrl(repo) { return '/research/' + repo + '/'; }

export function documentUrl(repo, path) {
  return catalogUrl(repo) + path.split('/').map(encodeURIComponent).join('/').replace(/\.(md|markdown)$/i, '.html');
}

export function layout({ title, description, url, body, math = false, type = 'website', image, index = true }) {
  const fullTitle = title + ' · Nikolai Kochkin';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(fullTitle)}</title>
<meta name="description" content="${escape(description)}">
${index ? '<link rel="canonical" href="' + site + escape(url) + '">' : '<meta name="robots" content="noindex">'}
<meta property="og:title" content="${escape(fullTitle)}"><meta property="og:description" content="${escape(description)}">
<meta property="og:type" content="${type}"><meta property="og:url" content="${site}${escape(url)}">
${image ? '<meta property="og:image" content="' + site + escape(image) + '">' : ''}
<link rel="stylesheet" href="/assets/site.css">
${math ? '<link rel="stylesheet" href="/assets/katex/katex.min.css">' : ''}
</head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="mast"><div class="frame"><a href="/" class="brand"><span class="brand-mark" aria-hidden="true">∿</span>Research notes</a>
<nav aria-label="Main"><a href="/#projects">Projects</a><a href="https://github.com/Griboedow">GitHub</a></nav></div></header>
<main id="main">${body}</main>
<footer class="foot"><div class="frame"><span>Nikolai Kochkin · Research notes</span><a href="https://github.com/Griboedow/griboedow.github.io">Site source</a></div></footer>
</body></html>\n`;
}

const readingPaths = {
  'chua-gpu-atlas': ['docs/chua-knot-atlas.md', 'docs/chua-hidden-infinity-certificate.md'],
  'chaos-attractor-lab': ['docs/chaotic-forms-20261122.md', 'results/art_20261122/README.md', 'docs/icosahedral-flow.md'],
  'math-models': ['vehicles/toy-physics/README.md']
};

export function home(projects, illustrations) {
  const banner = illustrations[0];
  const figure = banner ? `<figure class="hero-figure"><a href="${documentUrl(banner.repo,banner.path)}">
    <img fetchpriority="high" src="${banner.image}" alt="${escape(banner.alt)}"></a>
    <figcaption><a href="${documentUrl(banner.repo,banner.path)}">${escape(names[banner.repo])} · View study</a></figcaption></figure>` : '';
  const cards = projects.map(project => {
    const art = illustrations.find(item => item.repo === project.repo);
    const selected = [art?.path, ...(readingPaths[project.repo] || [])].filter(p => project.entries.has(p));
    const links = selected.map(path => {
      const entry = project.entries.get(path);
      return `<li><a href="${entry.url}">${escape(entry.title)}</a></li>`;
    }).join('');
    return `<section class="project-card"><div class="card-art ${project.repo}">
      ${art ? '<a href="' + documentUrl(art.repo,art.path) + '" tabindex="-1" aria-hidden="true"><img loading="lazy" src="' + art.image + '" alt=""></a>' : ''}
      </div><div class="card-body"><h3><a href="${catalogUrl(project.repo)}">${escape(project.title)}</a></h3>
      <ul>${links}</ul><a class="catalog-link" href="${catalogUrl(project.repo)}">Full catalog <span>(${project.entries.size})</span></a></div></section>`;
  }).join('');
  const body = `<div class="hero-wrap"><section class="hero frame">
    <div class="hero-copy"><p class="kicker">Nikolai Kochkin</p><h1>Mathematics<br><em>in motion</em></h1>
    <p class="intro">Research on chaotic attractors, nonlinear circuits and the mechanics of 3D-printed designs. Read the studies, inspect the data and run the calculations.</p>
    <a class="button" href="#projects">Browse the research</a></div>${figure}</section></div>
    <section class="projects frame" id="projects"><div class="section-head"><h2>Research projects</h2>
    <p>Selected studies and the complete catalog for each project.</p></div><div class="cards">${cards}</div></section>`;
  return layout({title:'Mathematical research on attractors, circuits and mechanics',description:'Explore reproducible studies of chaotic attractors, Chua’s circuit and mechanical models for 3D-printed designs by Nikolai Kochkin.',url:'/',image:banner?.image,body});
}
