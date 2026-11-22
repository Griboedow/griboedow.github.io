import { mkdir } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { createThumbnail } from './featured.mjs';
import { escape, projectUrl } from './layout.mjs';
import { prefetchSourceFiles } from './sources.mjs';

const markdown = new MarkdownIt();

// Pair each front-page selection with a second illustrated study. Read both
// its figure and its caption from the same revision as the published article.
const companions = {
  'chua-gpu-atlas': 'docs/chua-knot-atlas.md',
  'math-models': 'vehicles/toy-physics/README.md',
};

function firstReportImage(project, path) {
  for (const block of markdown.parse(project.documents.get(path) || '', {})) {
    for (const token of block.children || []) {
      if (token.type !== 'image') continue;
      const src = token.attrGet('src');
      if (!src || !/\.(png|webp|jpe?g)$/i.test(src)) continue;
      const target = posix.join(posix.dirname(path), src);
      if (project.files.has(target)) return { target, alt: token.content };
    }
  }
}

async function projectCards(project, output, cache, illustrations) {
  const cards = [];
  const featured = illustrations.find(item => item.repo === project.repo);
  if (featured && project.entries.has(featured.path)) {
    cards.push({ ...project.entries.get(featured.path), ...featured });
  }
  const path = companions[project.repo];
  if (project.entries.has(path)) {
    const source = firstReportImage(project, path);
    if (source) {
      const filename = project.repo + '-companion.webp';
      const dimensions = await createThumbnail(project, source.target, join(output, 'assets', filename), cache, 840);
      cards.push({ ...project.entries.get(path), alt: source.alt, image: '/assets/' + filename, ...dimensions });
    }
  }
  return cards;
}

function onDemandPortraits(readme) {
  // The portrait renderer publishes a WebP rotation and PNG still with the
  // same basename. Match adjacent figures only, allowing their dated captions.
  const date = String.raw`(?:\s*<p><em>First recorded portrait: <strong>[^<>]+<\/strong>[^<>]*<\/em><\/p>)?`;
  const pairs = new RegExp(
    String.raw`<p><img src="(?<base>https:\/\/raw\.githubusercontent\.com\/Griboedow\/chaos-attractor-lab\/[a-f0-9]{40}\/docs\/assets\/portraits\/[\w-]+)\.webp" alt="(?<motionAlt>[^"]*)"[^>]*><\/p>(?<motionDate>${date})\s*` +
    String.raw`<p>(?<still><img src="\k<base>\.png" alt="[^"]*"[^>]*>)<\/p>(?<stillDate>${date})`,
    'g'
  );
  const transformed = readme.replace(pairs, (...args) => {
    const { base, motionAlt, motionDate, still, stillDate } = args.at(-1);
    const dates = [...new Set([motionDate.trim(), stillDate.trim()])].join('');
    return `<figure class="portrait-pair">${still}<figcaption><div class="portrait-controls"><a href="${base}.webp" data-motion-alt="${motionAlt}">Open animation file</a></div>${dates}</figcaption></figure>`;
  });
  return transformed === readme ? readme : transformed + '\n<script defer src="/portraits.js"></script>';
}

function figureLinks(figures, label, gallery = false) {
  const links = figures.map(({ url, image, title, alt, width, height, background }, i) => {
    const style = background ? ` style="background-color:${background}"` : '';
    const size = width && height ? ` width="${width}" height="${height}"` : '';
    return `<a href="${escape(url)}"><span class="figure-preview"${style}><img src="${escape(image)}" alt="${escape(alt)}"${size}${gallery && i >= 3 ? ' loading="lazy"' : ''} decoding="async"></span><span class="figure-title">${escape(title)}</span></a>`;
  }).join('\n');
  return `<nav class="project-figures${gallery ? ' portrait-gallery' : ''}" aria-label="${label}">${links}</nav>`;
}

const encodePath = path => path.split('/').map(encodeURIComponent).join('/');

export function portraitSource(src, prefix) {
  if (src?.startsWith(prefix)) {
    // The Markdown renderer percent-encodes each path segment and retains
    // optional GitHub queries or SVG fragments. Only the path names a Git blob.
    const path = decodeURIComponent(src.slice(prefix.length).split(/[?#]/, 1)[0]);
    return { key: path, path };
  }
  if (/^https:\/\/(?:github\.com\/user-attachments\/assets\/|user-images\.githubusercontent\.com\/)/i.test(src)) {
    return { key: src };
  }
}

async function portraitGallery(readme, project, output, cache) {
  const prefix = `https://raw.githubusercontent.com/Griboedow/${project.repo}/${project.sha}/`;
  const portraits = new Map();
  let title = '';
  // Associate each original image with its nearest README heading. Paired
  // motion/still portraits have already been combined into one figure.
  const tags = /<h[2-6] id="[^"]+">([\s\S]*?)<\/h[2-6]>|<img\b[^>]*>/g;
  const illustrated = readme.replace(tags, (tag, heading) => {
    if (heading !== undefined) {
      title = markdown.utils.unescapeAll(heading.replace(/<[^>]+>/g, ''));
      return tag;
    }
    // Raw HTML images can put src anywhere and omit alt. Read actual HTML
    // attributes so filenames and captions containing entities round-trip.
    let attrs;
    sanitizeHtml(tag, { onOpenTag: (_, attributes) => { attrs = attributes; } });
    const source = portraitSource(attrs.src, prefix);
    if (!source || (source.path && !project.files.has(source.path)) || portraits.has(source.key)) return tag;
    const id = 'figure-' + source.key;
    const alt = attrs.alt || title || (source.path ? posix.basename(source.path) : 'Attractor portrait');
    portraits.set(source.key, { path: source.path, image: attrs.src, title: title || alt, alt, url: projectUrl(project.repo) + '#' + encodePath(id) });
    title = '';
    return tag.replace(/^<img\b/, () => `<img id="${escape(id)}"`);
  });
  if (!portraits.size) return readme;
  // Vector images retain their original resolution. GitHub attachments have
  // no Git blob and are displayed from the same URL as the source README.
  const rasters = [...portraits.values()].filter(card => card.path && !/\.svgz?$/i.test(card.path));
  if (rasters.length) await prefetchSourceFiles(cache, project, rasters.map(card => card.path));
  for (const card of rasters) {
    const asset = '/assets/chaos-portraits/' + encodePath(card.path).replaceAll('*', '%2A') + '.webp';
    card.image = encodePath(asset);
    const file = join(output, asset);
    await mkdir(dirname(file), { recursive: true });
    Object.assign(card, await createThumbnail(project, card.path, file, cache, 448));
  }
  const [intro, ...sections] = illustrated.split(/(?=<h2 id=")/);
  let body = sections.join('');
  let originalContents = '';
  body = body.replace(/^<h2 id="contents">Contents<\/h2>\s*(<ul>[\s\S]*?<\/ul>)/, (_, links) => {
    originalContents = links;
    return '';
  });
  const firstChapter = /<h2 id="([^"]+)">/.exec(body)?.[1];
  const hasIndex = body.includes('<h2 id="research-index">');
  const contents = `<nav class="readme-contents" id="contents" aria-label="Contents"><strong>Contents</strong>
    <a href="#portrait-gallery">Portrait gallery</a>
    ${firstChapter ? `<a href="#${firstChapter}">Models and equations</a>` : ''}
    ${hasIndex ? '<a href="#research-index">Research index</a>' : ''}</nav>`;
  const gallery = '<h2 id="portrait-gallery">Portrait gallery</h2>' + figureLinks([...portraits.values()], 'Attractor portraits', true);
  const moreLinks = originalContents ? '<details class="readme-index"><summary>Links by topic</summary>' + originalContents + '</details>' : '';
  body = hasIndex ? body.replace('<h2 id="research-index">Research index</h2>', heading => heading + moreLinks) : body + moreLinks;
  return intro + contents + gallery + body;
}

export async function withProjectFigures(readme, project, output, cache, illustrations) {
  if (project.repo === 'chaos-attractor-lab') {
    return portraitGallery(onDemandPortraits(readme), project, output, cache);
  }
  const cards = await projectCards(project, output, cache, illustrations);
  if (!cards.length) return readme;
  const navigation = figureLinks(cards, 'Illustrated studies');
  return readme.replace(/<\/h1>/i, heading => heading + '\n' + navigation);
}
