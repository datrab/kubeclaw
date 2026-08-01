import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const packageRoots = [
  'skills/common/plugins',
  'skills/nova/plugins',
  'skills/buster/plugins',
];
const plugins = packageRoots
  .flatMap((packageRoot) => fs.readdirSync(path.join(root, packageRoot), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, packageRoot, entry.name)))
  .filter((pluginRoot) => fs.existsSync(path.join(pluginRoot, 'plugin.json')))
  .sort();

const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-plugin-artifacts-'));
try {
  for (const pluginRoot of plugins) {
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf8'));
    if (manifest.apiVersion !== 'pipeline-plugin-v2') continue;
    const tsconfig = path.join(pluginRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfig)) throw new Error(`v2 plugin has no tsconfig.json: ${pluginRoot}`);
    const output = path.join(outputRoot, manifest.id);
    execFileSync('tsc', [
      '-p', tsconfig,
      '--noEmit', 'false',
      '--declaration', 'false',
      '--declarationMap', 'false',
      '--outDir', output,
    ], { cwd: root, stdio: 'inherit' });
    const emitted = [...walk(output)].filter((file) => file.endsWith('.js'));
    if (emitted.length === 0) throw new Error(`v2 plugin emitted no JavaScript artifact: ${manifest.id}`);
  }
} finally {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(target);
    else if (entry.isFile()) yield target;
  }
}
