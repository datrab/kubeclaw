import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function syncCodexLock(root, update = false) {
  const packageRoot = path.join(root, 'ops/pod');
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package-lock.json'), 'utf8'));
  const expected = manifest.dependencies?.['@openai/codex'];
  const declared = lock.packages?.['']?.dependencies?.['@openai/codex'];
  const resolved = lock.packages?.['node_modules/@openai/codex']?.version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expected ?? '')) throw new Error('Invalid generated Codex package version');
  if (declared === expected && resolved === expected) return { changed: false, version: expected };
  if (!update) throw new Error(`Codex lock drift: expected ${expected}, declared ${declared}, resolved ${resolved}`);
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: packageRoot,
    stdio: 'inherit',
  });
  return { changed: true, version: expected };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || !['--check', '--write'].includes(process.argv[2]))
    throw new Error('Usage: node scripts/sync-codex-lock.mjs --check|--write');
  console.log(JSON.stringify(syncCodexLock(fileURLToPath(new URL('../', import.meta.url)), process.argv[2] === '--write')));
}
