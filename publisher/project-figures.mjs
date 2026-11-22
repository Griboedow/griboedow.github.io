import { join, posix } from 'node:path';
import MarkdownIt from 'markdown-it';
import { createThumbnail } from './featured.mjs';
import { escape } from './layout.mjs';

const markdown = new MarkdownIt();

// Pair each front-page selection with a second illustrated study. Read both
// its figure and its caption from the same revision as the published article.
const companions = {
  'chaos-attractor-lab': 'results/art_20261122/double-exposure/README.md',
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

export async function createProjectFigures(projects, output, cache, illustrations) {
  const figures = new Map();
  for (const project of projects) {
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
    figures.set(project.repo, cards);
  }
  return figures;
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

export function withProjectFigures(readme, figures = []) {
  readme = onDemandPortraits(readme);
  if (!figures.length) return readme;
  const links = figures.map(({ url, image, title, alt, width, height, background }) =>
    `<a href="${escape(url)}"><span class="figure-preview" style="background-color:${background}"><img src="${escape(image)}" alt="${escape(alt)}" width="${width}" height="${height}" decoding="async"></span><span class="figure-title">${escape(title)}</span></a>`
  ).join('\n');
  const navigation = `<nav class="project-figures" aria-label="Illustrated studies">${links}</nav>`;
  return readme.replace(/<\/h1>/i, heading => heading + '\n' + navigation);
}
