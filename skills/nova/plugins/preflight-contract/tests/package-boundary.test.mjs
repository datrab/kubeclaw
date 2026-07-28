import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

for (const directory of ['src', 'dist']) {
  for (const name of fs.readdirSync(path.resolve(directory), { recursive: true })) {
    const file = path.resolve(directory, name);
    if (!fs.statSync(file).isFile() || !/\.[cm]?[jt]s$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /skills\/nova\/pipeline|validation-blueprint|validation\.ts/);
    assert.doesNotMatch(source, /\bcommand\.execute\b/);
  }
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.preflight-contract', suite: 'package-boundary' }));
