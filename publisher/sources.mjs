import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const repositories = ['chua-gpu-atlas', 'chaos-attractor-lab', 'math-models'];

function git(directory, args, input = '') {
  return new Promise((resolveOutput, reject) => {
    const child = spawn('git', ['-C', directory, ...args], {
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    const output = [];
    const errors = [];
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.on('data', chunk => errors.push(chunk));
    child.on('error', reject);
    child.stdin.on('error', error => {
      if (error.code !== 'EPIPE') reject(error);
    });
    child.on('close', code => {
      if (code === 0) resolveOutput(Buffer.concat(output));
      else reject(new Error(`git ${args.join(' ')} failed in ${directory}: ${Buffer.concat(errors).toString().trim()}`));
    });
    child.stdin.end(input);
  });
}

// The prefetch is one network request for all missing reports. Letting cat-file
// discover missing blobs itself would make a separate request for each one.
async function readMarkdownBlobs(directory, ids) {
  const contents = new Map();
  if (!ids.length) return contents;
  const localObjects = await git(directory, ['cat-file', '--batch-all-objects', '--unordered', '--batch-check=%(objectname)']);
  const local = new Set(localObjects.toString().trim().split('\n'));
  const missing = ids.filter(id => !local.has(id));
  if (missing.length) {
    await git(directory, ['-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '--no-tags',
      '--no-write-fetch-head', '--no-auto-maintenance', '--no-recurse-submodules',
      '--filter=blob:none', '--stdin', 'origin'], missing.join('\n') + '\n');
  }

  const batch = await git(directory, ['cat-file', '--batch'], ids.join('\n') + '\n');
  let offset = 0;
  for (const id of ids) {
    const end = batch.indexOf(10, offset);
    const [received, type, sizeText] = batch.toString('ascii', offset, end).split(' ');
    const size = Number(sizeText);
    if (end < 0 || received !== id || type !== 'blob' || !Number.isSafeInteger(size) || size < 0 ||
        batch[end + 1 + size] !== 10) {
      throw new Error(`Unexpected git cat-file response for ${id} in ${directory}`);
    }
    contents.set(id, batch.toString('utf8', end + 1, end + 1 + size).replace(/^\uFEFF/, ''));
    offset = end + size + 2;
  }
  return contents;
}

async function loadRepository(cache, repo) {
  const directory = join(cache, repo + '.git');
  if (existsSync(join(directory, 'HEAD'))) {
    await git(directory, ['fetch', '--depth=1', '--filter=blob:none', '--no-tags', 'origin',
      '+refs/heads/main:refs/heads/main']);
  } else {
    await git(cache, ['clone', '--bare', '--depth=1', '--filter=blob:none', '--single-branch',
      '--branch=main', '--no-tags', `https://github.com/Griboedow/${repo}.git`, directory]);
  }

  const sha = (await git(directory, ['rev-parse', 'refs/heads/main^{commit}'])).toString().trim();
  const tree = await git(directory, ['ls-tree', '-rz', '--full-tree', sha]);
  const files = new Set();
  const markdown = new Map();
  for (const entry of tree.toString().split('\0')) {
    if (!entry) continue;
    const tab = entry.indexOf('\t');
    const [mode, , id] = entry.slice(0, tab).split(' ');
    const path = entry.slice(tab + 1);
    files.add(path);
    if ((mode === '100644' || mode === '100755') && /\.(?:md|markdown)$/i.test(path)) markdown.set(path, id);
  }
  const blobs = await readMarkdownBlobs(directory, [...new Set(markdown.values())]);
  const documents = new Map([...markdown].map(([path, id]) => [path, blobs.get(id)]));
  return { repo, sha, files, documents };
}

export async function loadSources(cacheDirectory) {
  const cache = resolve(cacheDirectory);
  await mkdir(cache, { recursive: true });
  return Promise.all(repositories.map(repo => loadRepository(cache, repo)));
}
