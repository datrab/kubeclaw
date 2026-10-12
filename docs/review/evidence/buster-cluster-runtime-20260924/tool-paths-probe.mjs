import assert from 'node:assert/strict';
import { execFile, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
const run = promisify(execFile);
const success = ['-e', 'process.stdout.write("out"); process.stderr.write("err");'];
const failure = ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exitCode=7;'];
const pending = run(process.execPath, success, { encoding: 'utf8' });
assert(pending.child instanceof ChildProcess);
assert(Number.isInteger(pending.child.pid));
assert.deepEqual(await pending, { stdout: 'out', stderr: 'err' });
await assert.rejects(run(process.execPath, failure, { encoding: 'utf8' }), error => {
  assert.equal(error.code, 7); assert.equal(error.stdout, 'out'); assert.equal(error.stderr, 'err'); return true;
});
for (const [args, code] of [[success, null], [failure, 7]]) {
  await new Promise((resolve, reject) => {
    const child = execFile(process.execPath, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      try {
        assert.equal(error?.code ?? null, code); assert.equal(stdout, 'out'); assert.equal(stderr, 'err'); resolve();
      } catch (assertion) { reject(assertion); }
    });
    assert(child instanceof ChildProcess); assert(Number.isInteger(child.pid));
  });
}
for (const file of ['/usr/bin/tar', '/usr/bin/flock']) {
  const result = await run(file, ['--version'], { encoding: 'utf8' });
  assert.equal(typeof result.stdout, 'string'); assert(result.stdout.includes(file.split('/').at(-1)));
  assert.equal(result.stderr, '');
  const mappings = fs.readFileSync(process.env.LC_TOOL_MAPPING_LOG, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert(mappings.some(row => row.pid === process.pid && row.method === 'execFile:promisify'
    && row.requested === file && row.optionsUnchanged === true && row.arguments.join(' ') === '--version'));
}
console.log(JSON.stringify({ ok: true, callbackSuccessAndFailure: true, promiseSuccessAndFailure: true,
  realChild: true, actualMappedTarAndFlock: true, unmappedNode: true }));
