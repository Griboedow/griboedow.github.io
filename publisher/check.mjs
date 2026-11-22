import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sanitizeHtml from 'sanitize-html';
import { catalogUrl, names, site } from './layout.mjs';

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
const pages = new Map();
const mappedFiles = new Set();
for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const url = new URL(match[1].replace(/&amp;/g, '&'));
  const file = fileAt(url);
  if (url.origin !== site || url.search || url.hash || mappedFiles.has(file) || !files.has(file)) {
    throw new Error('Invalid, duplicate or missing sitemap target: ' + url.href);
  }
  mappedFiles.add(file);
  pages.set(url.pathname, { url, ids: new Set(), links: [] });
}
for (const file of files) {
  if (/\.html$/i.test(file) && !mappedFiles.has(file) &&
      file !== '404.html' && !/^google[\da-f]+\.html$/i.test(file)) {
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
  let inArticle = false;
  // Use the HTML parser already used by the publisher to decode URL entities
  // and ignore apparent markup inside code, social descriptions, or text.
  sanitizeHtml(html, {
    allowedTags: [], allowedAttributes: {},
    onOpenTag(tag, a) {
      if (tag === 'article' && a.class?.split(/\s+/).includes('paper')) inArticle = true;
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
for (const repo of Object.keys(names)) {
  const catalog = catalogUrl(repo);
  const links = new Set(pages.get(catalog)?.links.map(link => link.value));
  const documents = [...pages.keys()].filter(path => path !== catalog && path.startsWith(catalog));
  if (!home?.links.some(link => link.value === catalog) || !documents.length) problems.add('Missing catalog or studies: ' + catalog);
  for (const path of documents) {
    if (!links.has(path)) problems.add('Catalog omits ' + path);
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
