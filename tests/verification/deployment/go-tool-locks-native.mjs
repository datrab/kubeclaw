import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';

const go = process.env.RUNTIME_LOCK_GO;
assert(go, 'RUNTIME_LOCK_GO must select the real committed Go toolchain');
const root = path.resolve(import.meta.dirname, '../../..');
const modules = ['honnef.co/go/tools/cmd/staticcheck', 'golang.org/x/vuln/cmd/govulncheck', 'github.com/fzipp/gocyclo/cmd/gocyclo'];

test('two isolated Go builds consume committed sums and produce identical analyzer bytes', { timeout: 1200000 }, t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-go-rebuild-'));
  try {
    const requirements = JSON.parse(fs.readFileSync(path.join(root, 'docker/go-tools/requirements.json'), 'utf8'));
    const version = execFileSync(go, ['version'], { encoding: 'utf8', env: { ...process.env, GOTOOLCHAIN: 'local' } });
    assert.ok(version.startsWith(`go version go${requirements.GO_VERSION} `));
    const builds = [];
    for (const name of ['first', 'second']) {
      const cwd = path.join(temporary, name);
      fs.cpSync(path.join(root, 'docker/go-tools'), cwd, { recursive: true });
      const env = { ...process.env, GOTOOLCHAIN: 'local', GOCACHE: path.join(cwd, 'cache'),
        GOMODCACHE: path.join(cwd, 'modules'), GOBIN: path.join(cwd, 'bin') };
      execFileSync(go, ['install', '-p=2', '-mod=readonly', '-trimpath', ...modules], { cwd, env, timeout: 540000, stdio: ['ignore', 'pipe', 'inherit'] });
      assert.equal(execFileSync(go, ['mod', 'verify'], { cwd, env, encoding: 'utf8', timeout: 30000 }).trim(), 'all modules verified');
      builds.push(Object.fromEntries(['staticcheck', 'govulncheck', 'gocyclo'].map(tool =>
        [tool, createHash('sha256').update(fs.readFileSync(path.join(cwd, 'bin', tool))).digest('hex')])));
      assert.ok(execFileSync(path.join(cwd, 'bin/staticcheck'), ['-version'], { encoding: 'utf8', timeout: 30000 }).startsWith(`staticcheck ${requirements.STATICCHECK_VERSION} `));
    }
    assert.deepEqual(builds[0], builds[1]);
    t.diagnostic(JSON.stringify({ goVersion: version.trim(), binarySha256: builds[0] }));
    const invalid = path.join(temporary, 'invalid');
    fs.cpSync(path.join(root, 'docker/go-tools'), invalid, { recursive: true });
    const sum = path.join(invalid, 'go.sum');
    const original = fs.readFileSync(sum, 'utf8');
    const changed = original.replace(/^(github\.com\/fzipp\/gocyclo v[^ /]+ h1:)[^\n]+$/m, `$1${'A'.repeat(43)}=`);
    assert.notEqual(changed, original);
    fs.writeFileSync(sum, changed);
    const result = spawnSync(go, ['mod', 'download', 'github.com/fzipp/gocyclo'], { cwd: invalid,
      env: { ...process.env, GOTOOLCHAIN: 'local', GOMODCACHE: path.join(invalid, 'modules') }, encoding: 'utf8', timeout: 180000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /checksum mismatch/);
  } finally {
    for (const name of ['first', 'second', 'invalid']) {
      execFileSync(go, ['clean', '-modcache'], { cwd: temporary, timeout: 30000,
        env: { ...process.env, GOTOOLCHAIN: 'local', GOMODCACHE: path.join(temporary, name, 'modules') } });
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
