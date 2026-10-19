import type { captureRegistryPeer } from './production-registry-peer.ts';
import { createPublicKey } from 'node:crypto';
import { loadPlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
import { buildRegistry } from '@kubeclaw/plugin-foundation/registry/build';
import { discoverPackages } from '@kubeclaw/plugin-foundation/registry/discovery';
import fs from 'node:fs';
import path from 'node:path';
import { validateRegistryHealth } from './registry-health-access.ts';

export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  return value as Record<string, unknown>;
}

export function integer(value: unknown, label: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  return value as number;
}

export function optionalDatabasePolicy(value: unknown) {
  if (value === undefined) return {};
  const source = object(value, 'securityScan.databasePolicy');
  return {
    databasePolicy: {
      maximumVulnerabilityAgeMs: integer(
        source.maximumVulnerabilityAgeMs,
        'securityScan.databasePolicy.maximumVulnerabilityAgeMs',
      ),
      maximumJavaAgeMs: integer(source.maximumJavaAgeMs, 'securityScan.databasePolicy.maximumJavaAgeMs'),
      maximumDatabaseBytes: integer(source.maximumDatabaseBytes, 'securityScan.databasePolicy.maximumDatabaseBytes'),
    },
  };
}

export function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  return value;
}

export function stringMap(value: unknown, label: string): ReadonlyMap<string, string> {
  const source = object(value, label);
  if (Object.values(source).some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  }
  return new Map(Object.entries(source) as [string, string][]);
}

export function stringArray(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 32 ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  }
  return [...value] as string[];
}

export function optionalStringArray(value: unknown, label: string): readonly string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  }
  return [...value] as string[];
}

export function browserExecutableMap(
  value: unknown,
  label: string,
): Partial<Readonly<Record<'chromium' | 'firefox' | 'webkit', string>>> {
  if (value === undefined) return {};
  const source = object(value, label);
  const allowed = new Set(['chromium', 'firefox', 'webkit']);
  if (Object.keys(source).some((name) => !allowed.has(name))) throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  const result: Partial<Record<'chromium' | 'firefox' | 'webkit', string>> = {};
  for (const [name, executable] of Object.entries(source)) {
    if (typeof executable !== 'string' || !path.isAbsolute(executable))
      throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
    let canonical: string;
    try {
      canonical = fs.realpathSync(executable);
      fs.accessSync(canonical, fs.constants.X_OK);
    } catch {
      throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
    }
    result[name as 'chromium' | 'firefox' | 'webkit'] = canonical;
  }
  return result;
}

export function integerArray(value: unknown, label: string, maximum: number): readonly number[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 32 ||
    value.some((item) => !Number.isSafeInteger(item) || Number(item) < 1 || Number(item) > maximum)
  ) {
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  }
  return [...new Set(value.map(Number))];
}

export function optionalEnvironmentSecret(
  source: Record<string, unknown>,
  field: string,
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const name = source[field];
  if (name === undefined) return undefined;
  if (typeof name !== 'string' || !/^[A-Z][A-Z0-9_]*$/u.test(name))
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${field}`);
  const value = environment[name];
  if (!value) throw new Error(`BUSTER_REMOTE_CONFIG_SECRET_MISSING:${field}`);
  return value;
}

export function registryHealthConfiguration(
  enabled: unknown,
  source: Record<string, unknown> | null,
  username: string | undefined,
  password: string | undefined,
) {
  if (enabled !== true || !source) throw new Error('BUSTER_REGISTRY_HEALTH_CONFIG_INVALID');
  const options = {
    origin: String(source.registryBaseUrl),
    ...(username === undefined ? {} : { username, password: password! }),
  };
  validateRegistryHealth(options);
  if (new URL(options.origin).host !== source.registryReference)
    throw new Error('BUSTER_REGISTRY_HEALTH_ENDPOINT_MISMATCH');
  return options;
}

export function scannerRegistry(source: Record<string, unknown>, capturedRegistryPeer: ReturnType<typeof captureRegistryPeer>, directory: string) {
  if (source.registry === undefined) return {};
  const registry = object(source.registry, 'securityScan.registry');
  if (!capturedRegistryPeer) throw new Error('BUSTER_REGISTRY_PEER_REQUIRED');
  const { username, password } = capturedRegistryPeer;
  if ((username === undefined) !== (password === undefined))
    throw new Error('BUSTER_SCAN_REGISTRY_CREDENTIALS_INCOMPLETE');
  const url = new URL(String(registry.registryBaseUrl));
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !['https:', 'http:'].includes(url.protocol) ||
    url.host !== registry.registryReference ||
    (username !== undefined && url.protocol !== 'https:')
  )
    throw new Error('BUSTER_SCAN_REGISTRY_ENDPOINT_INVALID');
  if (url.protocol === 'http:') return { unsupportedHttpRegistry: url.host };
  if (username === undefined) throw new Error('BUSTER_SCAN_REGISTRY_CREDENTIALS_REQUIRED');
  return {
    registryAccess: {
      registryReference: url.host,
      username,
      password: password!,
      ...(registry.registryCaFile ? { caFile: path.resolve(directory, String(registry.registryCaFile)) } : {}),
    },
  };
}

export function validateRuntimeRoot(value: Record<string, unknown>): void {
  if (value.schemaVersion !== 'buster-remote-plan-runtime.v1') throw new Error('BUSTER_REMOTE_CONFIG_VERSION_INVALID');
  if (value.tarExecutable !== '/usr/bin/tar') throw new Error('BUSTER_NATIVE_TAR_LOCATOR_INVALID');
  for (const key of ['kubernetesFixture', 'tailscaleExposure', 'kubernetesRuntimeSecurity']) {
    if (Object.hasOwn(value, key)) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}`);
  }
  if (Object.hasOwn(value, 'dependencyReadiness')) {
    throw new Error('SWARM_CONFIG_LEGACY_OVERRIDE:dependencyReadiness:use buster-engine.config.json settings.dependencyReadiness');
  }
  for (const key of ['maximumArchiveBytes', 'maximumExtractedBytes', 'maximumRequestBytes']) {
    if (Object.hasOwn(value, key))
      throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}:use buster-engine.config.json settings.preparation`);
  }
  for (const key of ['maximumActiveJobs', 'maximumQueuedJobs', 'maximumConcurrentAttempts']) {
    if (Object.hasOwn(value, key)) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}:use buster-engine.config.json settings.admission`);
  }
  for (const name of [
    'platformConfig',
    'host',
    'sourceAttestationPublicKeyEnvironmentVariable',
    'trustedSourceAuthority',
    'stateRoot',
    'runtimeRoot',
    'tarExecutable',
  ]) {
    if (typeof value[name] !== 'string' || value[name].length === 0)
      throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${name}`);
  }
}

export function runtimeAuthority(value: Record<string, unknown>, environment: NodeJS.ProcessEnv) {
  // Reject competing authentication authors before reading either confidential
  // carrier or constructing registry/store handles. SPIFFE is proxied peer
  // authentication here, not a replacement source-key or delivery receipt.
  if (Object.hasOwn(value, 'trustedPeerSpiffeIds') === Object.hasOwn(value, 'tokenEnvironmentVariable')) {
    throw new Error('BUSTER_REMOTE_CONFIG_AUTHORITY_XOR_REQUIRED');
  }
  const trustedPeerSpiffeIds =
    value.trustedPeerSpiffeIds === undefined
      ? undefined
      : stringArray(value.trustedPeerSpiffeIds, 'trustedPeerSpiffeIds');
  let token: string | undefined;
  let tokenName: string | undefined;
  if (!trustedPeerSpiffeIds) {
    if (
      typeof value.tokenEnvironmentVariable !== 'string' ||
      !/^[A-Z][A-Z0-9_]*$/u.test(value.tokenEnvironmentVariable)
    ) {
      throw new Error('BUSTER_REMOTE_CONFIG_TOKEN_ENV_INVALID');
    }
    tokenName = value.tokenEnvironmentVariable;
  }
  const sourceKeyName = value.sourceAttestationPublicKeyEnvironmentVariable;
  if (typeof sourceKeyName !== 'string' || !/^[A-Z][A-Z0-9_]*$/u.test(sourceKeyName) || sourceKeyName === tokenName) {
    throw new Error('BUSTER_SOURCE_ATTESTATION_ENV_INVALID');
  }
  if (typeof value.trustedSourceAuthority !== 'string' || !value.trustedSourceAuthority.trim()) {
    throw new Error('BUSTER_SOURCE_ATTESTATION_AUTHORITY_REQUIRED');
  }
  // Validate both carrier names and issuer metadata before any confidential
  // lookup. Even equal public-key/token aliases must never read token bytes.
  if (tokenName) {
    token = environment[tokenName];
    if (!token) throw new Error('BUSTER_REMOTE_CONFIG_TOKEN_MISSING');
  }
  const sourceAttestationPublicKey = environment[sourceKeyName];
  if (!sourceAttestationPublicKey) throw new Error('BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING');
  // Source schema v1 still needs genuine original issuer/key-revision binding;
  // parsing an Ed25519 key is necessary, never sufficient proof of provenance.
  try {
    if (createPublicKey(sourceAttestationPublicKey).asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
  } catch (cause) { throw new Error('BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID', { cause }); }
  return { trustedPeerSpiffeIds, token, sourceAttestationPublicKey };
}

export function runtimeRegistry(value: Record<string, unknown>, directory: string) {
  const platform = loadPlatformConfig(path.resolve(directory, value.platformConfig as string));
  const registry = buildRegistry(
    discoverPackages({
      installationRoots: platform.installationRoots,
      trustPolicy: {
        trustedBuiltinRoots: platform.trustedBuiltinRoots,
        allowedSourceDigests: new Map(Object.entries(platform.externalTrust.allowedSourceDigests)),
        verifiedAttestations: new Map(Object.entries(platform.externalTrust.verifiedAttestations)),
        verifierId: 'kubeclaw-platform-v2',
      },
    }),
  );
  return registry;
}
