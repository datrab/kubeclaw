export async function registerShellBoundaryArea({
  record,
  sourceRoot,
  overlayRoot,
  fs,
  os,
  path,
  assert,
  execFileSync,
  materializeRuntimeTree,
  importRuntimeModule,
}) {
  await record('unit suite rejects shell-metacharacter custom test commands before execution', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const unitMod = await importRuntimeModule(sandboxRoot, '/app/skills/suites/unit.js');

    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-unit-shell-'));
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'behavior-unit-shell' }, null, 2));

    await assert.rejects(
      async () => unitMod.default({
        config: {
          serve: { project_dir: projectDir },
          unit: { test_cmd: 'npm test; touch /tmp/behavior-unit-shell-pwned' },
        },
      }),
      /shell metacharacters are not allowed/
    );
  });

  await record('bundle suite rejects disallowed output paths outside the hardened prefix set', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const bundleMod = await importRuntimeModule(sandboxRoot, '/app/skills/suites/bundle.js');

    await assert.rejects(
      async () => bundleMod.default({
        config: {
          bundle: { www_dir: '/etc' },
        },
      }),
      /not in allowed prefixes/
    );
  });

  await record('bundle suite treats semicolon-bearing paths literally instead of shell-expanding them', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const bundleMod = await importRuntimeModule(sandboxRoot, '/app/skills/suites/bundle.js');

    const wwwDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-bundle;literal-'));
    fs.writeFileSync(path.join(wwwDir, 'index.html'), '<html>ok</html>');

    const verdict = await bundleMod.default({
      config: {
        bundle: { www_dir: wwwDir },
      },
    });

    assert.equal(verdict.status, 'PASS');
    assert.equal(verdict.metadata.file_count, 1);
  });

  await record('project-summary accepts repo paths with shell metacharacters as literal git -C targets', async () => {
    const { runtimeRoot: generalRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    const summaryMod = await importRuntimeModule(generalRoot, '/app/skills/pipeline/tools/project-summary.js');

    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-summary;literal-'));
    const project = 'demo';
    const projectRoot = path.join(repoDir, 'Projects', project, 'src');
    const swarmRoot = path.join(projectRoot, '.swarm');
    fs.mkdirSync(swarmRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'index.js'), 'export const ok = true;\n');
    fs.writeFileSync(path.join(swarmRoot, 'progress.json'), JSON.stringify({ execution_order: [], modules: {}, gates: {} }, null, 2));
    fs.writeFileSync(path.join(repoDir, 'swarm.config.json'), JSON.stringify({}, null, 2));

    execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'nova@example.test'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Nova Test'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repoDir, stdio: 'ignore' });

    const result = await summaryMod.generateSummary({
      project,
      repoDir,
      configPath: path.join(repoDir, 'swarm.config.json'),
    });

    assert.equal(result.project, project);
    assert.equal(result.data.code.totalFiles >= 1, true);
  });

  await record('buster sandbox cleanup targets only tracked task resources via argv-safe exec calls', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const cleanupMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/sandbox-cleanup.js');

    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-cleanup-scope-'));
    const payload = {
      project: 'behavior-cleanup',
      module_id: '01',
      attempt: 2,
      run_id: 'run-cleanup-1',
    };

    cleanupMod.trackSandboxResources(payload, {
      containers: ['sb-test-container'],
      images: ['localhost/build-sb-test-container'],
      namespaces: ['buster-behavior-cleanup-abc123'],
    }, { sandboxRoot: sandboxDir });

    const calls = [];
    const result = await cleanupMod.cleanupSandboxResources('final', payload, {
      sandboxRoot: sandboxDir,
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: '', stderr: '' };
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      { command: 'podman', args: ['stop', 'sb-test-container'] },
      { command: 'podman', args: ['rm', '-f', 'sb-test-container'] },
      { command: 'podman', args: ['image', 'rm', '-f', 'localhost/build-sb-test-container'] },
      { command: 'kubectl', args: ['delete', 'namespace', 'buster-behavior-cleanup-abc123', '--wait=false'] },
      { command: 'nginx', args: ['-s', 'stop'] },
    ]);
    assert.deepEqual(result.cleaned.containers, ['sb-test-container']);
    assert.deepEqual(result.cleaned.images, ['localhost/build-sb-test-container']);
    assert.deepEqual(result.cleaned.namespaces, ['buster-behavior-cleanup-abc123']);
    assert.equal(fs.existsSync(cleanupMod.getCleanupStatePath(payload, { sandboxRoot: sandboxDir })), false);
  });

  await record('buster startup cleanup clears only bounded sandbox output directories', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const cleanupMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/sandbox-cleanup.js');

    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-cleanup-dirs-'));
    const wwwDir = path.join(sandboxDir, 'www');
    const resultsDir = path.join(sandboxDir, 'results');
    const untouchedDir = path.join(sandboxDir, 'other');
    fs.mkdirSync(wwwDir, { recursive: true });
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.mkdirSync(untouchedDir, { recursive: true });
    fs.writeFileSync(path.join(wwwDir, 'index.html'), '<html>ok</html>');
    fs.writeFileSync(path.join(resultsDir, 'runner-verdict.json'), '{}');
    fs.writeFileSync(path.join(untouchedDir, 'keep.txt'), 'keep');

    const calls = [];
    const result = await cleanupMod.cleanupSandboxResources('startup', null, {
      sandboxRoot: sandboxDir,
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: '', stderr: '' };
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(fs.readdirSync(wwwDir), []);
    assert.deepEqual(fs.readdirSync(resultsDir), []);
    assert.deepEqual(fs.readdirSync(untouchedDir), ['keep.txt']);
    assert.deepEqual(calls, [{ command: 'nginx', args: ['-s', 'stop'] }]);
    assert.deepEqual(result.cleaned.sandbox_paths.sort(), [resultsDir, wwwDir].sort());
  });
}
