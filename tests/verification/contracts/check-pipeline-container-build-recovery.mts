import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ContainerBuildCapabilityInvoker } from '../../../skills/buster/engine/test-gates/container-build-runtime.ts';

const buildkitHost = process.env.CONTAINER_BUILD_BUILDKIT_HOST;
const registryReference = process.env.CONTAINER_BUILD_REGISTRY_REFERENCE;
const registryBaseUrl = process.env.CONTAINER_BUILD_REGISTRY_BASE_URL;
if (!buildkitHost || !registryReference || !registryBaseUrl) {
  throw new Error('CONTAINER_BUILD_LIVE_CONFIGURATION_REQUIRED');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'container-build-recovery-'));
const repository = path.join(root, 'repository');
const scratch = path.join(root, 'scratch');
try {
  fs.mkdirSync(repository);
  fs.mkdirSync(scratch);
  fs.writeFileSync(path.join(repository, 'Dockerfile'), 'FROM scratch\nCOPY payload.txt /payload.txt\n');
  fs.writeFileSync(path.join(repository, 'payload.txt'), 'cancellation and timeout proof\n');
  const request: any = { operation: 'build_push_verify',
    resource: { type: 'container.build-definition', canonicalId: 'build:recovery:attempt:one' },
    payload: { repositoryRoot: repository, scratchRoot: scratch, buildContext: repository,
      dockerfile: path.join(repository, 'Dockerfile'), definitionIdentity: 'dockerfile:Dockerfile',
      outputName: 'suite3-recovery', platform: 'linux/amd64', buildArgs: {},
      limits: { maximumLogBytes: 1024 * 1024, maximumExecutionMs: 120_000 } } };
  const options = { workspaceRoot: root, buildctlExecutable: '/usr/local/bin/buildctl', buildkitHost,
    registryBaseUrl, registryReference, repositoryPrefix: 'kubeclaw/pipeline', allowedPlatforms: ['linux/amd64'],
    allowedBuildArguments: [], maximumLogBytes: 1024 * 1024, maximumExecutionMs: 120_000,
    maximumManifestBytes: 16 * 1024 * 1024 } as const;

  const cancellation = new AbortController();
  cancellation.abort(new Error('operator cancelled the build'));
  await assert.rejects(() => new ContainerBuildCapabilityInvoker(options).invoke(
    'container.build', request, cancellation.signal), /CONTAINER_BUILD_CANCELLED/u);

  const timeoutRuntime = new ContainerBuildCapabilityInvoker({ ...options, maximumExecutionMs: 1 });
  const timeoutResult = await timeoutRuntime.invoke('container.build', {
    ...request, resource: { ...request.resource, canonicalId: 'build:recovery:attempt:timeout' },
    payload: { ...request.payload, outputName: 'suite3-timeout', limits: {
      ...request.payload.limits, maximumExecutionMs: 1,
    } },
  }, new AbortController().signal);
  assert.equal(timeoutResult.ok, false);
  assert.match(String(timeoutResult.message), /timed out|timeout|ETIMEDOUT/iu);

  console.log(JSON.stringify({ ok: true, phase: 'container-build-recovery',
    realComponents: ['buildctl', 'buildkit-daemon'], cancellation: 'proved', timeout: 'proved',
    mocks: 0, fakes: 0, emulators: 0, wrappers: 0 }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
