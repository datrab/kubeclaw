import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { activate } from '../src/adapter.ts';
import { requireRepositoryPath } from '../src/engine/paths.ts';
import { safeExec, requireToolExecution } from '../src/engine/execution.ts';

const repository = path.resolve(import.meta.dirname, '../../../../..');
process.env.PATH = `${path.join(repository, 'node_modules/.bin')}:${process.env.PATH}`;

function fixture() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-remediation-'));
  const root = path.join(temporary, 'repository');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'source.js'), 'const used = 1; console.log(used);\n');
  const config = path.join(temporary, 'eslint.config.mjs');
  fs.writeFileSync(config, 'export default [{ rules: { "no-unused-vars": "error" } }];');
  fs.writeFileSync(path.join(temporary, 'lint-baseline.json'), JSON.stringify({ schema_version: 'pipeline_lint_baseline.v2', groups: [] }));
  const policy = JSON.parse(fs.readFileSync(path.join(repository, 'charts/kubeclaw/files/config/lint-policy.json')));
  policy.baseline_path = 'lint-baseline.json';
  policy.kubernetes_policy_packs = [];
  policy.projects = [{ id: 'fixture', root: '.', discovery_max_depth: 4, languages: ['javascript'], language_evidence: { javascript: ['**/*.js'] }, go: { modules: [] }, terraform: { roots: [] } }];
  policy.architecture = { layers: [{ id: 'fixture', roots: ['.'], may_depend_on: ['fixture'] }] };
  policy.experimental_tools = policy.tools.map((tool) => tool.id).filter((id) => id !== 'eslint');
  policy.tools = policy.tools.map((tool) => ({ ...tool,
    targets: tool.languages.length === 1 && ['go', 'terraform'].includes(tool.languages[0]) ? [] : ['.'],
    config_path: tool.id === 'eslint' ? config : null,
    ...(['go-vet', 'go-imports', 'staticcheck', 'govulncheck'].includes(tool.id) ? { arguments: [] } : {}),
  }));
  const policyPath = path.join(temporary, 'lint-policy.json');
  const writePolicy = () => fs.writeFileSync(policyPath, JSON.stringify(policy));
  writePolicy();
  const adapter = activate({ config: { allowedRepositoryRoots: [root], allowedPolicyRoots: [temporary] } });
  const invoke = (payload = {}, signal = new AbortController().signal) => adapter.invoke({
    signal, confidential: true,
    request: { capability: 'lint.execute', operation: 'run_report', payload: {
      workingDirectory: root, policyPath, policyProject: 'fixture', tier: 'full', ...payload,
    } },
  });
  const close = async () => { await adapter.shutdown(); fs.rmSync(temporary, { recursive: true, force: true }); };
  return { temporary, root, config, policy, writePolicy, adapter, invoke, close };
}

async function waitFor(file) {
  const until = Date.now() + 5000;
  while (!fs.existsSync(file)) {
    if (Date.now() > until) throw new Error(`native process did not become ready: ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function running(pid, hostPid) {
  try {
    process.kill(pid, 0);
    if (hostPid) return !/^.*\) Z /u.test(fs.readFileSync(`/proc/${hostPid}/stat`, 'utf8'));
    return true;
  }
  catch (error) { if (error.code === 'ESRCH' || error.code === 'ENOENT') return false; throw error; }
}

function slowRule(config, marker) {
  // This is a real ESLint rule executed by the installed ESLint binary. It does
  // analysis work long enough to exercise cancellation and spawns a real child.
  const childCode = `const fs = require('node:fs'); process.on('SIGTERM', () => {}); fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ parent: process.ppid, child: process.pid, hostPid: Number(fs.readFileSync('/proc/self/status', 'utf8').match(/^NSpid:\\s+(\\d+)/m)[1]), cwd: process.cwd() })); setInterval(() => {}, 1000);`;
  fs.writeFileSync(config, `import { spawn } from 'node:child_process';
export default [{ plugins: { regression: { rules: { work: {
  create() { spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: 'ignore' });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000); return {}; }
} } } }, rules: { 'regression/work': 'error' } }];`);
}

test('native timeout, failed start, ordinary nonzero, and output overflow remain distinct', async () => {
  const timeout = await safeExec('/bin/sleep', ['2'], { timeout: 20 });
  assert.equal(timeout.timedOut, true);
  assert.throws(() => requireToolExecution(timeout, 'probe'), { code: 'probe-timeout' });
  const missing = await safeExec('/definitely-missing-lint-program', [], { timeout: 1000 });
  assert.equal(missing.exitCode, -1);
  assert.notEqual(missing.timedOut, true);
  assert.throws(() => requireToolExecution(missing, 'probe'), { code: 'probe-execution-failed' });
  const finding = await safeExec(process.execPath, ['-e', 'console.log("finding"); process.exitCode = 1;']);
  assert.equal(requireToolExecution(finding, 'probe').exitCode, 1);
  assert.equal(finding.stdout, 'finding\n');
  const overflow = await safeExec(process.execPath, ['-e', 'process.stdout.write("x".repeat(11 * 1024 * 1024))']);
  assert.equal(overflow.exitCode, -1);
  assert.notEqual(overflow.timedOut, true);
  assert.match(overflow.error, /output limit/);
});

test('real adapter and ESLint retain clean/finding results and deny escaping paths', async () => {
  const f = fixture();
  try {
    assert.equal((await f.invoke()).report.summary.total_errors, 0);
    fs.writeFileSync(path.join(f.root, 'source.js'), 'const unused = 1;\n');
    assert.equal((await f.invoke({ changedFiles: ['source.js'] })).report.summary.total_errors, 1);
    const outside = path.join(f.temporary, 'outside'); fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'external.js'), 'const external = 1;');
    const link = path.join(f.root, 'escape'); fs.symlinkSync(outside, link);
    // Full native directory target includes a symlink entry even when generic
    // discovery would skip that entry. It must reject before ESLint reads it.
    await assert.rejects(f.invoke(), /LINT_REPOSITORY_PATH_DENIED/);
    assert.throws(() => requireRepositoryPath(f.root, path.join(link, 'missing/deleted.js')), /LINT_REPOSITORY_PATH_DENIED/);
    f.policy.global_exclusions.push('escape/**');
    f.writePolicy();
    for (const payload of [
      { changedFiles: ['escape/external.js'] },
      { changedFiles: ['escape/missing/deleted.js'] },
      { modulePath: 'escape' },
    ]) await assert.rejects(f.invoke(payload), /LINT_REPOSITORY_PATH_DENIED/);
    f.policy.projects[0].root = 'escape'; f.writePolicy();
    await assert.rejects(f.invoke(), /LINT_REPOSITORY_PATH_DENIED/);
    f.policy.projects[0].root = '.';
    f.policy.tools.find((tool) => tool.id === 'eslint').targets = ['escape']; f.writePolicy();
    await assert.rejects(f.invoke(), /LINT_REPOSITORY_PATH_DENIED/);
    fs.unlinkSync(link);
    f.policy.tools.find((tool) => tool.id === 'eslint').targets = ['.'];
    f.policy.global_exclusions = f.policy.global_exclusions.filter((pattern) => pattern !== 'escape/**');
    f.writePolicy();
    const deleted = await f.invoke({ changedFiles: ['missing/deleted.js'] });
    assert.equal(deleted.report.summary.tools_failed, 0);
    const inside = path.join(f.root, 'inside'); fs.mkdirSync(inside);
    fs.writeFileSync(path.join(inside, 'clean.js'), 'console.log(1);');
    fs.symlinkSync(inside, link);
    assert.equal((await f.invoke({ changedFiles: ['escape/clean.js'] })).report.summary.total_errors, 0);
  } finally { await f.close(); }
});

test('native tsconfig cannot consume an excluded source symlink outside the repository', async () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], skipLibCheck: true }, files: ['ignored.ts'] }));
    fs.writeFileSync(path.join(f.root, 'ignored.ts'), 'const value: number = 1;');
    f.policy.projects[0].languages = ['typescript'];
    f.policy.projects[0].language_evidence = { typescript: ['tsconfig.json'] };
    f.policy.experimental_tools = f.policy.tools.map((tool) => tool.id).filter((id) => id !== 'tsc');
    f.policy.global_exclusions.push('ignored.ts');
    f.writePolicy();
    assert.equal((await f.invoke()).report.summary.tools_failed, 0);
    const external = path.join(f.temporary, 'outside.ts');
    fs.writeFileSync(external, 'const value: number = "invalid";');
    fs.unlinkSync(path.join(f.root, 'ignored.ts'));
    fs.symlinkSync(external, path.join(f.root, 'ignored.ts'));
    const native = await safeExec('tsc', ['--noEmit', '--pretty', 'false', '--project', path.join(f.root, 'tsconfig.json')]);
    assert.match(native.stdout, /TS2322/);
    await assert.rejects(f.invoke(), /LINT_REPOSITORY_PATH_DENIED/);
  } finally { await f.close(); }
});

test('policy timeout becomes an explicit ESLint report error', async () => {
  const f = fixture();
  const marker = path.join(f.temporary, 'timeout-ready.json');
  try {
    slowRule(f.config, marker);
    f.policy.tools.find((tool) => tool.id === 'eslint').timeout_ms = 500;
    f.writePolicy();
    const { report } = await f.invoke();
    assert.equal(report.tools.eslint.status, 'error');
    assert.equal(report.tools.eslint.code, 'eslint-timeout');
    assert.equal(report.summary.tools_failed, 1);
    const native = await waitFor(marker);
    assert.equal(running(native.parent), false);
    assert.equal(running(native.child, native.hostPid), false);
  } finally { await f.close(); }
});

for (const mode of ['abort', 'shutdown', 'candidate', 'git']) {
  test(`running ${mode} stops ${mode === 'git' ? 'actual Git checkout and its smudge filter' : 'actual ESLint and its TERM-resistant descendant'}`, async () => {
    const f = fixture();
    const marker = path.join(f.temporary, 'native-ready.json');
    slowRule(f.config, marker);
    const controller = new AbortController();
    let native;
    let payload = {};
    const previousGitConfig = process.env.GIT_CONFIG_GLOBAL;
    try {
      if (mode === 'candidate' || mode === 'git') {
        const git = (args) => execFileSync('git', args, { cwd: f.root, encoding: 'utf8' }).trim();
        git(['init', '--quiet']);
        if (mode === 'git') {
          fs.writeFileSync(path.join(f.root, '.gitattributes'), '*.js filter=regression\n');
          const filter = path.join(f.temporary, 'smudge.cjs');
          fs.writeFileSync(filter, `const fs = require('node:fs'); process.on('SIGTERM', () => {}); fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ parent: process.ppid, child: process.pid, hostPid: Number(fs.readFileSync('/proc/self/status', 'utf8').match(/^NSpid:\\s+(\\d+)/m)[1]), cwd: process.cwd() })); setInterval(() => {}, 1000);`);
          const config = path.join(f.temporary, 'gitconfig');
          git(['config', '--file', config, 'filter.regression.smudge', `${process.execPath} ${filter}`]);
          process.env.GIT_CONFIG_GLOBAL = config;
        }
        git(['add', '.']);
        git(['-c', 'user.name=Regression', '-c', 'user.email=regression@example.test', 'commit', '--quiet', '-m', 'fixture']);
        payload = { sourceRevision: git(['rev-parse', 'HEAD']) };
      }
      const invocation = f.invoke(payload, controller.signal);
      const rejected = assert.rejects(invocation, /LINT_CANCELLED/);
      native = await waitFor(marker);
      assert(running(native.parent)); assert(running(native.child, native.hostPid));
      const started = performance.now();
      if (mode === 'shutdown') await f.adapter.shutdown();
      else controller.abort(new Error('caller lease revoked'));
      await rejected;
      assert(performance.now() - started < 2000);
      assert.equal(running(native.parent), false);
      assert.equal(running(native.child, native.hostPid), false);
      if (mode === 'candidate' || mode === 'git') {
        assert.notEqual(native.cwd, f.root);
        assert.equal(fs.existsSync(native.cwd), false);
      }
    } finally {
      controller.abort();
      if (previousGitConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = previousGitConfig;
      await f.close();
      if (native) for (const pid of [native.parent, native.child]) {
        try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
  });
}
