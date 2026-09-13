import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';

const python = process.env.RUNTIME_LOCK_PYTHON;
assert(python, 'RUNTIME_LOCK_PYTHON must select a real Python 3.11 interpreter');
const root = path.resolve(import.meta.dirname, '../../..');
const run = (command, args, options = {}) => execFileSync(command, args,
  { encoding: 'utf8', timeout: 180000, maxBuffer: 8388608, ...options });

function install(directory, group) {
  run('uv', ['venv', '--python', python, directory]);
  const executable = path.join(directory, 'bin/python');
  run('uv', ['pip', 'install', '--python', executable, '--require-hashes', '--only-binary', ':all:',
    '-r', path.join(root, `docker/python-tools/${group}.txt`)]);
  run('uv', ['pip', 'check', '--python', executable]);
  return executable;
}

function inventory(executable) {
  return run(executable, ['-c', 'import hashlib,importlib.metadata,json; print(json.dumps(sorted((d.metadata["Name"],d.version,hashlib.sha256(d.read_text("METADATA").encode()).hexdigest()) for d in importlib.metadata.distributions())))']);
}

test('actual Python wheel installs repeat the complete inventory and execute installed analyzers', { timeout: 900000 }, t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-wheel-rebuild-'));
  try {
    assert.match(run(python, ['--version']), /^Python 3\.11\./);
    for (const group of ['common', 'semgrep-nova', 'buster']) {
      const first = install(path.join(temporary, `${group}-first`), group);
      const second = install(path.join(temporary, `${group}-second`), group);
      assert.equal(inventory(first), inventory(second));
      t.diagnostic(`${group}: two isolated actual installs; ${JSON.parse(inventory(first)).length} identical package versions and metadata hashes`);
    }
    const bin = path.join(temporary, 'buster-first/bin');
    assert.match(run(path.join(bin, 'ruff'), ['--version']), /^ruff /);
    assert.match(run(path.join(bin, 'mypy'), ['--version']), /^mypy /);
    assert.match(run(path.join(bin, 'pip-audit'), ['--version']), /^pip-audit /);
    const file = path.join(temporary, 'bad.py');
    fs.writeFileSync(file, 'import os\nvalue: int = "wrong type"\n');
    for (const [tool, args, expected] of [
      ['ruff', ['check', file], /F401/],
      ['mypy', ['--no-incremental', file], /Incompatible types in assignment/],
    ]) {
      const result = spawnSync(path.join(bin, tool), args, { encoding: 'utf8', timeout: 30000 });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stdout, expected);
    }
    const environment = { ...process.env, SEMGREP_ENABLE_VERSION_CHECK: '0', SEMGREP_SEND_METRICS: 'off' };
    const semgrepVersion = fs.readFileSync(path.join(root, 'docker/python-tools/buster.in'), 'utf8').split('\n').find(line => line.startsWith('semgrep==')).slice('semgrep=='.length);
    assert.equal(run(path.join(bin, 'semgrep'), ['--version'], { env: environment, timeout: 60000 }).trim(), semgrepVersion);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('the real wheel installer refuses a deliberately wrong hash', { timeout: 240000 }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-wheel-digest-'));
  try {
    const selected = fs.readFileSync(path.join(root, 'docker/python-tools/common.in'), 'utf8').split('\n').find(line => line.startsWith('ruff=='));
    const requirements = path.join(temporary, 'invalid.txt');
    fs.writeFileSync(requirements, `${selected} --hash=sha256:${'0'.repeat(64)}\n`);
    const result = spawnSync('uv', ['pip', 'install', '--python', python, '--target', path.join(temporary, 'destination'),
      '--no-cache', '--no-deps', '--require-hashes', '--only-binary', ':all:', '-r', requirements],
    { encoding: 'utf8', timeout: 180000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Hash mismatch|hash mismatch/);
    assert.equal(fs.existsSync(path.join(temporary, 'destination/bin/ruff')), false);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
