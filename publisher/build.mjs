import { cp, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sanitizeHtml from 'sanitize-html';
import { loadSources } from './sources.mjs';
import { renderMarkdown, extractTitle } from './content.mjs';
import { createFeaturedImages } from './featured.mjs';
import { loadSupplements } from './supplements.mjs';
import { renderCatalog, catalogSupplements } from './catalog.mjs';
import { layout, home, names, site, escape, documentUrl, catalogUrl } from './layout.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = resolve(process.env.SOURCE_CACHE || join(root, '.cache'));
const projects = await loadSources(cache);
const output = await mkdtemp(join(root, '.build-'));
const byName = new Map(projects.map(p => ['griboedow/' + p.repo, p]));
const urls = new Set();
const slug = name => byName.get(name.toLowerCase());

async function page(url, html) {
  if (urls.has(url)) throw new Error('Duplicate page URL ' + url);
  urls.add(url);
  const path = join(output, decodeURIComponent(url), url.endsWith('/') ? 'index.html' : '');
  await mkdir(dirname(path), {recursive:true});
  await writeFile(path, html);
}

function summary(html, fallback) {
  const first = Array.from(html.matchAll(/<p>([\s\S]*?)<\/p>/g), m => m[1])
    .find(p => !p.includes('class="katex') && !p.includes('<img') && p.replace(/<[^>]+>/g,'').length >= 65);
  if (!first) return fallback;
  const text = sanitizeHtml(first, {allowedTags:[], allowedAttributes:{}})
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
  return text.length > 180 ? text.slice(0,177).replace(/\s+\S*$/,'') + '…' : text;
}

function isPublication(path) {
  // These are repository instructions, legal notices, and an explicitly vendored reference.
  return !/(^|\/)(?:AGENTS|THIRD_PARTY_NOTICES)\.md$/i.test(path)
    && path !== 'results/attractor-novelty/reference/README-atlas-upstream.md';
}

for (const p of projects) {
  p.title = names[p.repo];
  p.directories = new Set(['']);
  for (const path of p.files) {
    let cut = path.indexOf('/');
    while (cut !== -1) {
      p.directories.add(path.slice(0,cut));
      cut = path.indexOf('/',cut + 1);
    }
  }
  p.entries = new Map();
  for (const [path, source] of p.documents) {
    if (!isPublication(path)) continue;
    const title = extractTitle(source, path);
    p.entries.set(path, {path, title, url:documentUrl(p.repo,path)});
  }
  p.supplements = catalogSupplements(p, p.files);
  for (const {path, title} of p.supplements) {
    p.entries.set(path, {path, title, url:documentUrl(p.repo,path), format:'HTML report'});
  }
}

const resolvePage = (repo, path) => slug(repo)?.entries.get(path)?.url;
const pathType = (repo,path) => {
  const p = slug(repo);
  return p?.files.has(path) ? 'blob' : p?.directories.has(path) ? 'tree' : undefined;
};

try {
  await cp(join(root,'static'), output, {recursive:true});
  const assets = join(output,'assets');
  const katex = join(root,'node_modules/katex');
  await cp(join(katex,'dist/fonts'),join(assets,'katex/fonts'),{recursive:true});
  await cp(join(katex,'dist/katex.min.css'),join(assets,'katex/katex.min.css'));
  await cp(join(katex,'LICENSE'),join(assets,'katex/LICENSE'));
  await mkdir(join(assets,'fonts'),{recursive:true});
  for (const [font, styles] of [['dm-sans',['normal']],['stix-two-text',['normal','italic']]]) {
    const source = join(root,'node_modules/@fontsource-variable',font);
    for (const style of styles) {
      const file = font + '-latin-wght-' + style + '.woff2';
      await cp(join(source,'files',file),join(assets,'fonts',file));
    }
    await cp(join(source,'LICENSE'),join(assets,'fonts',font + '-LICENSE.txt'));
  }
  const illustrations = await createFeaturedImages(projects, output, cache);
  const context = {resolvePage, pathType, repoSha:name=>slug(name)?.sha, distDirectory:output};
  for (const p of projects) {
    const reports = await loadSupplements(p, cache, p.supplements, context);
    for (const report of reports) Object.assign(p.entries.get(report.path), report);
  }
  await page('/',home(projects,illustrations));
  for (const p of projects) {
    const catalog = catalogUrl(p.repo);
    const list = [...p.entries.values()];
    const catalogBody = renderCatalog(p,list);
    await page(catalog,layout({title:p.title + ' research catalog',description:'Browse all published studies, results and project documentation from ' + p.title + '.',url:catalog,body:'<div class="frame catalog-frame">' + catalogBody + '</div>'}));
    for (const entry of p.entries.values()) {
      const {path,title,url} = entry;
      const html = entry.html ?? renderMarkdown(p.documents.get(path), {repo:p.repo, path, sha:p.sha, ...context});
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      const origin = 'https://github.com/Griboedow/' + p.repo;
      const hasTitle = /<h1[ >]/.test(html);
      const body = `<div class="frame article-frame"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Research notes</a><span aria-hidden="true">/</span><a href="${catalog}">${escape(p.title)}</a></nav>
      <article class="paper">${hasTitle ? '' : '<h1>' + escape(title) + '</h1>'}${html}</article>
      <aside class="provenance"><strong>Source</strong><div><a href="${origin}/blob/${p.sha}/${encoded}">${escape(path)}</a>
      <span> · revision ${p.sha.slice(0,7)}</span></div><a href="${catalog}">Browse ${escape(p.title)}</a></aside></div>`;
      await page(url,layout({title,description:summary(html,title + ' — ' + p.title),url,type:'article',math:html.includes('class="katex'),body}));
    }
  }
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [...urls].sort().map(url=>'  <url><loc>' + site + escape(url) + '</loc></url>').join('\n') + '\n</urlset>\n';
  await writeFile(join(output,'sitemap.xml'),sitemap);
  await writeFile(join(output,'robots.txt'),'User-agent: *\nAllow: /\n\nSitemap: ' + site + '/sitemap.xml\n');
  const revision = {publisher:process.env.GITHUB_SHA || 'local',sources:Object.fromEntries(projects.map(p=>[p.repo,p.sha]))};
  await writeFile(join(output,'publication.json'), JSON.stringify(revision,null,2) + '\n');
  await writeFile(join(output,'404.html'),layout({title:'Page not found',description:'Find a research project in the catalog.',url:'/404.html',index:false,body:'<section class="frame missing"><h1>Page not found</h1><a href="/#projects">Browse the research projects</a></section>'}));
  await rm(join(root,'dist'), {recursive:true,force:true});
  await rename(output,join(root,'dist'));
  console.log(projects.map(p=>p.title + ': ' + (p.entries.size - p.supplements.length) + ' Markdown pages, ' + p.supplements.length + ' HTML reports').join('\n'));
  console.log(urls.size + ' URLs in sitemap.');
} catch (error) {
  await rm(output,{recursive:true,force:true});
  throw error;
}
