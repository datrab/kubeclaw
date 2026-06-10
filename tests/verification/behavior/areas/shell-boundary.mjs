export async function registerShellBoundaryArea({
  record,
  sourceRoot,
  overlayRoot,
  fs,
  os,
  path,
  assert,
  execFileSync,
  readOverlayText,
  materializeRuntimeTree,
  importRuntimeModule,
  ensureDir,
}) {
function installPyYamlBackedJsYaml(runtimeRoot) {
  const moduleDir = ensureDir(path.join(runtimeRoot, 'node_modules', 'js-yaml'));
  fs.writeFileSync(path.join(moduleDir, 'index.js'), `
const { execFileSync } = require('child_process');
const SCRIPT = ` + JSON.stringify(`
import json
import sys
import yaml
mode = sys.argv[1]
content = sys.stdin.read()
if mode == 'loadAll':
    print(json.dumps([doc for doc in yaml.safe_load_all(content) if doc is not None]))
elif mode == 'load':
    print(json.dumps(yaml.safe_load(content)))
`) + `;
function parse(mode, content) {
  return JSON.parse(execFileSync('python', ['-c', SCRIPT, mode], { input: String(content || ''), encoding: 'utf8' }));
}
exports.loadAll = (content) => parse('loadAll', content);
exports.load = (content) => parse('load', content);
exports.dump = (doc) => JSON.stringify(doc, null, 2) + '\\n';
`);
  fs.writeFileSync(path.join(moduleDir, 'package.json'), '{"name":"js-yaml","main":"index.js"}');
}

  await record('buster build/k8s high-risk suite commands stay on argv-safe boundaries', async () => {
    for (const relPath of [
      'skills/buster/pipeline/suites/build.ts',
      'skills/buster/pipeline/suites/k8s.ts',
    ]) {
      const source = readOverlayText(sourceRoot, overlayRoot, relPath);
      assert.equal(source.includes('execAsync'), false, `${relPath} must not keep shell-string execAsync helpers`);
      assert.equal(source.includes("promisify(exec)"), false, `${relPath} must not promisify shell exec`);
      assert.equal(source.includes("from 'child_process';") && /import\s*{[^}]*\bexec\b[^}]*}\s*from 'child_process'/.test(source), false, `${relPath} must not import shell exec`);
      assert.equal(/shell\s*:/.test(source), false, `${relPath} must not opt into shell execution`);
      assert.equal(/\|\s*(jq|head|tail|cut)\b/.test(source), false, `${relPath} must not rely on shell pipelines for command post-processing`);
    }
  });

  await record('subprocess env allowlist strips known secrets and rejects denied overrides', async () => {
    const { runtimeRoot: generalRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    const securityMod = await importRuntimeModule(generalRoot, '/app/skills/pipeline/security.ts');

    const env = securityMod.buildSubprocessEnv({ CI: 'true' }, {
      sourceEnv: {
        PATH: '/usr/bin',
        HOME: '/tmp/home',
        DISCORD_WEBHOOK: 'https://discord.example/webhook',
        DISCORD_WEBHOOK_URL: 'https://discord.example/webhook-url',
        DISCORD_WEBHOOK_BACKUP: 'https://discord.example/webhook-backup',
        DISCORD_TOKEN: 'discord-token',
        OPENCLAW_GATEWAY_TOKEN: 'openclaw-gateway-token',
        REDIS_PASSWORD: 'redis-password',
      },
    });

    assert.equal(env.PATH, '/usr/bin');
    assert.equal(env.HOME, '/tmp/home');
    assert.equal(env.CI, 'true');
    for (const denied of ['DISCORD_WEBHOOK', 'DISCORD_WEBHOOK_URL', 'DISCORD_WEBHOOK_BACKUP', 'DISCORD_TOKEN', 'OPENCLAW_GATEWAY_TOKEN', 'REDIS_PASSWORD']) {
      assert.equal(Object.prototype.hasOwnProperty.call(env, denied), false, `${denied} must not be inherited by subprocesses`);
    }
    assert.throws(
      () => securityMod.buildSubprocessEnv({ REDIS_PASSWORD: 'explicit-secret' }, { sourceEnv: { PATH: '/usr/bin' } }),
      /subprocess env key is denied/
    );
  });

  await record('lint safeExec child processes receive allowlisted env only', async () => {
    const { runtimeRoot: generalRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    const executionMod = await importRuntimeModule(generalRoot, '/app/skills/pipeline/tools/lint-report/execution.ts');

    const previousDiscordToken = process.env.DISCORD_TOKEN;
    const previousGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
    const previousRedisPassword = process.env.REDIS_PASSWORD;
    process.env.DISCORD_TOKEN = 'parent-discord-token';
    process.env.OPENCLAW_GATEWAY_TOKEN = 'parent-gateway-token';
    process.env.REDIS_PASSWORD = 'parent-redis-password';
    try {
      const result = executionMod.safeExec('node', [
        '-e',
        "process.stdout.write(JSON.stringify({PATH:process.env.PATH||null,CI:process.env.CI||null,DISCORD_TOKEN:process.env.DISCORD_TOKEN||null,OPENCLAW_GATEWAY_TOKEN:process.env.OPENCLAW_GATEWAY_TOKEN||null,REDIS_PASSWORD:process.env.REDIS_PASSWORD||null}))",
      ], { env: { CI: 'true' } });

      assert.equal(result.ok, true);
      const childEnv = JSON.parse(result.stdout);
      assert.equal(Boolean(childEnv.PATH), true);
      assert.equal(childEnv.CI, 'true');
      assert.equal(childEnv.DISCORD_TOKEN, null);
      assert.equal(childEnv.OPENCLAW_GATEWAY_TOKEN, null);
      assert.equal(childEnv.REDIS_PASSWORD, null);
    } finally {
      if (previousDiscordToken === undefined) delete process.env.DISCORD_TOKEN;
      else process.env.DISCORD_TOKEN = previousDiscordToken;
      if (previousGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
      else process.env.OPENCLAW_GATEWAY_TOKEN = previousGatewayToken;
      if (previousRedisPassword === undefined) delete process.env.REDIS_PASSWORD;
      else process.env.REDIS_PASSWORD = previousRedisPassword;
    }
  });

  await record('k8s suite rewrites manifest namespace and images structurally', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    installPyYamlBackedJsYaml(sandboxRoot);
    const k8sMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/suites/k8s.ts');
    const manifestMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/suites/manifest.ts');

    const rendered = k8sMod.renderManifestForK8sSuite(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
  labels:
    namespace: label-must-stay
spec:
  template:
    metadata:
      labels:
        namespace: pod-label-must-stay
    spec:
      initContainers:
        - name: migrate
          image: ghcr.io/example/app-migrate:old
      containers:
        - name: app
          image: ghcr.io/example/app:old
        - name: sidecar
          image: busybox:1
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: app-cron
spec:
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: cron
              image: ghcr.io/example/app-cron:old
`, 'app', 'registry-local:5001/app:test', 'buster-test-ns', () => {});

    const docs = manifestMod.loadYamlDocuments(rendered);
    const [deployment, cronJob] = docs;

    assert.equal(deployment.metadata.namespace, 'buster-test-ns');
    assert.equal(deployment.metadata.labels.namespace, 'label-must-stay');
    assert.equal(deployment.spec.template.metadata.labels.namespace, 'pod-label-must-stay');
    assert.equal(deployment.spec.template.spec.initContainers[0].image, 'registry-local:5001/app:test');
    assert.equal(deployment.spec.template.spec.containers[0].image, 'registry-local:5001/app:test');
    assert.equal(deployment.spec.template.spec.containers[1].image, 'busybox:1');
    assert.equal(cronJob.metadata.namespace, 'buster-test-ns');
    assert.equal(cronJob.spec.jobTemplate.spec.template.spec.containers[0].image, 'registry-local:5001/app:test');
  });

  await record('k8s suite rejects cluster-scoped manifests', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    installPyYamlBackedJsYaml(sandboxRoot);
    const k8sMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/suites/k8s.ts');

    assert.throws(
      () => k8sMod.renderManifestForK8sSuite(`
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: reader
  namespace: production
`, 'app', 'registry-local:5001/app:test', 'buster-test-ns', () => {}),
      /cluster-scoped resources/,
    );
  });

  await record('k8s suite rejects cleanup-unsafe namespace prefixes before resource tracking', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    installPyYamlBackedJsYaml(sandboxRoot);
    const k8sMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/suites/k8s.ts');
    const cleanupMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/sandbox-cleanup.ts');

    assert.equal(k8sMod.validateK8sNamespacePrefix('buster'), false);
    assert.equal(k8sMod.validateK8sNamespacePrefix('test'), true);
    assert.equal(k8sMod.validateK8sNamespacePrefix('prod'), false);

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-k8s-prefix-'));
    const payload = {
      project: 'behavior-k8s-prefix',
      module_id: '04',
      attempt: 1,
      run_id: 'run-k8s-prefix-1',
      test_config: {
        k8s: {
          dockerfile: 'Dockerfile',
          image_name: 'app',
          service_name: 'app',
          manifests: ['k8s.yaml'],
          namespace_prefix: 'prod',
        },
      },
    };
    const cleanupStatePath = cleanupMod.getCleanupStatePath(payload);
    fs.rmSync(cleanupStatePath, { force: true });

    try {
      const events = [];
      const verdict = await k8sMod.default({
        payload,
        moduleId: '04',
        repoRoot,
        logSink: (...args) => events.push(args),
      });

      assert.equal(verdict.status, 'FAIL');
      assert.equal(verdict.critical, true);
      assert.equal(verdict.checks_total, 1);
      assert.equal(verdict.metadata.checks[0].name, 'namespace-prefix');
      assert.match(verdict.findings[0].message, /expected one of: test/);
      assert.equal(events.some((entry) => entry[0]?.check === 'dockerfile-build'), false);
      assert.equal(fs.existsSync(cleanupStatePath), false);
    } finally {
      fs.rmSync(cleanupStatePath, { force: true });
    }
  });

  await record('unit suite rejects shell-metacharacter custom test commands before execution', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const unitMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/suites/unit.ts');

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
    const bundleMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/suites/bundle.ts');

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
    const bundleMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/suites/bundle.ts');

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
    const summaryMod = await importRuntimeModule(generalRoot, '/app/skills/pipeline/tools/project-summary.ts');

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

  await record('buster base-image pre-pull uses argv-safe podman calls', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const busterBaseImagesMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/base-images.ts');
    const busterCapabilitiesMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/capabilities.ts');

    const calls = [];
    await busterBaseImagesMod.ensureBaseImages(['docker.io/library/node:20-slim'], {
      capabilities: [busterCapabilitiesMod.BUSTER_CAPABILITIES.IMAGE_PREPULL],
      execFileAsync: async (command, args, options) => {
        calls.push({ command, args, timeout: options.timeout });
        if (args.join(' ') === 'image exists docker.io/library/node:20-slim') {
          const error = new Error('image missing');
          error.code = 1;
          throw error;
        }
        return { stdout: '', stderr: '' };
      },
    });

    assert.deepEqual(calls, [
      { command: 'podman', args: ['image', 'exists', 'docker.io/library/node:20-slim'], timeout: 5000 },
      { command: 'podman', args: ['pull', 'docker.io/library/node:20-slim'], timeout: 300000 },
    ]);
  });

  await record('buster suite runner blocks tool-heavy suites without capabilities and writes durable operator alert', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const suiteRunnerMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/runners/suite-runner.ts');
    const behaviorLogRoot = path.join(sourceRoot, '.swarm', 'logs');
    fs.mkdirSync(behaviorLogRoot, { recursive: true });
    const logDir = fs.mkdtempSync(path.join(behaviorLogRoot, 'behavior-buster-suite-cap-'));

    const result = await suiteRunnerMod.runSuites(['build'], {
      payload: {
        project: 'behavior-suite-capability',
        module_id: '01',
        run_id: 'run-suite-capability-1',
        attempt: 1,
        capabilities: [],
        test_config: { serve: { type: 'static' }, suite_timeout_ms: 300000 },
      },
      moduleId: '01',
      attempt: 1,
      logDir,
      capabilities: [],
    });

    assert.equal(result.criticalFailed, true);
    assert.equal(result.results[0].suite, 'build');
    assert.equal(result.results[0].status, 'ERROR');
    assert.equal(result.results[0].reason, 'buster_capability_denied');
    const alertPath = path.join(logDir, 'operator-alerts.jsonl');
    assert.equal(fs.existsSync(alertPath), true);
    const alert = JSON.parse(fs.readFileSync(alertPath, 'utf8').trim().split('\n').pop());
    assert.equal(alert.who, 'suite:build');
    assert.equal(alert.blocked_action, 'run build suite');
    assert.deepEqual(alert.missing_capabilities, ['static_web_server']);
  });

  await record('buster base-image pre-pull is default-deny and writes durable operator alert', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const busterBaseImagesMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/base-images.ts');
    const busterCapabilitiesMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/capabilities.ts');
    const behaviorLogRoot = path.join(sourceRoot, '.swarm', 'logs');
    fs.mkdirSync(behaviorLogRoot, { recursive: true });
    const alertRoot = fs.mkdtempSync(path.join(behaviorLogRoot, 'behavior-buster-cap-alert-'));
    const alertPath = path.join(alertRoot, 'operator-alerts.jsonl');

    const calls = [];
    const result = await busterBaseImagesMod.ensureBaseImages(['docker.io/library/node:20-slim'], {
      alertContext: { logDir: alertRoot, project: 'behavior-capability' },
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: '', stderr: '' };
      },
    });

    assert.equal(result.blocked, true);
    assert.deepEqual(calls, []);
    assert.equal(fs.existsSync(alertPath), true);
    const alert = JSON.parse(fs.readFileSync(alertPath, 'utf8').trim().split('\n').pop());
    assert.equal(alert.reason, 'buster_capability_denied');
    assert.equal(alert.who, 'suite:base-images');
    assert.equal(alert.blocked_action, 'pre-pull Buster base images');
    assert.deepEqual(alert.missing_capabilities, ['image_prepull']);
  });

  await record('buster base-image pre-pull rejects shell-metacharacter image refs before execution', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const busterBaseImagesMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/base-images.ts');
    const busterCapabilitiesMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/capabilities.ts');

    const maliciousImage = 'docker.io/library/node:20-slim"; touch /tmp/behavior-buster-image-pwned #';
    assert.equal(busterBaseImagesMod.validateBaseImageRef(maliciousImage).ok, false);
    assert.equal(busterBaseImagesMod.validateBaseImageRef('docker.io/library/node:20-slim').ok, true);
    assert.equal(busterBaseImagesMod.validateBaseImageRef('node:20-slim').ok, false);

    const calls = [];
    await busterBaseImagesMod.ensureBaseImages([maliciousImage], {
      capabilities: [busterCapabilitiesMod.BUSTER_CAPABILITIES.IMAGE_PREPULL],
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: '', stderr: '' };
      },
    });

    assert.deepEqual(calls, []);
    assert.equal(fs.existsSync('/tmp/behavior-buster-image-pwned'), false);
  });

  await record('buster base-image pre-pull does not pull after podman inspect/system errors', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const busterBaseImagesMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/base-images.ts');
    const busterCapabilitiesMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/capabilities.ts');

    const calls = [];
    const result = await busterBaseImagesMod.ensureBaseImages(['docker.io/library/python:3.12-slim'], {
      capabilities: [busterCapabilitiesMod.BUSTER_CAPABILITIES.IMAGE_PREPULL],
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        const error = new Error('podman socket unavailable');
        error.code = 125;
        throw error;
      },
    });

    assert.deepEqual(calls, [
      { command: 'podman', args: ['image', 'exists', 'docker.io/library/python:3.12-slim'] },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.degraded, true);
    assert.equal(result.failures[0].reason, 'podman_inspect_failed');
  });

  await record('buster sandbox cleanup targets only tracked task resources via argv-safe exec calls', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const cleanupMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/sandbox-cleanup.ts');

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
      namespaces: ['test-behavior-cleanup-abc123'],
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
    assert.equal(result.cleanup_policy.name, 'task_scoped');
    assert.equal(result.cleanup_policy.tracked_resources, 'scoped');
    assert.deepEqual(calls.slice(-5), [
      {
        command: 'kubectl',
        args: [
          'get',
          'namespace',
          '-l',
          'openclaw.io/buster-scope=oc-733d28c5e7f4f4ad25bf',
          '-o',
          'jsonpath={range .items[*]}{.metadata.name}{"\\n"}{end}',
        ],
      },
      { command: 'podman', args: ['stop', 'sb-test-container'] },
      { command: 'podman', args: ['rm', '-f', 'sb-test-container'] },
      { command: 'podman', args: ['image', 'rm', '-f', 'localhost/build-sb-test-container'] },
      { command: 'kubectl', args: ['delete', 'busternamespacelease', 'test-behavior-cleanup-abc123', '-n', 'kubeclaw', '--wait=false'] },
    ]);
    assert.deepEqual(result.cleaned.containers, ['sb-test-container']);
    assert.deepEqual(result.cleaned.images, ['localhost/build-sb-test-container']);
    assert.deepEqual(result.cleaned.namespaces, ['test-behavior-cleanup-abc123']);
    assert.equal(fs.existsSync(cleanupMod.getCleanupStatePath(payload, { sandboxRoot: sandboxDir })), false);
  });

  await record('buster startup cleanup clears only bounded sandbox output directories and ignores legacy namespace hints', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const cleanupMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/sandbox-cleanup.ts');

    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-cleanup-dirs-'));
    const wwwDir = path.join(sandboxDir, 'www');
    const resultsDir = path.join(sandboxDir, 'results');
    const untouchedDir = path.join(sandboxDir, 'other');
    const legacyNamespaceHint = path.join(sandboxDir, 'k8s-test-namespace');
    fs.mkdirSync(wwwDir, { recursive: true });
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.mkdirSync(untouchedDir, { recursive: true });
    fs.writeFileSync(path.join(wwwDir, 'index.html'), '<html>ok</html>');
    fs.writeFileSync(path.join(resultsDir, 'runner-verdict.json'), '{}');
    fs.writeFileSync(path.join(untouchedDir, 'keep.txt'), 'keep');
    fs.writeFileSync(legacyNamespaceHint, 'buster-legacy-namespace\n');

    const calls = [];
    const result = await cleanupMod.cleanupSandboxResources('startup', null, {
      sandboxRoot: sandboxDir,
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: '', stderr: '' };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.cleanup_policy.name, 'startup_sweep');
    assert.equal(result.cleanup_policy.tracked_resources, 'all');
    assert.equal(result.disk_usage.before.sandbox_root.path, sandboxDir);
    assert.equal(result.disk_usage.before.sandbox_root.exists, true);
    assert.equal(typeof result.disk_usage.before.sandbox_root.size_bytes, 'number');
    assert.equal(result.disk_usage.after.sandbox_root.path, sandboxDir);
    assert.equal(result.disk_usage.after.sandbox_root.exists, true);
    assert.deepEqual(fs.readdirSync(wwwDir), []);
    assert.deepEqual(fs.readdirSync(resultsDir), []);
    assert.deepEqual(fs.readdirSync(untouchedDir), ['keep.txt']);
    assert.equal(fs.readFileSync(legacyNamespaceHint, 'utf8'), 'buster-legacy-namespace\n');
    assert.deepEqual(calls, [{ command: 'nginx', args: ['-s', 'stop'] }]);
    assert.equal(result.cleaned.namespaces.includes('buster-legacy-namespace'), false);
    assert.deepEqual(result.cleaned.sandbox_paths.sort(), [resultsDir, wwwDir].sort());
  });

  await record('buster cleanup policy denial returns evidence without executing destructive actions', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const cleanupMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/sandbox-cleanup.ts');

    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-cleanup-policy-'));
    const payload = {
      project: 'behavior-cleanup-policy',
      module_id: '02',
      attempt: 1,
      run_id: 'run-cleanup-policy-1',
    };
    const wwwDir = path.join(sandboxDir, 'www');
    const resultsDir = path.join(sandboxDir, 'results');
    fs.mkdirSync(wwwDir, { recursive: true });
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(wwwDir, 'index.html'), '<html>keep</html>');
    fs.writeFileSync(path.join(resultsDir, 'runner-verdict.json'), '{}');
    cleanupMod.trackSandboxResources(payload, {
      containers: ['sb-policy-container'],
      images: ['localhost/build-sb-policy-container'],
      namespaces: ['test-behavior-policy-abc123'],
    }, { sandboxRoot: sandboxDir });

    const calls = [];
    const result = await cleanupMod.cleanupSandboxResources('pre', payload, {
      sandboxRoot: sandboxDir,
      cleanupPolicy: 'disabled',
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: '', stderr: '' };
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.cleanup_policy.name, 'disabled');
    assert.deepEqual(calls, []);
    assert.deepEqual(fs.readdirSync(wwwDir), ['index.html']);
    assert.deepEqual(fs.readdirSync(resultsDir), ['runner-verdict.json']);
    assert.equal(fs.existsSync(cleanupMod.getCleanupStatePath(payload, { sandboxRoot: sandboxDir })), true);
    assert.deepEqual(result.cleaned.containers, []);
    assert.deepEqual(result.cleaned.images, []);
    assert.deepEqual(result.cleaned.namespaces, []);
    assert.deepEqual(
      result.policy_denied.map((entry) => entry.action),
      ['tracked_resources', 'sandbox_outputs', 'process_cleanup'],
    );
  });

  await record('buster task-scoped cleanup does not touch sibling tracked resources', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const cleanupMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/sandbox-cleanup.ts');

    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-cleanup-sibling-'));
    const payloadA = {
      project: 'behavior-cleanup-sibling',
      module_id: '01',
      attempt: 1,
      run_id: 'run-cleanup-sibling-a',
    };
    const payloadB = {
      project: 'behavior-cleanup-sibling',
      module_id: '02',
      attempt: 1,
      run_id: 'run-cleanup-sibling-b',
    };

    cleanupMod.trackSandboxResources(payloadA, {
      containers: ['sb-sibling-a'],
      images: ['localhost/build-sb-sibling-a'],
      namespaces: ['test-behavior-sibling-a'],
    }, { sandboxRoot: sandboxDir });
    cleanupMod.trackSandboxResources(payloadB, {
      containers: ['sb-sibling-b'],
      images: ['localhost/build-sb-sibling-b'],
      namespaces: ['test-behavior-sibling-b'],
    }, { sandboxRoot: sandboxDir });

    const calls = [];
    const result = await cleanupMod.cleanupSandboxResources('final', payloadA, {
      sandboxRoot: sandboxDir,
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: '', stderr: '' };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.cleanup_policy.name, 'task_scoped');
    const destructiveCalls = calls.filter((call) => (
      (call.command === 'podman' && ['stop', 'rm', 'image'].includes(call.args[0]))
      || (call.command === 'kubectl' && call.args[0] === 'delete')
    ));
    assert.deepEqual(destructiveCalls, [
      { command: 'podman', args: ['stop', 'sb-sibling-a'] },
      { command: 'podman', args: ['rm', '-f', 'sb-sibling-a'] },
      { command: 'podman', args: ['image', 'rm', '-f', 'localhost/build-sb-sibling-a'] },
      { command: 'kubectl', args: ['delete', 'busternamespacelease', 'test-behavior-sibling-a', '-n', 'kubeclaw', '--wait=false'] },
    ]);
    assert.equal(calls.some((call) => call.command === 'nginx'), false);
    assert.equal(fs.existsSync(cleanupMod.getCleanupStatePath(payloadA, { sandboxRoot: sandboxDir })), false);
    assert.equal(fs.existsSync(cleanupMod.getCleanupStatePath(payloadB, { sandboxRoot: sandboxDir })), true);
    const siblingState = JSON.parse(fs.readFileSync(cleanupMod.getCleanupStatePath(payloadB, { sandboxRoot: sandboxDir }), 'utf8'));
    assert.deepEqual(siblingState.containers, ['sb-sibling-b']);
    assert.deepEqual(siblingState.images, ['localhost/build-sb-sibling-b']);
    assert.deepEqual(siblingState.namespaces, ['test-behavior-sibling-b']);
  });

  await record('buster startup sweep cleans all tracked recovery state only under sweep policy', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const cleanupMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/sandbox-cleanup.ts');

    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-cleanup-sweep-'));
    const payloadA = { project: 'behavior-sweep', module_id: '01', attempt: 1, run_id: 'run-sweep-a' };
    const payloadB = { project: 'behavior-sweep', module_id: '02', attempt: 1, run_id: 'run-sweep-b' };
    cleanupMod.trackSandboxResources(payloadA, { containers: ['sb-sweep-a'] }, { sandboxRoot: sandboxDir });
    cleanupMod.trackSandboxResources(payloadB, { namespaces: ['test-behavior-sweep-b'] }, { sandboxRoot: sandboxDir });

    const calls = [];
    const result = await cleanupMod.cleanupSandboxResources('startup', null, {
      sandboxRoot: sandboxDir,
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: '', stderr: '' };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.cleanup_policy.name, 'startup_sweep');
    assert.equal(result.cleanup_policy.tracked_resources, 'all');
    assert.deepEqual(calls, [
      { command: 'podman', args: ['stop', 'sb-sweep-a'] },
      { command: 'podman', args: ['rm', '-f', 'sb-sweep-a'] },
      { command: 'kubectl', args: ['delete', 'busternamespacelease', 'test-behavior-sweep-b', '-n', 'kubeclaw', '--wait=false'] },
      { command: 'nginx', args: ['-s', 'stop'] },
    ]);
    assert.deepEqual(result.cleaned.containers, ['sb-sweep-a']);
    assert.deepEqual(result.cleaned.namespaces, ['test-behavior-sweep-b']);
    assert.equal(fs.existsSync(cleanupMod.getCleanupStatePath(payloadA, { sandboxRoot: sandboxDir })), false);
    assert.equal(fs.existsSync(cleanupMod.getCleanupStatePath(payloadB, { sandboxRoot: sandboxDir })), false);
  });

  await record('buster cleanup failure preserves tracked resources for retry', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const cleanupMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/sandbox-cleanup.ts');

    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-cleanup-retry-'));
    const payload = {
      project: 'behavior-cleanup-retry',
      module_id: '03',
      attempt: 1,
      run_id: 'run-cleanup-retry-1',
    };
    cleanupMod.trackSandboxResources(payload, {
      namespaces: ['test-behavior-retry-abc123'],
    }, { sandboxRoot: sandboxDir });

    const calls = [];
    const result = await cleanupMod.cleanupSandboxResources('final', payload, {
      sandboxRoot: sandboxDir,
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        if (command === 'kubectl') {
          const error = new Error('kubectl delete failed');
          error.stderr = 'temporary apiserver outage';
          throw error;
        }
        return { stdout: '', stderr: '' };
      },
    });

    assert.equal(result.ok, false);
    assert.deepEqual(calls.filter((call) => call.command === 'kubectl' && call.args[0] === 'delete'), [
      { command: 'kubectl', args: ['delete', 'busternamespacelease', 'test-behavior-retry-abc123', '-n', 'kubeclaw', '--wait=false'] },
    ]);
    assert.equal(calls.some((call) => call.command === 'nginx'), false);
    assert.equal(result.errors.some((entry) => entry.includes('temporary apiserver outage')), true);
    assert.equal(fs.existsSync(cleanupMod.getCleanupStatePath(payload, { sandboxRoot: sandboxDir })), true);
    const remaining = JSON.parse(fs.readFileSync(cleanupMod.getCleanupStatePath(payload, { sandboxRoot: sandboxDir }), 'utf8'));
    assert.deepEqual(remaining.namespaces, ['test-behavior-retry-abc123']);
  });

  await record('buster cleanup reports corrupt state without treating it as empty successful cleanup', async () => {
    const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const cleanupMod = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/sandbox-cleanup.ts');

    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-cleanup-corrupt-'));
    const payload = {
      project: 'behavior-cleanup-corrupt',
      module_id: '04',
      attempt: 1,
      run_id: 'run-cleanup-corrupt-1',
    };
    const statePath = cleanupMod.getCleanupStatePath(payload, { sandboxRoot: sandboxDir });
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, '{not valid json');

    const calls = [];
    const result = await cleanupMod.cleanupSandboxResources('final', payload, {
      sandboxRoot: sandboxDir,
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: '', stderr: '' };
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.cleanup_state_diagnostics.some((entry) => entry.status === 'corrupt'), true);
    assert.equal(result.errors.some((entry) => entry.includes('corrupt_cleanup_state')), true);
    assert.equal(fs.existsSync(statePath), true);
    assert.deepEqual(calls.map(({ command, args }) => [command, args[0]]), [
      ['podman', 'ps'],
      ['podman', 'images'],
      ['kubectl', 'get'],
    ]);
    assert.equal(calls.some(({ command, args }) => command === 'podman' && ['stop', 'rm'].includes(args[0])), false);
    assert.equal(calls.some(({ command, args }) => command === 'kubectl' && args[0] === 'delete'), false);
  });
}
