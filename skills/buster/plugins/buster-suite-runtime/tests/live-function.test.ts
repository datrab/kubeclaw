import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { activate } from '../src/adapter.ts';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const root = path.join(repository, '.swarm', 'tests', `buster-suite-v2-${process.pid}`);
const source = path.join(root, 'source');
const state = path.join(root, 'state');
const bin = path.join(root, 'bin');
const token = `test-${'a'.repeat(48)}`;
fs.mkdirSync(source, { recursive: true });
fs.mkdirSync(bin, { recursive: true });

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('port unavailable'));
      server.close(() => resolve(address.port));
    });
  });
}

async function waitReady(endpoint: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/healthz`);
      if (response.ok) return;
    } catch {
      // Worker startup is asynchronous.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('worker did not become ready');
}

try {
  const buildctl = path.join(bin, 'buildctl');
  fs.writeFileSync(buildctl, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(source, 'real.test.mjs'), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "test('real behavior', () => {",
    "  assert.equal(2 + 2, 4);",
    "  assert.equal(process.env.BUSTER_V2_TOKEN, undefined);",
    "  assert.equal(process.env.KUBERNETES_SERVICE_HOST, undefined);",
    "  assert.equal(process.env.KUBECONFIG, undefined);",
    "  assert.equal(process.env.BUILDKIT_HOST, undefined);",
    "  assert.equal(process.env.BUSTER_CAPABILITIES, undefined);",
    "});",
    '',
  ].join('\n'));
  execFileSync('git', ['init', '-q'], { cwd: source });
  execFileSync('git', ['config', 'user.name', 'KubeClaw Test'], { cwd: source });
  execFileSync('git', ['config', 'user.email', 'test@kubeclaw.invalid'], { cwd: source });
  execFileSync('git', ['add', '.'], { cwd: source });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: source });

  const port = await availablePort();
  const endpoint = `http://127.0.0.1:${port}`;
  const worker = spawn(process.execPath, [path.join(repository, 'skills/buster/plugins/buster-suite-runtime/src/worker.ts')], {
    env: {
      ...process.env,
      BUSTER_V2_PORT: String(port),
      BUSTER_V2_STATE_DIR: state,
      BUSTER_V2_RUN_DIR: path.join(root, 'runs'),
      BUSTER_V2_TEST_MODE: '1',
      BUSTER_V2_RUNNER_UID: String(process.getuid?.() ?? 0),
      BUSTER_V2_RUNNER_GID: String(process.getgid?.() ?? 0),
      BUSTER_V2_BUILDKIT_GID: String(process.getgid?.() ?? 0),
      BUSTER_V2_MAX_ARCHIVE_BYTES: '8388608',
      BUSTER_V2_MAX_EXTRACTED_BYTES: '67108864',
      BUSTER_V2_MAX_QUEUED_JOBS: '8',
      BUSTER_V2_RESULT_ROOT: path.join(root, 'results'),
      BUSTER_V2_KUBERNETES_CREDENTIALS: path.join(root, 'kubernetes'),
      BUILDKIT_HOST: 'unix:///tmp/buster-suite-test-buildkit.sock',
      KUBERNETES_SERVICE_PORT: '443',
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  worker.stdin?.end(token);
  try {
    await waitReady(endpoint);
    const adapter = activate({
      registration: {} as never,
      config: {
        endpoint,
        tokenSecret: 'buster.worker',
        allowedRepositoryRoots: [source],
        allowedSuites: ['unit'],
        suiteCapabilities: ['image_build', 'kubernetes'],
        gitExecutable: fs.realpathSync(execFileSync('sh', ['-lc', 'command -v git'], { encoding: 'utf8' }).trim()),
        maxArchiveBytes: 8_388_608,
        maxSuiteTimeoutMs: 60_000,
        pollMs: 100,
      },
      async invoke() { throw new Error('unexpected non-confidential dependency'); },
      async invokeConfidential(capability, request) {
        if (capability === 'secrets.read') return { value: token };
        assert.equal(capability, 'network.http');
        const headers = request.payload.headers as Record<string, string> | undefined;
        const response = await fetch(request.resource.canonicalId, {
          method: String(request.payload.method ?? 'GET'),
          headers,
          body: request.payload.body === undefined ? undefined : JSON.stringify(request.payload.body),
        });
        const responseText = await response.text();
        if (!response.ok) throw new Error(`HTTP_${response.status}:${responseText}`);
        return {
          status: response.status,
          body: responseText ? JSON.parse(responseText) : null,
        };
      },
      async emit() {},
    });
    await adapter.ready();
    const result = await adapter.invoke({
      request: {
        schemaVersion: 'effect-request.v2',
        effectId: 'effect:buster-suite-live',
        idempotencyKey: 'effect:buster-suite-live',
        capability: 'test.suite.execute',
        operation: 'run',
        resource: { type: 'test.suite-plan', canonicalId: 'live:unit' },
        payload: {
          repositoryRoot: source,
          suites: ['unit'],
          testConfig: {
            suite_timeout_ms: 60_000,
            serve: { project_dir: source },
            unit: {
              test_cmd: `${process.execPath} --test real.test.mjs`,
              thresholds: { max_failures: 0 },
            },
          },
          task: { project: 'live', run_id: 'run:live', project_dir: source },
          moduleId: 'live',
          attempt: 1,
        },
        attempt: {
          runId: 'run:live',
          stageId: 'buster-live',
          attemptId: 'attempt:live',
          attemptNumber: 1,
        },
        requestedAt: new Date().toISOString(),
      },
      signal: new AbortController().signal,
      confidential: false,
      lock: {} as never,
      fence: { contract: {} as never, assertCurrent: () => ({} as never) },
    });
    assert.equal(Array.isArray(result.results), true);
    assert.equal((result.results as Array<{ status: string }>)[0]?.status, 'PASS');
    assert.equal(result.criticalFailed, false);
    assert.equal(
      (result.receipt as { schemaVersion: string }).schemaVersion,
      'test-suite-receipt.v1',
    );
    assert.match(
      (result.receipt as { resultDigest: string }).resultDigest,
      /^[a-f0-9]{64}$/u,
    );
    const jobDirectories = fs.readdirSync(state);
    assert.equal(jobDirectories.length, 1);
    assert.deepEqual(fs.readdirSync(path.join(state, jobDirectories[0])).sort(), ['status.json']);
    assert.deepEqual(fs.readdirSync(path.join(root, 'runs')), []);
    const completedStatus = JSON.parse(
      fs.readFileSync(path.join(state, jobDirectories[0], 'status.json'), 'utf8'),
    ) as { jobId: string; state: string };
    const terminalCancel = await fetch(`${endpoint}/v2/jobs/${completedStatus.jobId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(terminalCancel.ok, true);
    assert.equal((await terminalCancel.json() as { state: string }).state, 'completed');
    await adapter.shutdown(new AbortController().signal);
  } finally {
    worker.kill('SIGTERM');
    await new Promise((resolve) => worker.once('exit', resolve));
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.buster-suite-runtime', suite: 'v2-remote-live' }));
