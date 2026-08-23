import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, discoverPackages } from '../../../skills/nova/core/src/index.ts';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'report-adapter-registry-'));
const installRoot = path.join(workspace, 'plugins');
fs.mkdirSync(installRoot, { recursive: true });

function adapter(id: string, format: string, module = 'dist/adapter.js'): Record<string, unknown> {
  return {
    id,
    format,
    contractVersion: 1,
    module,
    export: 'adapt',
    mediaTypes: format === 'junit'
      ? ['application/junit+xml', 'application/xml']
      : ['application/sarif+json'],
  };
}

function writePackage(name: string, pluginId: string, adapters: Record<string, unknown>[]): string {
  const root = path.join(installRoot, name);
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'adapter.js'), 'export function adapt() { return {}; }\n');
  fs.writeFileSync(path.join(root, 'plugin.json'), `${JSON.stringify({
    id: pluginId,
    apiVersion: 'pipeline-plugin-v2',
    packageVersion: '1.0.0',
    stages: [],
    observers: [],
    adapters: [],
    reportAdapters: adapters,
  }, null, 2)}\n`);
  return root;
}

writePackage('provided', 'kubeclaw.reports', [
  adapter('junit', 'junit'),
  adapter('sarif', 'sarif'),
]);
writePackage('custom', 'example.reports', [adapter('custom-junit', 'junit')]);

function discover() {
  return discoverPackages({
    installationRoots: [installRoot],
    trustPolicy: {
      trustedBuiltinRoots: [installRoot],
      allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(),
      verifierId: 'test:report-adapter-registry',
    },
    now: () => new Date('2026-08-09T22:40:00Z'),
  });
}

const packages = discover();
const snapshot = buildRegistry(packages);
assert.equal(snapshot.reportAdapters.size, 3);
assert.equal(snapshot.reportAdapterFormats.get('junit')?.length, 2,
  'more than one installed adapter can support a format');
assert.equal(snapshot.reportAdapterFormats.get('sarif')?.length, 1);

const provided = snapshot.reportAdapters.get('kubeclaw.reports:junit');
assert.ok(provided);
assert.equal(provided.registration.adapterId, 'junit');
assert.equal(provided.registration.format, 'junit');
assert.equal(provided.registration.contractVersion, 1);
assert.equal(provided.registration.package.packageId, 'kubeclaw.reports');
assert.equal(provided.registration.entrypoint.module, 'dist/adapter.js');
assert.deepEqual(provided.registration.mediaTypes, ['application/junit+xml', 'application/xml']);
assert.equal(provided.provenance.surface, 'report_adapter');
assert.equal(Object.isFrozen(provided.registration), true);
assert.equal(Object.isFrozen(provided.registration.mediaTypes), true);
assert.equal('set' in snapshot.reportAdapters, false);
assert.equal(buildRegistry(packages).snapshotDigest, snapshot.snapshotDigest);
assert.equal(buildRegistry([...packages].reverse()).snapshotDigest, snapshot.snapshotDigest,
  'package discovery order does not change the registry identity');
assert.deepEqual(
  [...buildRegistry([...packages].reverse()).reportAdapterFormats.get('junit') ?? []]
    .map((entry) => `${entry.registration.package.packageId}:${entry.registration.adapterId}`),
  [...snapshot.reportAdapterFormats.get('junit') ?? []]
    .map((entry) => `${entry.registration.package.packageId}:${entry.registration.adapterId}`),
  'package discovery order does not change report-adapter candidate order',
);

writePackage('missing', 'example.missing', [adapter('missing', 'missing', 'dist/missing.js')]);
assert.throws(() => buildRegistry(discover()),
  (error: unknown) => (error as { code?: string }).code === 'REGISTRY_REFERENCE_MISSING');
fs.rmSync(path.join(installRoot, 'missing'), { recursive: true });

writePackage('duplicate', 'example.duplicate', [
  adapter('same', 'one'),
  adapter('same', 'two'),
]);
assert.throws(() => buildRegistry(discover()),
  (error: unknown) => (error as { code?: string }).code === 'REGISTRY_REGISTRATION_CONFLICT');

console.log(JSON.stringify({
  ok: true,
  packages: snapshot.packages.size,
  adapters: snapshot.reportAdapters.size,
  junitCandidates: snapshot.reportAdapterFormats.get('junit')?.length,
  snapshotDigest: snapshot.snapshotDigest,
}));
