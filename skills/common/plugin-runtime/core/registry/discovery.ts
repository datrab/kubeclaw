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

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalRoots(values: readonly string[], label: string): readonly string[] {
  const canonical = values.map(canonicalRoot);
  const seen = new Map<string, string>();
  for (let index = 0; index < canonical.length; index += 1) {
    const resolved = canonical[index]!;
    const original = values[index]!;
    const previous = seen.get(resolved);
    if (previous !== undefined) {
      throw new RegistryError(
        'REGISTRY_PACKAGE_DUPLICATE',
        `${label} contains duplicate canonical roots: ${previous} and ${original}`,
        { canonicalRoot: resolved, sourceRoots: [previous, original] },
      );
    }
    seen.set(resolved, original);
  }
  return Object.freeze(canonical);
}

function isWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function identity(manifest: PluginManifest, digest: string): PackageIdentity {
  return {
    pluginId: manifest.id,
    apiVersion: manifest.apiVersion,
    packageVersion: manifest.packageVersion,
    contentDigest: digest,
  };
}

interface ProvenanceInput { manifest: PluginManifest; root: string; digest: string; reference: string; now: string; verifier: string; source: 'builtin' | 'local'; scope: 'trusted_first_party' | 'isolated_external'; method: 'builtin_allowlist' | 'source_digest_allowlist' | 'publisher_attestation'; attestationDigest?: string; }
function provenanceRecord(input: ProvenanceInput): PackageProvenance {
  return { schemaVersion: 'package-provenance.v2', package: identity(input.manifest, input.digest), source: { type: input.source, canonicalReference: input.reference }, canonicalPath: input.root,
    trustScope: input.scope, trustEvidence: { method: input.method, verifier: input.verifier, verifiedAt: input.now, ...(input.attestationDigest ? { attestationDigest: input.attestationDigest } : {}) }, resolvedAt: input.now };
}

function trustedProvenance(
  manifest: PluginManifest,
  root: string,
  digest: string,
  options: DiscoveryOptions,
): PackageProvenance {
  const now = (options.now ?? (() => new Date()))().toISOString();
  const builtin = options.trustPolicy.trustedBuiltinRoots.some(
    (trustedRoot) => isWithin(root, fs.realpathSync(trustedRoot)),
  );
  const reference = `local:${root}`;
  if (builtin) {
    return provenanceRecord({ manifest, root, digest, reference, now, verifier: options.trustPolicy.verifierId, source: 'builtin', scope: 'trusted_first_party', method: 'builtin_allowlist' });
  }
  if ((options.trustPolicy.allowedSourceDigests.get(reference) ?? []).includes(digest)) {
    return provenanceRecord({ manifest, root, digest, reference, now, verifier: options.trustPolicy.verifierId, source: 'local', scope: 'isolated_external', method: 'source_digest_allowlist' });
  }
  const attestationDigest = options.trustPolicy.verifiedAttestations.get(digest);
  if (attestationDigest) {
    return provenanceRecord({ manifest, root, digest, reference, now, verifier: options.trustPolicy.verifierId, source: 'local', scope: 'isolated_external', method: 'publisher_attestation', attestationDigest });
  }
  throw new RegistryError('REGISTRY_PACKAGE_UNTRUSTED', `Plugin package is not trusted: ${manifest.id}`, {
    pluginId: manifest.id,
    root,
    digest,
  });
}

export function discoverPackages(options: DiscoveryOptions): readonly DiscoveredPackage[] {
  const roots = canonicalRoots(options.installationRoots, 'installationRoots');
  const trustedRoots = canonicalRoots(
    options.trustPolicy.trustedBuiltinRoots,
    'trustedBuiltinRoots',
  );
  const normalizedOptions: DiscoveryOptions = {
    ...options,
    installationRoots: roots,
    trustPolicy: {
      ...options.trustPolicy,
      trustedBuiltinRoots: trustedRoots,
    },
  };
  const seenPaths = new Set<string>();
  return roots.flatMap(packageDirectories).sort().map((candidate) => {
    const root = fs.realpathSync(candidate);
    if (seenPaths.has(root)) {
      throw new RegistryError('REGISTRY_PACKAGE_DUPLICATE', `Plugin package discovered more than once: ${root}`, { root });
    }
    seenPaths.add(root);
    const manifestPath = path.join(root, 'plugin.json');
    const manifest = deepFreeze(
      parsePluginManifest(fs.readFileSync(manifestPath, 'utf8'), manifestPath),
    );
    const digest = computePackageDigest(root);
    return deepFreeze({
      root,
      manifestPath,
      manifest,
      provenance: trustedProvenance(manifest, root, digest, normalizedOptions),
    });
  });
}
