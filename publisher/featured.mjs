import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);

// The selections point to original reports and their figures. Titles, summaries
// and article bodies are read from the research repositories by the publisher.
export const featured = [
  {
    repo: 'chaos-attractor-lab',
    path: 'results/wow_search_20261122/symmetry/README.md',
    sourceImage: 'results/wow_search_20261122/symmetry/cyclic-13745.png',
    sourceLicense: 'LICENSE',
    image: '/assets/chaos-two-ring-orbit.webp',
    license: '/assets/chaos-license.txt',
    alt: 'An orbit-density plot with a ring of blue lobes inside a scalloped outer rim.',
  },
  {
    repo: 'chua-gpu-atlas',
    path: 'docs/chua-saddle-residence.md',
    sourceImage: 'results/chua-saddle-residence/voltage-start-residence.png',
    sourceLicense: 'LICENSE',
    image: '/assets/chua-voltage-returns.webp',
    license: '/assets/chua-license.txt',
    alt: 'Four plots compare voltage launches, departures from a saddle cycle and the predicted number of turns.',
  },
  {
    repo: 'math-models',
    path: 'yarn/stand-simulator/docs/pitaya-v11.md',
    sourceImage: 'yarn/stand-simulator/results/pitaya_v11_validation/yarn_escape.png',
    sourceLicense: 'yarn/stand-simulator/LICENSE',
    image: '/assets/models-yarn-clearance.webp',
    license: '/assets/models-yarn-clearance-LICENSE.txt',
    alt: 'Two CAD views show the same strand beneath the original and revised yarn-stand leaves.',
  },
];

const thumbnail = `
import io, json, sys
from PIL import Image

with Image.open(io.BytesIO(sys.stdin.buffer.read())) as figure:
    figure.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    figure.save(sys.argv[1], format="WEBP", quality=88, method=6)
    print(json.dumps(figure.size))
`;

async function readSource(cacheDirectory, project, path) {
  const directory = resolve(cacheDirectory, project.repo + '.git');
  const { stdout } = await execute('git', ['-C', directory, 'cat-file', 'blob', project.sha + ':' + path], {
    windowsHide: true, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout;
}

export async function createFeaturedImages(projects, distDirectory, cacheDirectory) {
  const directory = join(distDirectory, 'assets');
  await mkdir(directory, { recursive: true });
  const ready = [];
  for (const card of featured) {
    const project = projects.find(item => item.repo === card.repo);
    if (!project?.files.has(card.path) || !project.files.has(card.sourceImage) || !project.files.has(card.sourceLicense)) {
      console.warn(`Skipping unavailable featured report or figure: ${card.repo}/${card.path}`);
      continue;
    }
    const license = await readSource(cacheDirectory, project, card.sourceLicense);
    const source = await readSource(cacheDirectory, project, card.sourceImage);
    const conversion = execute(process.env.PYTHON || 'python', ['-c', thumbnail, join(directory, basename(card.image))], { windowsHide: true });
    const [{ stdout }] = await Promise.all([conversion, pipeline(Readable.from([source]), conversion.child.stdin)]);
    const [width, height] = JSON.parse(stdout);
    await writeFile(join(directory, basename(card.license)), license);
    ready.push({ ...card, width, height });
  }
  return ready;
}
