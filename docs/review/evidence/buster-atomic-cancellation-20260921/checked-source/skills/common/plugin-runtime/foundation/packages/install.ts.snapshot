import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { computePackageDigest } from '../registry/digest.ts';
import { buildRegistry } from '../registry/build.ts';
import { parsePluginManifest } from '../registry/schema.ts';

export interface ExternalInstallPolicy {
  readonly operatorIds: ReadonlySet<string>;
  readonly allowedSourceDigests: ReadonlyMap<string, readonly string[]>;
  readonly verifiedAttestations: ReadonlyMap<string, string>;
  readonly maxFiles?: number;
  readonly maxBytes?: number;
}

export interface ExternalInstallRequest {
  readonly actorId: string;
  readonly canonicalSource: string;
  readonly sourceRoot: string;
  readonly installationRoot: string;
  readonly expectedDigest: string;
  readonly policy: ExternalInstallPolicy;
  readonly trustEvidence: Readonly<{
    method: 'source_digest_allowlist' | 'publisher_attestation';
    verifier: string;
    attestationDigest?: string;
  }>;
}

export interface InstalledPackage {
  readonly pluginId: string;
  readonly packageVersion: string;
  readonly contentDigest: string;
  readonly root: string;
}

interface PackageEntry {
  readonly relative: string;
  readonly bytes: number;
}

function entries(root: string, relative = ''): readonly PackageEntry[] {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`PLUGIN_INSTALL_SYMLINK_FORBIDDEN:${child}`);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') {
        throw new Error('PLUGIN_INSTALL_DEPENDENCIES_MUST_BE_BUNDLED');
      }
      return entries(root, child);
    }
    if (!entry.isFile()) throw new Error(`PLUGIN_INSTALL_FILE_TYPE_FORBIDDEN:${child}`);
    return [{ relative: child, bytes: fs.statSync(path.join(root, child)).size }];
  });
}

function rejectLifecycleScripts(root: string): void {
  const packageFile = path.join(root, 'package.json');
  if (!fs.existsSync(packageFile)) return;
  const value = JSON.parse(fs.readFileSync(packageFile, 'utf8')) as {
    scripts?: Readonly<Record<string, unknown>>;
  };
  if (value.scripts && Object.keys(value.scripts).length > 0) {
    throw new Error('PLUGIN_INSTALL_SCRIPTS_FORBIDDEN');
  }
}

function safeName(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

function copyPackage(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: false, mode: 0o755 });
  for (const { relative } of entries(source)) {
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
    fs.copyFileSync(path.join(source, relative), target, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(target, 0o644);
  }
}

function assertPolicy(request: ExternalInstallRequest, digest: string): void {
  if (!request.policy.operatorIds.has(request.actorId)) {
    throw new Error(`PLUGIN_INSTALL_OPERATOR_UNAUTHORIZED:${request.actorId}`);
  }
  if (
    !request.canonicalSource
    || request.canonicalSource.startsWith('local:')
    || request.canonicalSource.startsWith('file:')
  ) {
    throw new Error('PLUGIN_INSTALL_CANONICAL_SOURCE_INVALID');
  }
  const allowed = request.policy.allowedSourceDigests.get(request.canonicalSource) ?? [];
  const attestation = request.policy.verifiedAttestations.get(digest);
  if (request.trustEvidence.method === 'source_digest_allowlist') {
    if (!allowed.includes(digest)) throw new Error('PLUGIN_INSTALL_SOURCE_DIGEST_UNTRUSTED');
  } else if (
    !request.trustEvidence.attestationDigest
    || request.trustEvidence.attestationDigest !== attestation
  ) {
    throw new Error('PLUGIN_INSTALL_ATTESTATION_UNVERIFIED');
  }
}

function installedProvenance(root: string, manifest: ReturnType<typeof parsePluginManifest>, digest: string, request: ExternalInstallRequest) {
  const now = new Date().toISOString();
  return { schemaVersion: 'package-provenance.v2' as const,
    package: { pluginId: manifest.id, apiVersion: manifest.apiVersion, packageVersion: manifest.packageVersion, contentDigest: digest },
    source: { type: 'registry' as const, canonicalReference: request.canonicalSource }, canonicalPath: root,
    trustScope: 'isolated_external' as const,
    trustEvidence: { method: request.trustEvidence.method, verifier: request.trustEvidence.verifier, verifiedAt: now,
      ...(request.trustEvidence.attestationDigest === undefined ? {} : { attestationDigest: request.trustEvidence.attestationDigest }) },
    resolvedAt: now };
}

function validateModules(root: string, manifest: ReturnType<typeof parsePluginManifest>): void {
  const registrations = [
    ...manifest.stages,
    ...manifest.observers,
    ...manifest.adapters,
    ...(manifest.testProviders ?? []),
    ...(manifest.reportAdapters ?? []),
  ];
  for (const registration of registrations) {
    if (!/\.(?:mjs|mts|js|ts)$/.test(registration.module)) {
      throw new Error(`PLUGIN_INSTALL_MODULE_FORMAT_INVALID:${registration.module}`);
    }
  }
  // Check every bundled executable file, including transitive/dynamic imports,
  // without importing code on the installer host. node_modules is forbidden.
  for (const { relative } of entries(root)) {
    if (!/\.(?:[cm]?js|[cm]?ts)$/.test(relative)) continue;
    const modulePath = path.join(root, relative);
    let source = fs.readFileSync(modulePath, 'utf8');
    try {
      if (/\.(?:[cm]?ts)$/.test(modulePath)) {
        source = stripTypeScriptTypes(source, { mode: 'strip', sourceUrl: modulePath });
      }
    } catch {
      throw new Error(`PLUGIN_INSTALL_MODULE_INVALID:${relative}`);
    }
    const checked = spawnSync(process.execPath, ['--check', `--input-type=${/\.(?:cjs|cts)$/.test(relative) ? 'commonjs' : 'module'}`], {
      cwd: root,
      env: { NODE_NO_WARNINGS: '1' },
      encoding: 'utf8',
      input: source,
      timeout: 30_000,
    });
    if (checked.status !== 0) throw new Error(`PLUGIN_INSTALL_MODULE_INVALID:${relative}`);
  }
}

function validatePackage(root: string, request: ExternalInstallRequest): {
  readonly manifest: ReturnType<typeof parsePluginManifest>;
  readonly digest: string;
} {
  rejectLifecycleScripts(root);
  const packageEntries = entries(root);
  const maxFiles = request.policy.maxFiles ?? 4096;
  const maxBytes = request.policy.maxBytes ?? 128 * 1024 * 1024;
  const totalBytes = packageEntries.reduce((total, entry) => total + entry.bytes, 0);
  if (packageEntries.length > maxFiles) throw new Error('PLUGIN_INSTALL_FILE_COUNT_LIMIT');
  if (totalBytes > maxBytes) throw new Error('PLUGIN_INSTALL_SIZE_LIMIT');
  const manifestPath = path.join(root, 'plugin.json');
  const manifest = parsePluginManifest(fs.readFileSync(manifestPath, 'utf8'), manifestPath);
  if (manifest.adapters.length > 0) {
    throw new Error('PLUGIN_INSTALL_EXTERNAL_ADAPTER_UNSUPPORTED');
  }
  const digest = computePackageDigest(root);
  if (digest !== request.expectedDigest) {
    throw new Error(`PLUGIN_INSTALL_DIGEST_MISMATCH:${digest}`);
  }
  assertPolicy(request, digest);
  buildRegistry([{ root, manifestPath, manifest, provenance: installedProvenance(root, manifest, digest, request) }]);
  validateModules(root, manifest);
  return { manifest, digest };
}

export function installExternalPackage(request: ExternalInstallRequest): InstalledPackage {
  const source = fs.realpathSync(request.sourceRoot);
  const installationRoot = fs.realpathSync(request.installationRoot);
  const { manifest, digest } = validatePackage(source, request);
  const name = [
    safeName(manifest.id),
    safeName(manifest.packageVersion),
    digest.slice('sha256:'.length, 'sha256:'.length + 16),
  ].join('@');
  const target = path.join(installationRoot, name);
  if (fs.existsSync(target)) {
    if (computePackageDigest(target) !== digest) {
      throw new Error(`PLUGIN_INSTALL_TARGET_CONFLICT:${target}`);
    }
    return {
      pluginId: manifest.id,
      packageVersion: manifest.packageVersion,
      contentDigest: digest,
      root: fs.realpathSync(target),
    };
  }
  const stagingRoot = path.join(installationRoot, '.staging');
  fs.mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
  const staging = fs.mkdtempSync(path.join(stagingRoot, `${safeName(manifest.id)}-`));
  try {
    const packageRoot = path.join(staging, 'package');
    copyPackage(source, packageRoot);
    validatePackage(packageRoot, request);
    fs.renameSync(packageRoot, target);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return {
    pluginId: manifest.id,
    packageVersion: manifest.packageVersion,
    contentDigest: digest,
    root: fs.realpathSync(target),
  };
}

export function removeInstalledPackage(
  installationRootValue: string,
  packageRootValue: string,
): void {
  const installationRoot = fs.realpathSync(installationRootValue);
  const packageRoot = fs.realpathSync(packageRootValue);
  if (path.dirname(packageRoot) !== installationRoot) {
    throw new Error(`PLUGIN_REMOVE_OUTSIDE_INSTALLATION_ROOT:${packageRoot}`);
  }
  const trashRoot = path.join(installationRoot, '.trash');
  fs.mkdirSync(trashRoot, { recursive: true, mode: 0o700 });
  const tombstone = path.join(trashRoot, `${path.basename(packageRoot)}-${Date.now()}`);
  fs.renameSync(packageRoot, tombstone);
  fs.rmSync(tombstone, { recursive: true, force: true });
}
