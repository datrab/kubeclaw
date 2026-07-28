import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const packageRoots = [
  'skills/common/plugins',
  'skills/nova/plugins',
  'skills/buster/plugins',
];
const roots = packageRoots.flatMap((packageRoot) => fs.readdirSync(packageRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packageRoot, entry.name)))
  .filter((root) => fs.existsSync(path.join(root, 'plugin.json')))
  .sort();

for (const root of roots) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  if (manifest.apiVersion !== 'pipeline-plugin-v2') continue;
  const tsconfig = path.join(root, 'tsconfig.json');
  if (!fs.existsSync(tsconfig)) throw new Error(`v2 plugin has no tsconfig.json: ${root}`);
  execFileSync('tsc', ['-p', tsconfig], { stdio: 'inherit' });
}
