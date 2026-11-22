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

export function projectUrl(repo) { return '/research/' + repo + '/'; }

export function catalogUrl(repo) { return projectUrl(repo) + 'catalog/'; }

export function documentUrl(repo, path) {
  if (path === 'README.md') return projectUrl(repo);
  return projectUrl(repo) + path.split('/').map(encodeURIComponent).join('/').replace(/\.(md|markdown)$/i, '.html');
}

export function layout({ title, description, url, body, math = false, type = 'website', image, index = true, repo, projectOverview = false }) {
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
${url === '/' ? '<link rel="stylesheet" href="/assets/home-projects.css">' : ''}
${projectOverview ? '<link rel="stylesheet" href="/assets/project-figures.css"><script defer src="/legacy-catalog.js"></script>' : ''}
${math ? '<link rel="stylesheet" href="/assets/katex/katex.min.css">' : ''}
</head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="mast"><div class="frame"><a href="/" class="brand"><span class="brand-mark" aria-hidden="true">∿</span>Research notes</a>
<nav aria-label="Main"><a href="/#projects">Projects</a><a href="https://github.com/Griboedow${repo ? '/' + escape(repo) : ''}">GitHub</a></nav></div></header>
<main id="main">${body}</main>
<footer class="foot"><div class="frame"><span>Nikolai Kochkin · Research notes</span><a href="https://github.com/Griboedow/griboedow.github.io">Site source</a></div></footer>
</body></html>\n`;
}

export function home(projects, illustrations) {
  const banner = illustrations[0];
  const figure = banner ? `<a class="home-feature" href="${escape(banner.url)}"><figure class="hero-figure">
    <img fetchpriority="high" src="${banner.image}" width="${banner.width}" height="${banner.height}" alt="${escape(banner.alt)}">
    <figcaption>${escape(banner.title)}</figcaption></figure></a>` : '';
  const cards = projects.map(project => {
    const art = illustrations.find(item => item.repo === project.repo);
    const overview = projectUrl(project.repo);
    const thumb = art ? `<img class="project-thumb ${project.repo}" src="${art.image}" width="${art.width}" height="${art.height}" alt="">` : '';
    const label = art?.overviewSection?.label || art?.viewerLink;
    const destination = art?.overviewSection ? overview + '#' + art.overviewSection.fragment : art?.url;
    const shortcut = label ? `<a class="project-shortcut" href="${escape(destination)}">${escape(label)}</a>` : '';
    return `<li>${thumb}<div class="project-links"><a class="project-title" href="${overview}">${escape(project.title)}</a>${shortcut}</div></li>`;
  }).join('');
  const body = `<div class="hero-wrap"><section class="hero frame home-hero">
    <div class="hero-copy"><p class="kicker">Nikolai Kochkin</p><h1>Mathematics<br><em>in motion</em></h1>
    <p class="intro">I leave notes here on things I’ve tinkered with or explored a little, so you can find them with a regular Google search. Don’t take them too seriously. I do this for fun.</p>
    <p class="intro">I’d love to spot a pattern nobody has seen before or try an experiment nobody has run. If these notes come in handy or give you an idea to chase, I’ll be happy.</p>
    <p class="intro">I did most of this work with Codex, using the most capable model available to me at the time. Please double-check any result you plan to build on.</p></div>
    <nav class="project-choices" id="projects" aria-label="Research projects"><ul>${cards}</ul></nav>
    ${figure}</section></div>`;
  return layout({title:'Mathematical research on attractors, circuits and mechanics',description:'Explore reproducible studies of chaotic attractors, Chua’s circuit and mechanical models for 3D-printed designs by Nikolai Kochkin.',url:'/',image:banner?.image,body});
}
