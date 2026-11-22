import { randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import MarkdownIt from 'markdown-it';
import markdownAnchor from 'markdown-it-anchor';
import { slug } from 'github-slugger';
import { katex } from '@mdit/plugin-katex';
import sanitizeHtml from 'sanitize-html';

const repositoryName = name => name.includes('/') ? name : `Griboedow/${name}`;
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');

function plainText(tokens) {
  return tokens.map(token => {
    if (token.children) return plainText(token.children);
    if (['text', 'code_inline', 'math_inline'].includes(token.type)) return token.content;
    return token.type === 'softbreak' || token.type === 'hardbreak' ? ' ' : '';
  }).join('');
}

const titleParser = new MarkdownIt();
export function extractTitle(source, fallback = '') {
  const tokens = titleParser.parse(source, {});
  const index = tokens.findIndex(token => token.type === 'heading_open' && token.tag === 'h1');
  return index < 0 ? fallback : plainText(tokens[index + 1].children).trim() || fallback;
}

// GitHub's code-delimited math form permits literal Markdown punctuation inside TeX.
function githubInlineMath(state, silent) {
  const start = state.pos;
  if (!state.src.startsWith('$`', start)) return false;
  const end = state.src.indexOf('`$', start + 2);
  if (end < start + 3 || end + 2 > state.posMax) return false;
  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.content = state.src.slice(start + 2, end);
    token.markup = '$`';
  }
  state.pos = end + 2;
  return true;
}

function targetUrl(target, context, asset) {
  const { repo, path, sha, resolvePage, pathType } = context;
  if (!asset && !target.search && !/^#L\d+(?:-L\d+)?$/.test(target.hash)) {
    const local = resolvePage?.(repo, path) ||
      resolvePage?.(repo, posix.join(path, 'README.md'));
    if (local) return local + target.hash;
  }
  const encoded = encodePath(path.replace(/\/$/, ''));
  if (asset) return `https://raw.githubusercontent.com/${repo}/${sha}/${encoded}${target.search}${target.hash}`;
  const directory = !path || pathType?.(repo, path) === 'tree' || target.pathname.endsWith('/');
  if (!path) return `https://github.com/${repo}${target.search}${target.hash}`;
  return `https://github.com/${repo}/${directory ? 'tree' : 'blob'}/${sha}/${encoded}${target.search}${target.hash}`;
}

export function rewriteUrl(value, ctx, asset = false) {
  let url = value.trim();
  if (!url || url.startsWith('#') || url.startsWith('?')) return url;
  const repo = repositoryName(ctx.repo);
  // URL handles dot segments, encoded spaces, queries and fragments uniformly.
  const origin = 'https://repository.invalid';
  let target;
  try {
    url = ctx.resolveArchiveLink?.(ctx.path, url) ?? url;
    target = new URL(url, `${origin}/${encodePath(ctx.path)}`);
    if (!['http:', 'https:'].includes(target.protocol)) return url;
    const path = decodeURIComponent(target.pathname).replace(/^\/+|\/+$/g, '');
    if (target.origin === origin) return targetUrl(target, { ...ctx, repo, path }, asset);
    if (asset && target.hostname === 'raw.githubusercontent.com') {
      const [owner, name, ref, ...parts] = path.split('/');
      const linkedRepo = `${owner}/${name}`;
      const linkedSha = linkedRepo.toLowerCase() === repo.toLowerCase() ? ctx.sha : ctx.repoSha?.(linkedRepo);
      if (linkedSha && ref === (ctx.defaultBranch?.(linkedRepo) ?? 'main')) {
        return targetUrl(target, { ...ctx, repo: linkedRepo, sha: linkedSha, path: parts.join('/') }, true);
      }
      return url;
    }
    if (target.hostname !== 'github.com') return url;
    const [owner, name, view, ref, ...parts] = path.split('/');
    if (!owner || !name) return url;
    const linkedRepo = owner.toLowerCase() === 'griboedow' ? `Griboedow/${name}` : `${owner}/${name}`;
    const same = linkedRepo.toLowerCase() === repo.toLowerCase();
    const linkedSha = same ? ctx.sha : ctx.repoSha?.(linkedRepo);
    if (!view && !target.search && !asset) {
      const page = ctx.resolvePage?.(linkedRepo, 'README.md');
      return page ? page + target.hash : url;
    }
    if (!['blob', 'tree', 'raw'].includes(view)) return url;
    const linkedPath = parts.join('/');
    if (ref !== (ctx.defaultBranch?.(linkedRepo) ?? 'main') && ref !== linkedSha) return url;
    if (view !== 'raw' && !asset && !target.search && !/^#L\d+(?:-L\d+)?$/.test(target.hash)) {
      const page = ctx.resolvePage?.(linkedRepo, linkedPath) ||
        ctx.resolvePage?.(linkedRepo, posix.join(linkedPath, 'README.md'));
      if (page) return page + target.hash;
    }
    if (asset && linkedSha) return targetUrl(target, { ...ctx, repo: linkedRepo, sha: linkedSha, path: linkedPath }, true);
    return url;
  } catch (error) {
    if (error instanceof URIError || error instanceof TypeError && error.code === 'ERR_INVALID_URL') return url;
    throw error;
  }
}

const allowedTags = [
  ...sanitizeHtml.defaults.allowedTags, 'details', 'summary', 'img', 'figure', 'figcaption',
  'kbd', 'samp', 'var', 'abbr', 'mark', 'del', 'ins', 'sub', 'sup', 'video', 'source',
];
const allowedAttributes = {
  a: ['href', 'title', 'id', 'name'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'align'],
  video: ['src', 'poster', 'width', 'height', 'controls', 'preload'],
  source: ['src', 'type'],
  details: ['open'],
  ol: ['start', 'reversed'],
  th: ['align', 'colspan', 'rowspan', 'style'],
  td: ['align', 'colspan', 'rowspan', 'style'],
  code: ['class'],
};
for (let level = 1; level <= 6; level++) allowedAttributes[`h${level}`] = ['id'];

// Keep authored HTML on an allowlist. Preserve the renderer's own KaTeX markup
// separately so its MathML, SVG and layout styles survive without trusting those
// same tags and attributes in repository Markdown.
export function renderMarkdown(source, ctx) {
  const marker = 'RESEARCHMATH' + randomBytes(16).toString('hex') + 'X';
  const equations = [];
  const md = new MarkdownIt({ html: true, linkify: true })
    .use(katex, {
      delimiters: 'all', mathFence: true, trust: false, throwOnError: false,
      logger: () => 'ignore',
      transformer: html => marker + (equations.push(html) - 1) + 'END',
    })
    .use(markdownAnchor, { slugify: slug, getTokensText: plainText, tabIndex: false });
  md.inline.ruler.before('math_inline_dollar', 'github_inline_math', githubInlineMath);
  // A plain DOI, URL or email is linked; prose such as a source filename stays text.
  md.linkify.set({ fuzzyLink: false });
  const safe = sanitizeHtml(md.render(source), {
    allowedTags,
    allowedAttributes,
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http'], source: ['https', 'http'], video: ['https', 'http'] },
    allowedStyles: { '*': { 'text-align': [/^(?:left|center|right)$/] } },
    transformTags: {
      a: (tagName, attribs) => {
        if (attribs.href) attribs.href = rewriteUrl(attribs.href, ctx);
        return { tagName, attribs };
      },
      img: (tagName, attribs) => {
        if (attribs.src) attribs.src = rewriteUrl(attribs.src, ctx, true);
        return { tagName, attribs: { ...attribs, loading: 'lazy', decoding: 'async' } };
      },
      video: (tagName, attribs) => {
        if (attribs.src) attribs.src = rewriteUrl(attribs.src, ctx, true);
        if (attribs.poster) attribs.poster = rewriteUrl(attribs.poster, ctx, true);
        return { tagName, attribs: { ...attribs, controls: 'controls', preload: 'none' } };
      },
      source: (tagName, attribs) => {
        if (attribs.src) attribs.src = rewriteUrl(attribs.src, ctx, true);
        return { tagName, attribs };
      },
    },
  });
  return safe.replace(new RegExp(marker + '(\\d+)END', 'g'), (_, index) => equations[Number(index)]);
}
