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
    path: 'docs/chua-refined-atlas.md',
    sourceImage: 'docs/assets/chua-readme-layers-poster.png',
    // The left panel shows the 3D layers. Keep its axes in the thumbnail.
    crop: [0.115, 0.185, 0.567, 0.897],
    sourceLicense: 'LICENSE',
    image: '/assets/chua-periodic-orbit-layers.webp',
    license: '/assets/chua-license.txt',
    alt: 'Overlapping colored sheets in the three-parameter atlas of periodic orbits in Chua’s circuit.',
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
    limit = int(sys.argv[2])
    crop = json.loads(sys.argv[3])
    if crop:
        dimensions = (figure.width, figure.height, figure.width, figure.height)
        figure = figure.crop(tuple(round(fraction * size) for fraction, size in zip(crop, dimensions)))
    figure.thumbnail((limit, limit), Image.Resampling.LANCZOS)
    figure.save(sys.argv[1], format="WEBP", quality=88, method=6)
    background = "#%02x%02x%02x" % figure.convert("RGB").getpixel((0, 0))
    print(json.dumps([*figure.size, background]))
`;

async function readSource(cacheDirectory, project, path) {
  const directory = resolve(cacheDirectory, project.repo + '.git');
  const { stdout } = await execute('git', ['-C', directory, 'cat-file', 'blob', project.sha + ':' + path], {
    windowsHide: true, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout;
}

export async function createThumbnail(project, sourcePath, targetFile, cacheDirectory, limit = 1200, crop = null) {
  const source = await readSource(cacheDirectory, project, sourcePath);
  const conversion = execute(process.env.PYTHON || 'python', ['-c', thumbnail, targetFile, String(limit), JSON.stringify(crop)], { windowsHide: true });
  const [{ stdout }] = await Promise.all([conversion, pipeline(Readable.from([source]), conversion.child.stdin)]);
  const [width, height, background] = JSON.parse(stdout);
  return { width, height, background };
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
    const dimensions = await createThumbnail(project, card.sourceImage, join(directory, basename(card.image)), cacheDirectory, 1200, card.crop);
    await writeFile(join(directory, basename(card.license)), license);
    ready.push({ ...card, ...dimensions });
  }
  return ready;
}
