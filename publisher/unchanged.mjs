import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { repositories } from './sources.mjs';

const live = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (live.publisher !== process.env.GITHUB_SHA) process.exit(1);
for (const repo of repositories) {
  const result = execFileSync('git', ['ls-remote', '--exit-code',
    'https://github.com/Griboedow/' + repo + '.git', 'refs/heads/main'], { encoding:'utf8' });
  if (result.split(/\s+/)[0] !== live.sources?.[repo]) process.exit(1);
}
