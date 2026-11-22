import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sanitizeHtml from 'sanitize-html';
import { catalogUrl, documentUrl, projectUrl, names, site } from './layout.mjs';
import { featured } from './featured.mjs';
import { portraitSource } from './project-figures.mjs';

// Check the deployed layout without fetching an external host or modifying dist.
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const files = new Set();
async function walk(directory = '') {
  for (const entry of await readdir(join(dist, directory), { withFileTypes: true })) {
    const path = directory ? directory + '/' + entry.name : entry.name;
    if (entry.isDirectory()) await walk(path);
    else files.add(path);
  }
}
await walk();

const problems = new Set();
const authoredAnchors = new Set();
function fileAt(url) {
  const path = decodeURIComponent(url.pathname).slice(1);
  return path === '' || path.endsWith('/') ? path + 'index.html' : path;
}

const sitemap = await readFile(join(dist, 'sitemap.xml'), 'utf8');
const revision = JSON.parse(await readFile(join(dist, 'publication.json'), 'utf8'));
const chaosOverview = projectUrl('chaos-attractor-lab');
const chaosImageBase = 'https://raw.githubusercontent.com/Griboedow/chaos-attractor-lab/' + revision.sources['chaos-attractor-lab'] + '/';
const readmePortraits = new Map();
const legacyReadmes = new Map(Object.keys(names).map(repo => [projectUrl(repo) + 'README.html', projectUrl(repo)]));
const pages = new Map();
const mappedFiles = new Set();
for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const url = new URL(match[1].replace(/&amp;/g, '&'));
  const file = fileAt(url);
  if (url.origin !== site || url.search || url.hash || mappedFiles.has(file) || !files.has(file)) {
    throw new Error('Invalid, duplicate or missing sitemap target: ' + url.href);
  }
  mappedFiles.add(file);
  pages.set(url.pathname, { url, ids: new Set(), links: [], figureLinks: [], previewImages: 0, catalogFragments: [] });
}
for (const file of files) {
  if (/\.html$/i.test(file) && !mappedFiles.has(file) &&
      !legacyReadmes.has('/' + file) && file !== '404.html' && !/^google[\da-f]+\.html$/i.test(file)) {
    problems.add('HTML page missing from sitemap: ' + file);
  }
}

let equations = 0;
for (const page of pages.values()) {
  const html = await readFile(join(dist, fileAt(page.url)), 'utf8');
  const canonical = [];
  const styles = [];
  let hasTitle = false;
  let hasDescription = false;
  let hasHeading = false;
  let hasMath = false;
  let hasMathML = false;
  let hasHomeIntro = false;
  let hasCardDescription = false;
  let inArticle = false;
  let inProjectFigures = false;
  // Use the HTML parser already used by the publisher to decode URL entities
  // and ignore apparent markup inside code, social descriptions, or text.
  sanitizeHtml(html, {
    allowedTags: [], allowedAttributes: {},
    onOpenTag(tag, a) {
      if (page.url.pathname === '/') {
        if (tag === 'p' && a.class === 'intro') {
          hasHomeIntro = true;
          if (page.ids.has('projects')) problems.add('Homepage introduction follows the project list');
        }
        if (a.id === 'projects' && !hasHomeIntro) problems.add('Project list precedes the homepage introduction');
        if (tag === 'li') hasCardDescription = false;
        if (tag === 'p' && a.class === 'project-description') hasCardDescription = true;
        if (tag === 'a' && (a.href?.startsWith('/research/') || a.href === '/#projects') &&
            (!page.ids.has('projects') || !hasCardDescription)) {
          problems.add('A homepage project link precedes its description: ' + a.href);
        }
      }
      if (tag === 'article' && a.class?.split(/\s+/).includes('paper')) inArticle = true;
      if (inArticle && tag === 'nav' && a.class?.split(/\s+/).includes('project-figures')) inProjectFigures = true;
      if (inProjectFigures && tag === 'a' && a.href) page.figureLinks.push(a.href);
      if (inProjectFigures && tag === 'img' && a.src) page.previewImages++;
      if (page.url.pathname === chaosOverview && inArticle && !inProjectFigures && tag === 'img') {
        const source = portraitSource(a.src, chaosImageBase);
        if (source && !readmePortraits.has(source.key)) readmePortraits.set(source.key, a.id);
      }
      if (a['data-legacy-catalog-fragments'] !== undefined) {
        page.legacyCatalog = { url: a['data-catalog-url'], fragments: new Set(a['data-legacy-catalog-fragments'].split(/\s+/)) };
      }
      if (tag === 'section' && a.class?.split(/\s+/).includes('catalog-group') && a.id) {
        page.catalogFragments.push(a.id, a['aria-labelledby']);
      }
      if (tag === 'title') hasTitle = true;
      if (tag === 'h1') hasHeading = true;
      if (tag === 'meta' && a.name === 'description' && a.content?.trim()) hasDescription = true;
      if (tag === 'meta' && a.name === 'robots' && /\b(noindex|none)\b/i.test(a.content)) {
        problems.add('Sitemap page blocks indexing: ' + page.url.pathname);
      }
      if (tag === 'link' && a.rel === 'canonical') canonical.push(a.href);
      if (tag === 'link' && a.rel === 'stylesheet') styles.push(a.href);
      if (tag === 'math') hasMathML = true;
      if (tag === 'span' && a.class?.split(/\s+/).includes('katex')) {
        equations++;
        hasMath = true;
      }
      if (a.id) page.ids.add(a.id);
      if (tag === 'a' && a.name) page.ids.add(a.name);
      for (const value of [a.href, a.src, a.poster, a['data-viewer-file'], tag === 'meta' && a.property === 'og:image' && a.content]) {
        if (value) page.links.push({ value, authored: inArticle });
      }
    },
    onCloseTag(tag) {
      if (tag === 'article') inArticle = false;
      if (tag === 'nav') inProjectFigures = false;
    },
  });
  if (canonical.length !== 1 || canonical[0] !== page.url.href) problems.add('Canonical mismatch: ' + page.url.pathname);
  if (!hasTitle || !hasDescription || !hasHeading) problems.add('Missing title, description or H1: ' + page.url.pathname);
  if (hasMath && (!hasMathML || !styles.includes('/assets/katex/katex.min.css'))) {
    problems.add('MathML or formula stylesheet missing: ' + page.url.pathname);
  }
}

function checkLink(value, from, authored = false) {
  let url;
  let target;
  try {
    url = new URL(value, from);
    if (url.origin !== site) return;
    target = fileAt(url);
  } catch {
    problems.add('Invalid URL in ' + from.pathname + ': ' + value);
    return;
  }
  if (!files.has(target)) {
    problems.add('Missing file linked from ' + from.pathname + ': ' + url.pathname);
    return;
  }
  const destination = pages.get(url.pathname);
  if (url.hash && destination) {
    let id;
    try { id = decodeURIComponent(url.hash.slice(1)).split(':~:text=')[0]; }
    catch { problems.add('Invalid fragment encoding in ' + from.pathname + ': ' + url.hash); return; }
    if (id && id !== 'top' && !destination.ids.has(id)) {
      const message = from.pathname + ' → ' + url.pathname + url.hash;
      (authored ? authoredAnchors : problems).add('Missing fragment: ' + message);
    }
  }
}
for (const page of pages.values()) {
  for (const { value, authored } of page.links) checkLink(value, page.url, authored);
}
for (const file of files) {
  if (!file.endsWith('.css')) continue;
  const css = await readFile(join(dist, file), 'utf8');
  for (const [, value] of css.matchAll(/url\(\s*["']?([^'")\s]+)["']?\s*\)/g)) {
    checkLink(value, new URL('/' + file, site));
  }
}
const home = pages.get('/');
for (const { repo, path } of featured.filter(card => card.viewerLink)) {
  const report = documentUrl(repo, path);
  const link = report + '#interactive';
  if (!pages.get(report)?.ids.has('interactive') ||
      ![home, pages.get(projectUrl(repo))].every(page => page?.links.some(({ value }) => value === link))) {
    problems.add('Missing direct interactive atlas link or viewer: ' + link);
  }
}
for (const repo of Object.keys(names)) {
  const project = projectUrl(repo);
  const catalog = catalogUrl(repo);
  const overview = pages.get(project);
  const directory = pages.get(catalog);
  const links = new Set(directory?.links.map(link => link.value));
  const documents = [...pages.keys()].filter(path => path !== catalog && path.startsWith(project));
  const source = 'https://github.com/Griboedow/' + repo + '/blob/' + revision.sources[repo] + '/README.md';
  if (!home?.links.some(link => link.value === project)) problems.add('Homepage omits project overview: ' + project);
  if (!overview?.links.some(link => link.value === source) || !overview.previewImages ||
      !overview.figureLinks.some(link => link.startsWith(project) && pages.has(link.split('#')[0]))) {
    problems.add('Project overview is missing its source README or figures: ' + project);
  }
  if (project === chaosOverview) {
    const destinations = new Set((overview?.figureLinks || [])
      .filter(link => link.startsWith(project + '#'))
      .map(link => decodeURIComponent(link.slice(project.length + 1))));
    const ids = [...(overview?.ids || [])];
    if (ids.indexOf('contents') < 0 || ids.indexOf('portrait-gallery') <= ids.indexOf('contents') ||
        !readmePortraits.size || destinations.size !== readmePortraits.size ||
        [...readmePortraits.values()].some(id => !id || !destinations.has(id))) {
      problems.add('Chaos overview needs its contents followed by a gallery linking to every original portrait');
    }
  }
  if (!overview?.links.some(link => link.value === catalog) || !directory?.ids.has('catalog-search') || documents.length < 2) {
    problems.add('Missing navigable project catalog or studies: ' + catalog);
  }
  if (overview?.legacyCatalog?.url !== catalog || directory?.catalogFragments.some(id =>
    !overview.ids.has(id) && !overview.legacyCatalog.fragments.has(id))) {
    problems.add('Missing legacy catalog fragment routing: ' + project);
  }
  for (const path of documents) {
    if (!links.has(path)) problems.add('Catalog omits ' + path);
    if (path !== project && !pages.get(path).links.some(link => link.value === project)) {
      problems.add('Study has no link to the project overview: ' + path);
    }
  }
}
for (const [alias, project] of legacyReadmes) {
  if (pages.has(alias)) problems.add('Legacy README alias in sitemap: ' + alias);
  const html = await readFile(join(dist, alias.slice(1)), 'utf8');
  let noindex = false;
  let fallback = false;
  let canonical = false;
  sanitizeHtml(html, {
    allowedTags: [], allowedAttributes: {},
    onOpenTag(tag, attrs) {
      if (tag === 'meta' && attrs.name === 'robots' && /\b(?:noindex|none)\b/i.test(attrs.content)) noindex = true;
      if (tag === 'link' && attrs.rel === 'canonical' && attrs.href === site + project) canonical = true;
      if (tag === 'a' && attrs.href && new URL(attrs.href, site + alias).href === site + project) fallback = true;
    },
  });
  if (!noindex || !canonical || !fallback) {
    problems.add('Legacy README missing indexing exclusion, canonical URL or fallback to project overview: ' + alias);
  }
}
const robots = await readFile(join(dist, 'robots.txt'), 'utf8');
if (!robots.includes('Sitemap: ' + site + '/sitemap.xml')) problems.add('Missing sitemap in robots.txt');
if (!equations) problems.add('No rendered equations found in the research collection');
if (authoredAnchors.size) {
  console.warn(`${authoredAnchors.size} unresolved source fragment links:`);
  console.warn([...authoredAnchors].slice(0, 10).join('\n'));
}
if (problems.size) throw new Error([...problems].slice(0, 25).join('\n') + `\n${problems.size} issue(s)`);
console.log(`Verified ${pages.size} sitemap pages, all project catalogs and local files, and ${equations} rendered equations.`);
