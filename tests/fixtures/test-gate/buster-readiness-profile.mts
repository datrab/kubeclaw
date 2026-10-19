/** Real factory/service/process; fixture executable is deliberately not BuildKit.
 * Native preparation ownership is modeled by the existing fixture and unused by readiness. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { cliProfile } from './buster-cli-profile.mjs';
import { ModeledPreparation } from './modeled-preparation.mts';
import { readTestPipeline, writeTestPipeline, busterRuntimeSelection } from '../config/pipeline-components.mjs';
import { captureSwarmSettings, type BusterSettings, type WorkerCoreSettings, type BusterDependencyReadinessSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { loadProductionBusterRemotePlanRuntime } from '../../../skills/buster/engine/test-gates/production.ts';

export function readinessExecutable(root: string) {
  const executable = path.join(root, 'fixture-buildctl'), control = path.join(root, 'fixture-control.json');
  const invocations = path.join(root, 'fixture-invocations.jsonl');
  fs.writeFileSync(control, JSON.stringify({ delayMs: 0, outputBytes: 0, exitCode: 0 }));
  fs.writeFileSync(executable, `#!${process.execPath}\nconst fs = require('node:fs');\nconst config = JSON.parse(fs.readFileSync(${JSON.stringify(control)}, 'utf8'));\nfs.appendFileSync(${JSON.stringify(invocations)}, JSON.stringify({ pid: process.pid, startTicks: fs.readFileSync('/proc/self/stat', 'utf8').split(') ')[1].split(' ')[19], args: process.argv.slice(2) }) + '\\n');\nprocess.stdout.write('x'.repeat(config.outputBytes));\nsetTimeout(() => process.exit(config.exitCode), config.delayMs);\n`, { mode: 0o700 });
  return { executable, control, invocations,
    set: (delayMs: number, outputBytes: number, exitCode: number) => fs.writeFileSync(control, JSON.stringify({ delayMs, outputBytes, exitCode })) };
}

export function readinessRuntime(root: string, policy: BusterDependencyReadinessSettings, enabled: boolean) {
  const fixture = readinessExecutable(root);
  const profile = cliProfile(root, { maximumActiveJobs: 1, maximumQueuedJobs: 2, maximumConcurrentAttempts: 3 });
  const file = profile.environment.SWARM_CONFIG;
  const documents = readTestPipeline(file);
  documents['buster-engine'].profiles.runtime.settings.dependencyReadiness = policy;
  writeTestPipeline(file, documents);
  const selected = captureSwarmSettings(file, busterRuntimeSelection(documents));
  // Actual consumed owners only, not a reconstruction of the retired full facade.
  const buster = selected.components['buster-engine']!.settings as unknown as BusterSettings;
  const workerLocalRuntime = (selected.components['worker-core']!.settings as unknown as WorkerCoreSettings).localRuntime;
  const source = JSON.parse(fs.readFileSync(profile.runtime, 'utf8'));
  source.allowedCapabilities = enabled ? ['container.build'] : [];
  if (enabled) {
  source.registryPeer = { registryBaseUrl: 'https://registry.example.test', registryReference: 'registry.example.test',
    registryUsernameEnvironmentVariable: 'READINESS_REGISTRY_USER', registryPasswordEnvironmentVariable: 'READINESS_REGISTRY_PASSWORD' };
  Object.assign(profile.environment, { READINESS_REGISTRY_USER: 'fixture', READINESS_REGISTRY_PASSWORD: 'fixture-private' });
  source.containerBuild = { buildctlExecutable: fixture.executable, buildkitHost: 'unix:///fixture-not-buildkit.sock',
    ...source.registryPeer,
    repositoryPrefix: 'fixture', allowedPlatforms: ['linux/amd64'], allowedBuildArguments: [],
    maximumLogBytes: 1024, maximumExecutionMs: 1000, maximumManifestBytes: 1024 };
  }
  fs.writeFileSync(profile.runtime, JSON.stringify(source));
  const preparation = new ModeledPreparation(path.join(root, 'plan-jobs'), {
    recordLimits: source.recordLimits, maximumArchiveBytes: 1048576,
    maximumResultBytes: source.maximumResultBytes, maximumResultStoreBytes: source.maximumResultStoreBytes,
    trustedSourceAuthority: source.trustedSourceAuthority,
    sourceAttestationPublicKey: profile.environment.ADMISSION_TEST_SOURCE_KEY });
  const create = () => loadProductionBusterRemotePlanRuntime(profile.runtime, preparation, buster,
    workerLocalRuntime, profile.environment);
  return { ...fixture, create, buster, workerLocalRuntime, source, profile, documents, file, preparation };
}

/** Observe the existing real diagnostic write and forward it unchanged. */
export function observeReadinessDiagnostics() {
  const original = process.stderr.write;
  const events: Array<Record<string, unknown>> = [];
  process.stderr.write = function (...args: [chunk: string | Uint8Array, callback?: ((error?: Error | null) => void) | undefined]
    | [chunk: string | Uint8Array, encoding?: BufferEncoding | undefined, callback?: ((error?: Error | null) => void) | undefined]) {
    const text = typeof args[0] === 'string' ? args[0] : Buffer.from(args[0]).toString('utf8');
    for (const line of text.split('\n')) {
      try {
        const event = JSON.parse(line);
        if (event?.event === 'buster.dependency-readiness' && event.dependency === 'buildkit') events.push(event);
      } catch { /* Other stderr output is forwarded without reinterpretation. */ }
    }
    return Reflect.apply(original, process.stderr, args) as boolean;
  };
  return { events, restore: () => { process.stderr.write = original; } };
}

export function assertProbeFinished(file: string, expectedCalls: number) {
  const calls = fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line) as {
    pid: number; startTicks: string; args: string[];
  });
  assert.equal(calls.length, expectedCalls, 'actual child must publish its start marker');
  const call = calls.at(-1)!;
  assert.deepEqual(call.args, ['--addr', 'unix:///fixture-not-buildkit.sock', 'debug', 'workers']);
  assert.ok(Number.isSafeInteger(call.pid) && call.pid > 0);
  assert.match(call.startTicks, /^[0-9]+$/);
  let stat: string;
  try { stat = fs.readFileSync(`/proc/${call.pid}/stat`, 'utf8'); }
  catch (error) {
    assert.equal((error as NodeJS.ErrnoException).code, 'ENOENT');
    return;
  }
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  assert.ok(fields[19] !== call.startTicks || fields[0] === 'Z',
    'the identified child must have terminated before the readiness result returns');
}
