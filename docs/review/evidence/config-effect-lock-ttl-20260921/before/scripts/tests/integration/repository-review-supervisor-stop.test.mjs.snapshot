import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const repository = path.resolve(import.meta.dirname, '../../..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function inputs(root) {
  const file = name => path.join(root, name);
  const roots = ['common', 'nova', 'buster'].map(role => path.join(repository, 'skills', role, 'plugins'));
  fs.mkdirSync(file('repository'), { recursive: true });
  fs.writeFileSync(file('platform.json'), JSON.stringify({
    schemaVersion: 'pipeline-platform.v2', installationRoots: roots, trustedBuiltinRoots: roots,
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} }, storageRoot: file('state'),
    shutdownTimeoutMs: 1000, orchestratorIssuerId: 'supervisor-stop-regression', administrativeDecisionIssuers: [],
    providers: { 'git.repository.read': 'kubeclaw.repository-adapter:repository', 'artifacts.write': 'kubeclaw.artifact-store:artifact-store' },
    grants: { 'kubeclaw.preflight-contract:validate': {
      'git.repository.read': { allowedPrefixes: ['modules/'] }, 'artifacts.write': { allowedNamespaces: ['kubeclaw.preflight-contract'] },
    } },
    adapters: { 'kubeclaw.repository-adapter:repository': { repositoryRoot: file('repository') },
      'kubeclaw.artifact-store:artifact-store': { artifactRoot: file('artifacts') } },
    activeAdapters: [], observers: {},
  }));
  // A real malformed CLI input fails before a terminal journal is committed,
  // so the unchanged status reader correctly leaves the recovery path eligible.
  fs.writeFileSync(file('pipeline.json'), '{}');
  return file;
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`original supervisor stops its recovery wait on ${signal} without starting another pipeline`, { timeout: 20000 }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-stop-'));
    const file = inputs(root);
    const args = [path.join(repository, 'scripts/supervise-repository-review.mjs'),
      '--workdir', repository, '--platform', file('platform.json'), '--graph', file('pipeline.json'),
      '--run-id', 'supervisor-stop-regression', '--heartbeat', file('heartbeat.json'),
      '--resource-log', file('resources.jsonl'), '--diagnostic-dir', file('diagnostics'),
      '--log', file('pipeline.log'), '--lease', file('lease.json'), '--max-recoveries', '1', '--initial-mode', 'start'];
    const child = spawn(process.execPath, args, { cwd: repository, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const exited = new Promise(resolve => child.once('exit', (code, exitSignal) => resolve({ code, signal: exitSignal })));
    try {
      const deadline = Date.now() + 10000;
      while (!fs.existsSync(file('diagnostics/attempt-1-exit.json'))) {
        assert.equal(child.exitCode, null, stderr);
        assert(Date.now() < deadline, 'first genuine pipeline invocation did not finish');
        await delay(20);
      }
      // Original status CLI is fast; this interval places the signal inside the
      // five-second recovery delay that previously ignored an already-set abort.
      await delay(1200);
      assert.equal(child.exitCode, null, stderr);
      assert(child.kill(signal));
      const outcome = await exited;
      const diagnostics = fs.readdirSync(file('diagnostics'));
      const log = fs.readFileSync(file('pipeline.log'), 'utf8');
      assert.equal(outcome.code, 130, stderr + log);
      assert.equal(outcome.signal, null);
      assert.equal(stdout, '', 'stopping must not report a successful pipeline');
      assert.deepEqual(diagnostics, ['attempt-1-exit.json']);
      assert.match(log, /--run-id supervisor-stop-regression/);
      assert.match(log, /Value failed canonical contract pipelineDefinition/);
      assert.doesNotMatch(log, /--recover supervisor-stop-regression/);
      assert.equal(fs.existsSync(file('lease.json')), false);
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
