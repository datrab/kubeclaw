import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ContainerBuildCapabilityInvoker } from '../../../skills/buster/engine/test-gates/container-build-runtime.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'container-build-runtime-'));
try {
  const base = { workspaceRoot: root, buildctlExecutable: '/usr/local/bin/buildctl',
    buildkitHost: 'unix:///run/user/1000/buildkit/buildkitd.sock',
    registryBaseUrl: 'http://127.0.0.1:5001', registryReference: '127.0.0.1:5001',
    repositoryPrefix: 'kubeclaw/tests', allowedPlatforms: ['linux/amd64'], allowedBuildArguments: [],
    maximumLogBytes: 1024 * 1024, maximumExecutionMs: 10_000, maximumManifestBytes: 1024 * 1024 } as const;
  assert.ok(new ContainerBuildCapabilityInvoker(base));
  assert.throws(() => new ContainerBuildCapabilityInvoker({ ...base,
    registryReference: 'registry.invalid:5001' }), /CONTAINER_BUILD_REGISTRY_ENDPOINT_MISMATCH/u);
  assert.throws(() => new ContainerBuildCapabilityInvoker({ ...base,
    registryBaseUrl: 'http://registry.example.test', registryReference: 'registry.example.test',
    registryUsername: 'builder', registryPassword: 'secret' }), /CONTAINER_BUILD_REGISTRY_CREDENTIALS_REQUIRE_TLS/u);
  assert.throws(() => new ContainerBuildCapabilityInvoker({ ...base,
    allowedPlatforms: [] }), /CONTAINER_BUILD_PLATFORMS_INVALID/u);
  assert.throws(() => new ContainerBuildCapabilityInvoker({ ...base,
    allowedBuildArguments: ['PUBLIC_VERSION', 'PUBLIC_VERSION'] }), /CONTAINER_BUILD_ARGUMENT_ALLOWLIST_INVALID/u);

  const source = fs.readFileSync('skills/buster/engine/test-gates/container-build-runtime.ts', 'utf8');
  assert.match(source, /execFileDefault/u);
  assert.match(source, /push=true/u);
  assert.match(source, /docker-content-digest/u);
  assert.match(source, /CONTAINER_BUILD_REGISTRY_DIGEST_MISMATCH/u);
  assert.match(source, /CONTAINER_BUILD_CANCELLED/u);
  assert.doesNotMatch(source, /contract emulator/iu);
  console.log(JSON.stringify({ ok: true, runtime: 'container-build',
    execution: 'real-buildctl-only', registryVerification: 'sha256', mocks: 0, emulators: 0 }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
