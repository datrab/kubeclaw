import fs from 'node:fs';
import path from 'node:path';
import { computePackageDigest } from '../registry/digest.ts';
import { parsePluginManifest } from '../registry/schema.ts';

export interface ExternalInstallRequest {
  readonly sourceRoot: string;
  readonly installationRoot: string;
  readonly expectedDigest: string;
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

function entries(root: string, relative = ''): readonly string[] {
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
    return [child];
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
  for (const relative of entries(source)) {
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
    fs.copyFileSync(path.join(source, relative), target, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(target, 0o644);
  }
}

export function installExternalPackage(request: ExternalInstallRequest): InstalledPackage {
  const source = fs.realpathSync(request.sourceRoot);
  const installationRoot = fs.realpathSync(request.installationRoot);
  rejectLifecycleScripts(source);
  entries(source);
  const manifestPath = path.join(source, 'plugin.json');
  const manifest = parsePluginManifest(fs.readFileSync(manifestPath, 'utf8'), manifestPath);
  const digest = computePackageDigest(source);
  if (digest !== request.expectedDigest) {
    throw new Error(`PLUGIN_INSTALL_DIGEST_MISMATCH:${digest}`);
  }
  if (
    request.trustEvidence.method === 'publisher_attestation'
    && !request.trustEvidence.attestationDigest
  ) {
    throw new Error('PLUGIN_INSTALL_ATTESTATION_REQUIRED');
  }
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
    if (computePackageDigest(packageRoot) !== digest) {
      throw new Error('PLUGIN_INSTALL_STAGED_DIGEST_MISMATCH');
    }
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
