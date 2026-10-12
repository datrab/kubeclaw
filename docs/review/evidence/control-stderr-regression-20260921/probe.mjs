import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const results = [];
for (const [name, statement, expectedExit] of [
  ['original-console', 'console.error("test log");', 0],
  ['replacement-stream', 'process.stderr.write("test log\\n");', 1],
]) {
  const source = 'const fs=require("node:fs"); const stream=process.stderr; fs.closeSync(2); '
    + statement + ' setTimeout(()=>process.stdout.write("alive\\n"),20);';
  const result = spawnSync(process.execPath, ['-e', source], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, expectedExit);
  assert.equal(result.stdout, expectedExit === 0 ? 'alive\n' : '');
  results.push({ name, source, exitCode: result.status, stdout: result.stdout, stderr: result.stderr });
}
console.log(JSON.stringify({ node: process.version,
  scope: 'Minimal runtime counterexample; not an HTTP integration or acceptance test', results }, null, 2));
