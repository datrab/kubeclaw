import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve('skills/common/plugin-runtime/foundation/isolation/sandbox.c');
const arguments_ = process.argv.slice(2);
const restricted = arguments_[0] === '--buster-browser-helper';
if (arguments_.length !== 0 && (!restricted || arguments_.length !== 2 || !arguments_[1])) {
  throw new Error('Usage: build-plugin-sandbox.mjs [--buster-browser-helper OUTPUT]');
}
const output = path.resolve(restricted ? arguments_[1] : 'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox');
const temporary = `${output}.tmp-${process.pid}`;
const result = spawnSync('cc', [
  '-std=c11',
  '-Wall', '-Wextra', '-Werror',
  ...(restricted ? ['-DKUBECLAW_BUSTER_BROWSER_IDENTITY=1'] : []),
  '-O2',
  '-fPIE',
  '-pie',
  '-fstack-protector-strong',
  '-D_FORTIFY_SOURCE=2',
  '-Wl,-z,relro,-z,now',
  '-o',
  temporary,
  source,
], { stdio: 'inherit' });
if (result.status !== 0) {
  fs.rmSync(temporary, { force: true });
  process.exit(result.status ?? 1);
}
fs.chmodSync(temporary, 0o755);
fs.renameSync(temporary, output);
