import fs from 'node:fs';
import path from 'node:path';
import type {
  PackageIdentity,
  PackageProvenance,
  PluginManifest,
} from '../../sdk/src/index.ts';
import { computePackageDigest } from './digest.ts';
import { RegistryError } from './errors.ts';
import { parsePluginManifest } from './schema.ts';
import type { DiscoveredPackage, DiscoveryOptions } from './types.ts';

function canonicalRoot(root: string): string {
  try {
    const resolved = fs.realpathSync(root);
    if (!fs.statSync(resolved).isDirectory()) throw new Error('not a directory');
    return resolved;
  } catch (error) {
    throw new RegistryError('REGISTRY_ROOT_INVALID', `Invalid plugin installation root: ${root}`, {
      root,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function packageDirectories(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((candidate) => fs.existsSync(path.join(candidate, 'plugin.json')));
}

function identity(manifest: PluginManifest, digest: string): PackageIdentity {
  return {
    pluginId: manifest.id,
    apiVersion: manifest.apiVersion,
    packageVersion: manifest.packageVersion,
    contentDigest: digest,
  };
}

function trustedProvenance(
  manifest: PluginManifest,
  root: string,
  digest: string,
  options: DiscoveryOptions,
): PackageProvenance {
  const now = (options.now ?? (() => new Date()))().toISOString();
  const builtin = options.trustPolicy.trustedBuiltinRoots.some(
    (trustedRoot) => root.startsWith(`${fs.realpathSync(trustedRoot)}${path.sep}`),
  );
  const reference = `local:${root}`;
  if (builtin) {
    return {
      schemaVersion: 'package-provenance.v2',
      package: identity(manifest, digest),
      source: { type: 'builtin', canonicalReference: reference },
      canonicalPath: root,
      trustScope: 'trusted_first_party',
      trustEvidence: {
        method: 'builtin_allowlist',
        verifier: options.trustPolicy.verifierId,
        verifiedAt: now,
      },
      resolvedAt: now,
    };
  }
  if ((options.trustPolicy.allowedSourceDigests.get(reference) ?? []).includes(digest)) {
    return {
      schemaVersion: 'package-provenance.v2',
      package: identity(manifest, digest),
      source: { type: 'local', canonicalReference: reference },
      canonicalPath: root,
      trustScope: 'isolated_external',
      trustEvidence: {
        method: 'source_digest_allowlist',
        verifier: options.trustPolicy.verifierId,
        verifiedAt: now,
      },
      resolvedAt: now,
    };
  }
  const attestationDigest = options.trustPolicy.verifiedAttestations.get(digest);
  if (attestationDigest) {
    return {
      schemaVersion: 'package-provenance.v2',
      package: identity(manifest, digest),
      source: { type: 'local', canonicalReference: reference },
      canonicalPath: root,
      trustScope: 'isolated_external',
      trustEvidence: {
        method: 'publisher_attestation',
        verifier: options.trustPolicy.verifierId,
        verifiedAt: now,
        attestationDigest,
      },
      resolvedAt: now,
    };
  }
  throw new RegistryError('REGISTRY_PACKAGE_UNTRUSTED', `Plugin package is not trusted: ${manifest.id}`, {
    pluginId: manifest.id,
    root,
    digest,
  });
}

export function discoverPackages(options: DiscoveryOptions): readonly DiscoveredPackage[] {
  const roots = [...new Set(options.installationRoots.map(canonicalRoot))];
  const seenPaths = new Set<string>();
  return roots.flatMap(packageDirectories).sort().map((candidate) => {
    const root = fs.realpathSync(candidate);
    if (seenPaths.has(root)) {
      throw new RegistryError('REGISTRY_PACKAGE_DUPLICATE', `Plugin package discovered more than once: ${root}`, { root });
    }
    seenPaths.add(root);
    const manifestPath = path.join(root, 'plugin.json');
    const manifest = parsePluginManifest(fs.readFileSync(manifestPath, 'utf8'), manifestPath);
    const digest = computePackageDigest(root);
    return Object.freeze({
      root,
      manifestPath,
      manifest: Object.freeze(manifest),
      provenance: Object.freeze(trustedProvenance(manifest, root, digest, options)),
    });
  });
}
