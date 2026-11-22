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
<nav aria-label="Main">${url === '/' ? '' : '<a href="/#projects">Projects</a>'}<a href="https://github.com/Griboedow${repo ? '/' + escape(repo) : ''}">GitHub</a></nav></div></header>
<main id="main">${body}</main>
<footer class="foot"><div class="frame"><span>Nikolai Kochkin · Research notes</span><a href="https://github.com/Griboedow/griboedow.github.io">Site source</a></div></footer>
</body></html>\n`;
}

export function home(projects, illustrations) {
  const cards = projects.map(project => {
    const art = illustrations.find(item => item.repo === project.repo);
    const overview = projectUrl(project.repo);
    const thumb = art ? `<img class="project-thumb" src="${escape(art.image)}" width="${art.width}" height="${art.height}" alt="${escape(art.alt)}" style="background-color:${escape(art.background)}">` : '';
    const label = art?.overviewSection?.label || art?.viewerLink;
    const destination = art?.overviewSection ? overview + '#' + art.overviewSection.fragment : art?.url;
    const shortcut = label ? `<a class="project-shortcut" href="${escape(destination)}">${escape(label)}</a>` : '';
    const study = art?.studyLabel ? `<a class="project-shortcut" href="${escape(art.url)}">${escape(art.studyLabel)}</a>` : '';
    return `<li>${thumb}<div class="project-body"><h3>${escape(project.title)}</h3><p class="project-description">${escape(project.cardDescription)}</p>
      <div class="project-links"><a class="project-overview" href="${overview}" aria-label="${escape(project.title)} project overview">Project overview</a>${shortcut}${study}</div></div></li>`;
  }).join('');
  const body = `<div class="hero-wrap"><header class="hero frame home-hero">
    <div><p class="kicker">Nikolai Kochkin</p><h1>Mathematics<br><em>in motion</em></h1></div>
    <div class="hero-copy"><p class="intro">I keep notes here on things I’ve tinkered with, so someone asking the same questions can find them through a Google search.</p>
    <p class="intro">I do this for fun. I’d love to spot a pattern nobody’s seen before or try an experiment nobody’s run. If any of this helps you or gives you an idea of your own, I’ll be glad.</p>
    <p class="intro">Take the results with a grain of salt. I did most of this work with Codex, using the most capable model I had access to at the time. Please double-check anything you build on.</p></div>
    </header></div>
    <nav class="project-choices frame" id="projects" aria-labelledby="projects-heading"><h2 id="projects-heading">Projects</h2><ul>${cards}</ul></nav>`;
  return layout({title:'Mathematical research on attractors, circuits and mechanics',description:'Nikolai Kochkin’s personal research notes on chaotic attractors, Chua’s circuit and the mechanics of 3D-printed designs.',url:'/',image:illustrations[0]?.image,body});
}
