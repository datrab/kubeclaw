/** Real factory/service/process; fixture executable is deliberately not BuildKit.
 * Native preparation ownership is modeled by the existing fixture and unused by readiness. */
import fs from 'node:fs';
import path from 'node:path';
import { cliProfile } from './buster-cli-profile.mjs';
import { ModeledPreparation } from './modeled-preparation.mts';
import { readTestBundle, writeTestBundle } from '../config/swarm-bundle.mjs';
import { loadSwarmSettings, type BusterDependencyReadinessSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { loadProductionBusterRemotePlanRuntime } from '../../../skills/buster/engine/test-gates/production.ts';

export function readinessExecutable(root: string) {
  const executable = path.join(root, 'fixture-buildctl'), control = path.join(root, 'fixture-control.json');
  const invocations = path.join(root, 'fixture-invocations.jsonl');
  fs.writeFileSync(control, JSON.stringify({ delayMs: 0, outputBytes: 0, exitCode: 0 }));
  fs.writeFileSync(executable, `#!${process.execPath}\nconst fs = require('node:fs');\nconst config = JSON.parse(fs.readFileSync(${JSON.stringify(control)}, 'utf8'));\nfs.appendFileSync(${JSON.stringify(invocations)}, JSON.stringify({ pid: process.pid, args: process.argv.slice(2) }) + '\\n');\nprocess.stdout.write('x'.repeat(config.outputBytes));\nsetTimeout(() => process.exit(config.exitCode), config.delayMs);\n`, { mode: 0o700 });
  return { executable, control, invocations,
    set: (delayMs: number, outputBytes: number, exitCode: number) => fs.writeFileSync(control, JSON.stringify({ delayMs, outputBytes, exitCode })) };
}

export function readinessRuntime(root: string, policy: BusterDependencyReadinessSettings, enabled: boolean) {
  const fixture = readinessExecutable(root);
  const profile = cliProfile(root, { maximumActiveJobs: 1, maximumQueuedJobs: 2, maximumConcurrentAttempts: 3 });
  const file = profile.environment.SWARM_CONFIG;
  const documents = readTestBundle(file);
  documents['buster-engine'].settings.dependencyReadiness = policy;
  writeTestBundle(file, documents);
  const settings = loadSwarmSettings(profile.environment);
  const source = JSON.parse(fs.readFileSync(profile.runtime, 'utf8'));
  source.allowedCapabilities = enabled ? ['container.build'] : [];
  source.containerBuild = { buildctlExecutable: fixture.executable, buildkitHost: 'unix:///fixture-not-buildkit.sock',
    registryBaseUrl: 'https://registry.example.test', registryReference: 'registry.example.test',
    repositoryPrefix: 'fixture', allowedPlatforms: ['linux/amd64'], allowedBuildArguments: [],
    maximumLogBytes: 1024, maximumExecutionMs: 1000, maximumManifestBytes: 1024 };
  fs.writeFileSync(profile.runtime, JSON.stringify(source));
  const preparation = new ModeledPreparation(path.join(root, 'plan-jobs'), {
    recordLimits: source.recordLimits, maximumArchiveBytes: 1048576,
    maximumResultBytes: source.maximumResultBytes, maximumResultStoreBytes: source.maximumResultStoreBytes,
    trustedSourceAuthority: source.trustedSourceAuthority,
    sourceAttestationPublicKey: profile.environment.ADMISSION_TEST_SOURCE_KEY });
  const create = () => loadProductionBusterRemotePlanRuntime(profile.runtime, preparation, settings.buster,
    settings.workerCore.localRuntime, profile.environment);
  return { ...fixture, create, settings, source, profile, documents, file, preparation };
}
