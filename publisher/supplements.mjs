import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { promisify } from 'node:util';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { rewriteUrl } from './content.mjs';
import { escape } from './layout.mjs';

const execute = promisify(execFile);
const markdown = new MarkdownIt();
const related = {
  'knot-atlas.html': 'docs/chua-knot-atlas.md',
  'atlas.html': 'docs/chua-refined-atlas.md',
  'family-gallery.html': 'docs/chua-family-gallery.md',
  'cards.html': 'docs/chua-layer-cards.md',
  'linked-pairs.html': 'docs/chua-link-search.md',
  'linked-attractors.html': 'docs/chua-linked-attractors.md',
  'guide.html': 'docs/chua-overlap-geometry.md',
  'volumes.html': 'docs/chua-slope-volumes.md',
};

function rasterData(src) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(src);
  if (!match) return;
  const data = Buffer.from(match[2], 'base64');
  const type = match[1].toLowerCase();
  if (type === 'png' && data.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ||
      type === 'jpeg' && data.subarray(0, 3).toString('hex') === 'ffd8ff' ||
      type === 'webp' && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return { data, name: createHash('sha256').update(data).digest('hex').slice(0, 20) + '.' + type };
  }
}

function staticBody(source, ctx, imageMap, assetPrefix) {
  return sanitizeHtml(source, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'details', 'summary', 'img', 'figure', 'figcaption', 'video', 'source'],
    allowedAttributes: {
      a: ['href','title'], img: ['src','alt','width','height','loading','decoding'],
      video: ['src','controls','preload','poster'], source: ['src','type'],
      th: ['colspan','rowspan','scope'], td: ['colspan','rowspan'], details: ['open'],
      h1: ['id'], h2: ['id'], h3: ['id'], section: ['id'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    nonTextTags: ['script','style','title','textarea','option','select','button','label','output','iframe','template'],
    transformTags: {
      a: (tagName, attrs) => ({ tagName, attribs:{ ...attrs, href:rewriteUrl(attrs.href || '',ctx) } }),
      img: (tagName, attrs) => {
        const raw = attrs.src || '';
        let src;
        if (/^data:/i.test(raw)) {
          const img = rasterData(raw);
          if (img && ctx.distDirectory) {
            imageMap.set(img.name,img.data);
            src = assetPrefix + '/' + img.name;
          }
        } else if (raw) src = rewriteUrl(raw,ctx,true);
        return { tagName, attribs:{ ...attrs, src:src || '', loading:'lazy',decoding:'async' } };
      },
      video: (tagName, attrs) => ({tagName,attribs:{...attrs, controls:'controls',preload:'none',
        ...(attrs.src && {src:rewriteUrl(attrs.src,ctx,true)}), ...(attrs.poster && {poster:rewriteUrl(attrs.poster,ctx,true)})}}),
      source: (tagName, attrs) => ({tagName,attribs:{...attrs,src:rewriteUrl(attrs.src || '',ctx,true)}}),
    },
    exclusiveFilter: frame => frame.tag === 'img' && !frame.attribs.src,
  });
}

function companionFigure(project, ctx, includeFigure) {
  const path = related[posix.basename(ctx.path)];
  const source = project.documents.get(path);
  if (!source) return '';
  const article = rewriteUrl('/' + path,ctx);
  const image = includeFigure && markdown.parse(source,{}).flatMap(t=>t.children || []).find(t=>t.type === 'image');
  const media = image ? '<figure><img loading="lazy" decoding="async" alt="' + escape(image.content) + '" src="' +
    escape(rewriteUrl(image.attrGet('src'),{...ctx,path},true)) + '"></figure>' : '';
  return media + '<p><a href="' + escape(article) + '">Read the accompanying study</a></p>';
}

export async function loadSupplements(project, cacheDirectory, candidates, options) {
  const reports = [];
  for (const candidate of candidates) {
    const {path,title} = candidate;
    const ctx = {...options,repo:project.repo,sha:project.sha,path};
    const directory = resolve(cacheDirectory, project.repo + '.git');
    const {stdout:source} = await execute('git',['-C',directory,'cat-file','blob',project.sha + ':' + path],{
      encoding:'utf8', maxBuffer:128 * 1024 * 1024, windowsHide:true, env:{...process.env,GIT_TERMINAL_PROMPT:'0'},
    });
    const images = new Map();
    const assetPrefix = '/viewer-files/' + project.repo + '/' + project.sha + '/' + path;
    let html = staticBody(source, ctx, images, assetPrefix);
    if (!/<h1[\s>]/i.test(html)) html = '<h1>' + escape(title) + '</h1>' + html;
    const interactive = /<script[\s>]/i.test(source);
    if (ctx.distDirectory && (interactive || images.size)) {
      const assets = join(ctx.distDirectory,assetPrefix);
      await mkdir(assets,{recursive:true});
      for (const [name,data] of images) await writeFile(join(assets,name),data);
      if (interactive) await writeFile(join(assets,'original.txt'),source);
    }
    if (interactive) {
      const prefix = 'https://raw.githubusercontent.com/Griboedow/' + project.repo + '/' + project.sha + '/';
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      const base = prefix + posix.dirname(encoded) + '/';
      const viewer = ctx.distDirectory ? '<button type="button" class="button" data-load-viewer hidden>Open interactive viewer</button>' +
        '<p role="status" aria-live="polite"></p><script defer src="/viewer.js"></script>' : '';
      const tools = '<section class="source-viewer" id="interactive" data-viewer-file="' + escape(assetPrefix + '/original.txt') + '" data-viewer-base="' +
        escape(base) + '" aria-label="Interactive viewer">' + viewer + '<p><a href="' +
        escape('https://github.com/Griboedow/' + project.repo + '/blob/' + project.sha + '/' + encoded) +
        '">Original HTML on GitHub</a></p></section>' + companionFigure(project,ctx,!/<img\b/i.test(html));
      html = html.replace(/<\/h1>/i, closing => closing + tools);
    }
    reports.push({path,title,html,format:'HTML report'});
  }
  return reports;
}
