import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt();
const origin = 'https://repository.invalid';
const encode = path => path.split('/').map(encodeURIComponent).join('/');
const heading = source => source.match(/^#\s+(.+?)\s*$/m)?.[1];

// The export archive at 136033e and manuscript move at 33a26d9 removed these
// exact paths. The two revisions below are the respective parent commits.
const oldPapers = new Map([
  ['papers/raar-folding/manuscript.pdf', '2ff2973cfdfaa9bac23a7e7b4cf1ff22439de228'],
  ['papers/raar-symbolic-dynamics/manuscript.pdf', '2ff2973cfdfaa9bac23a7e7b4cf1ff22439de228'],
  ['papers/raar-trapping/manuscript.pdf', '2ff2973cfdfaa9bac23a7e7b4cf1ff22439de228'],
  ['papers/raar-trapping/README.md', '50bd2b861e018563fb873247f07c47370d8ebfa4'],
  ['papers/raar-critical-membership/README.md', '50bd2b861e018563fb873247f07c47370d8ebfa4'],
]);

function relativeLinks(source) {
  const result = new Set();
  for (const block of markdown.parse(source, {})) {
    for (const token of block.children || []) {
      if (token.type === 'link_open') result.add(token.attrGet('href'));
      if (token.type === 'image') result.add(token.attrGet('src'));
    }
  }
  return result;
}

export function createArchiveLinkResolver(project) {
  if (project.repo !== 'chaos-attractor-lab') return () => undefined;
  const manuscripts = new Map();
  const evidence = new Map();
  const bases = new Map();
  for (const [path, source] of project.documents) {
    if (!path.startsWith('docs/')) continue;
    const title = heading(source);
    if (title) manuscripts.set(title, manuscripts.has(title) ? null : path);
  }
  for (const [path, source] of project.documents) {
    if (!path.startsWith('results/')) continue;
    const manuscript = manuscripts.get(heading(source));
    if (manuscript) bases.set(path, manuscript);
  }
  function exists(path) {
    const name = path.replace(/\/$/, '');
    return project.files.has(name) || project.directories?.has(name);
  }

  // Return a repository-root-relative target or an immutable GitHub URL. Only
  // replace broken relative paths. Matching manuscript titles alone are not
  // evidence that an individual link points to the same figure or dataset.
  return (path, href) => {
    if (!path.startsWith('results/') || !href || /^(?:[a-z][a-z\d+.-]*:|[/?#])/i.test(href)) return;
    const url = new URL(href, origin + '/' + encode(path));
    if (url.origin !== origin) return;
    const target = decodeURIComponent(url.pathname).slice(1);
    if (exists(target)) return;
    const revision = oldPapers.get(target);
    if (revision) return 'https://github.com/Griboedow/chaos-attractor-lab/blob/' + revision + url.pathname + url.search + url.hash;
    const manuscript = bases.get(path);
    if (!manuscript) return;
    if (!evidence.has(manuscript)) evidence.set(manuscript, relativeLinks(project.documents.get(manuscript)));
    const studyDirectory = path.split('/').slice(0, 2).join('/');
    // An earlier draft can intentionally cite an earlier dataset that was
    // replaced in the current article. Honour its explicit results/<study>/
    // path from docs/ only for data inside this snapshot's own study.
    const explicitStudyFile = /^docs\/[^/]+$/.test(manuscript) && href.startsWith('../' + studyDirectory + '/');
    if (!evidence.get(manuscript).has(href) && !explicitStudyFile) return;
    const recovered = new URL(href, origin + '/' + encode(manuscript));
    if (exists(decodeURIComponent(recovered.pathname).slice(1))) return recovered.pathname + recovered.search + recovered.hash;
  };
}
