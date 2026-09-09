import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const isolation = process.argv[2] ? { cgroupRoot: path.resolve(process.argv[2]) } : undefined;

const root = path.resolve('.');
const core = await import(pathToFileURL(path.join(
  root,
  'skills/nova/core/src/index.ts',
)).href);
const { computePackageDigest } = await import(pathToFileURL(path.join(
  root,
  'skills/common/plugin-runtime/foundation/registry/digest.ts',
)).href);

function schema(): string {
  return JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: true,
  });
}

function writePackage(
  packageRoot: string,
  source: string,
  options: { readonly adapters?: boolean } = {},
): void {
  fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, 'schemas'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'dist', 'main.mjs'), source);
  for (const name of ['config', 'input', 'result']) {
    fs.writeFileSync(path.join(packageRoot, 'schemas', `${name}.json`), schema());
  }
  fs.writeFileSync(path.join(packageRoot, 'plugin.json'), JSON.stringify({
    id: 'external.phase11',
    apiVersion: 'pipeline-plugin-v2',
    packageVersion: '1.0.0',
    stages: options.adapters ? [] : [{
      id: 'main',
      type: 'external.phase11',
      module: 'dist/main.mjs',
      export: 'execute',
      requiredCapabilities: [],
      configSchema: 'schemas/config.json',
      inputSchema: 'schemas/input.json',
      resultSchema: 'schemas/result.json',
    }],
    observers: [],
    adapters: options.adapters ? [{
      id: 'adapter',
      module: 'dist/main.mjs',
      export: 'execute',
      requiredCapabilities: [],
      providesCapabilities: ['telemetry.emit'],
      configSchema: 'schemas/config.json',
    }] : [],
  }));
}

function context(packageRoot: string) {
  const attempt = {
    runId: 'run:phase11',
    stageId: 'external',
    attemptId: 'attempt:phase11',
    attemptNumber: 1,
  };
  const registration = {
    schemaVersion: 'registration-provenance.v2' as const,
    package: {
      schemaVersion: 'package-provenance.v2' as const,
      package: {
        pluginId: 'external.phase11',
        apiVersion: 'pipeline-plugin-v2' as const,
        packageVersion: '1.0.0',
        contentDigest: `sha256:${'a'.repeat(64)}`,
      },
      source: { type: 'registry' as const, canonicalReference: 'https://plugins.example/phase11' },
      canonicalPath: packageRoot,
      trustScope: 'isolated_external' as const,
      trustEvidence: {
        method: 'source_digest_allowlist' as const,
        verifier: 'phase11:test',
        verifiedAt: '2026-07-28T00:00:00Z',
      },
      resolvedAt: '2026-07-28T00:00:00Z',
    },
    surface: 'stage' as const,
    registrationId: 'main',
  };
  const contract = {
    schemaVersion: 'plugin-context.v2' as const,
    lease: {
      schemaVersion: 'invocation-lease.v2' as const,
      leaseId: 'lease:phase11',
      attempt,
      registration,
      status: 'active' as const,
      grants: [],
      limits: {
        wallTimeMs: 5_000,
        memoryBytes: 256 * 1024 * 1024,
        cpuMillis: 2_000,
      },
      issuedAt: '2026-07-28T00:00:00Z',
      expiresAt: '2026-07-28T00:01:00Z',
    },
    config: {},
    input: {},
    artifacts: [],
  };
  return {
    contract,
    async invoke(): Promise<never> {
      throw new Error('capability denied');
    },
    async emit(): Promise<void> {},
    artifact(): undefined {
      return undefined;
    },
  };
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-phase11-'));
const sourceRoot = path.join(temporary, 'source');
const installRoot = path.join(temporary, 'installed');
const trustedRoot = path.join(temporary, 'trusted');
fs.mkdirSync(sourceRoot);
fs.mkdirSync(installRoot);
fs.mkdirSync(trustedRoot);

try {
  writePackage(sourceRoot, `
    import fs from 'node:fs';
    import childProcess from 'node:child_process';
    export async function execute(input) {
      const denied = {};
      try { fs.writeFileSync('escape.txt', 'bad'); } catch { denied.fs = true; }
      try { await fetch('https://example.com'); } catch { denied.network = true; }
      try { childProcess.spawnSync('true'); } catch { denied.subprocess = true; }
      return {
        schemaVersion: 'stage-result.v2',
        outcome: 'passed',
        artifacts: [],
        denied,
        secret: process.env.OPENAI_API_KEY ?? null,
        input,
      };
    }
  `);
  const digest = computePackageDigest(sourceRoot);
  const canonicalSource = 'https://plugins.example/phase11/1.0.0';
  const policy = {
    operatorIds: new Set(['operator:phase11']),
    allowedSourceDigests: new Map([[canonicalSource, [digest]]]),
    verifiedAttestations: new Map<string, string>(),
    maxFiles: 64,
    maxBytes: 1024 * 1024,
  };
  const request = {
    actorId: 'operator:phase11',
    canonicalSource,
    sourceRoot,
    installationRoot: installRoot,
    expectedDigest: digest,
    policy,
    trustEvidence: {
      method: 'source_digest_allowlist' as const,
      verifier: 'phase11:test',
    },
  };

  assert.throws(
    () => core.installExternalPackage({ ...request, actorId: 'project:config' }),
    /PLUGIN_INSTALL_OPERATOR_UNAUTHORIZED/,
  );
  assert.throws(
    () => core.installExternalPackage({ ...request, canonicalSource: 'file:project/plugin' }),
    /PLUGIN_INSTALL_CANONICAL_SOURCE_INVALID/,
  );
  assert.equal(fs.readdirSync(installRoot).filter((name) => !name.startsWith('.')).length, 0);

  const installed = core.installExternalPackage(request);
  assert.equal(installed.contentDigest, digest);
  assert.equal(core.installExternalPackage(request).root, installed.root);
  assert.equal(fs.existsSync(path.join(installed.root, 'escape.txt')), false);

  const discovered = core.discoverPackages({
    installationRoots: [installRoot],
    trustPolicy: {
      trustedBuiltinRoots: [trustedRoot],
      allowedSourceDigests: new Map([[`local:${installed.root}`, [digest]]]),
      verifiedAttestations: new Map(),
      verifierId: 'phase11:test',
    },
  });
  assert.equal(discovered[0]?.provenance.trustScope, 'isolated_external');
  const snapshot = core.buildRegistry(discovered);
  const activated = await core.activateRegistry(snapshot, new Set(['external.phase11:main']), isolation);
  const result = await activated.stages.get('external.phase11')!.execute(
    { real: true },
    context(installed.root),
  ) as {
    readonly denied: Readonly<Record<string, boolean>>;
    readonly secret: string | null;
  };
  assert.deepEqual(result.denied, { fs: true, network: true, subprocess: true });
  assert.equal(result.secret, null);

  const outside = path.join(temporary, 'outside.mjs');
  fs.writeFileSync(outside, 'export async function execute() { return {}; }');
  assert.throws(
    () => core.invokeIsolated({
      ...isolation,
      packageRoot: installed.root,
      modulePath: outside,
      exportName: 'execute',
      surface: 'stage',
      argument: {},
      context: context(installed.root),
    }),
    /ISOLATION_MODULE_OUTSIDE_PACKAGE/,
  );

  fs.writeFileSync(path.join(installed.root, 'dist', 'main.mjs'), 'tampered');
  assert.throws(
    () => core.discoverPackages({
      installationRoots: [installRoot],
      trustPolicy: {
        trustedBuiltinRoots: [trustedRoot],
        allowedSourceDigests: new Map([[`local:${installed.root}`, [digest]]]),
        verifiedAttestations: new Map(),
        verifierId: 'phase11:test',
      },
    }),
    (error: unknown) => (
      error instanceof Error
      && 'code' in error
      && error.code === 'REGISTRY_PACKAGE_UNTRUSTED'
    ),
  );
  core.removeInstalledPackage(installRoot, installed.root);

  const cancellationRoot = path.join(temporary, 'cancellation');
  writePackage(cancellationRoot, `
    export async function execute() {
      await new Promise(() => {});
    }
  `);
  const controller = new AbortController();
  const cancelled = core.invokeIsolated({
      ...isolation,
    packageRoot: cancellationRoot,
    modulePath: path.join(cancellationRoot, 'dist', 'main.mjs'),
    exportName: 'execute',
    surface: 'stage',
    argument: {},
    context: context(cancellationRoot),
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(cancelled, /ISOLATED_PLUGIN_CANCELLED/);

  const crashRoot = path.join(temporary, 'crash');
  writePackage(crashRoot, 'export async function execute() { process.kill(process.pid, "SIGKILL"); }');
  await assert.rejects(
    core.invokeIsolated({
      ...isolation,
      packageRoot: crashRoot,
      modulePath: path.join(crashRoot, 'dist', 'main.mjs'),
      exportName: 'execute',
      surface: 'stage',
      argument: {},
      context: context(crashRoot),
    }),
    /ISOLATED_PLUGIN_EXITED/,
  );

  const adapterRoot = path.join(temporary, 'adapter');
  writePackage(adapterRoot, 'export async function execute() {}', { adapters: true });
  const adapterDigest = computePackageDigest(adapterRoot);
  const adapterSource = 'https://plugins.example/adapter/1.0.0';
  assert.throws(
    () => core.installExternalPackage({
      ...request,
      canonicalSource: adapterSource,
      sourceRoot: adapterRoot,
      expectedDigest: adapterDigest,
      policy: {
        ...policy,
        allowedSourceDigests: new Map([[adapterSource, [adapterDigest]]]),
      },
    }),
    /PLUGIN_INSTALL_EXTERNAL_ADAPTER_UNSUPPORTED/,
  );

  console.log(JSON.stringify({
    ok: true,
    contract: 'plugin-system-v2-phase11',
    assertions: {
      operatorControlledInstall: true,
      transactionalActivation: true,
      digestAndProvenance: true,
      filesystemDenied: true,
      networkDenied: true,
      subprocessDenied: true,
      credentialsHidden: true,
      moduleContainment: true,
      cancellation: true,
      crashContainment: true,
      externalAdaptersRejected: true,
    },
  }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
