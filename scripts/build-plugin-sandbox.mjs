import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve('skills/common/plugin-runtime/foundation/isolation/sandbox.c');
const output = path.resolve('skills/common/plugin-runtime/foundation/isolation/plugin-sandbox');
const temporary = `${output}.tmp-${process.pid}`;
const result = spawnSync('cc', [
  '-std=c11',
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
