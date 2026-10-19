import path from 'node:path';
import { object, optionalEnvironmentSecret, registryHealthConfiguration } from './production-config-values.ts';

const fields = ['registryBaseUrl', 'registryReference', 'registryCaFile',
  'registryUsernameEnvironmentVariable', 'registryPasswordEnvironmentVariable'] as const;

/** One generated operator peer, shared by active consumers; never activates a provider. */
export function readRegistryPeerSource(value: Record<string, unknown>, capabilities: ReadonlySet<string>) {
  const network = capabilities.has('network.http') ? object(value.networkHttp, 'networkHttp') : null;
  if (network && network.registryHealth !== undefined && network.registryHealth !== true) {
    throw new Error('BUSTER_REGISTRY_HEALTH_CONFIG_INVALID');
  }
  const required = capabilities.has('container.build') || capabilities.has('security.scan')
    || capabilities.has('kubernetes.fixture') || network?.registryHealth === true;
  if (!required) {
    if (Object.hasOwn(value, 'registryPeer')) throw new Error('BUSTER_REGISTRY_PEER_INACTIVE');
    return undefined;
  }
  if (!Object.hasOwn(value, 'registryPeer')) throw new Error('BUSTER_REGISTRY_PEER_REQUIRED');
  const source = object(value.registryPeer, 'registryPeer');
  if (Object.keys(source).some(key => !fields.includes(key as typeof fields[number]))
    || fields.some(key => Object.hasOwn(source, key) && (typeof source[key] !== 'string' || !source[key]))) {
    throw new Error('BUSTER_REGISTRY_PEER_INVALID');
  }
  const url = new URL(String(source.registryBaseUrl));
  const names = [source.registryUsernameEnvironmentVariable, source.registryPasswordEnvironmentVariable];
  if (url.origin !== source.registryBaseUrl || url.host !== source.registryReference
    || !['http:', 'https:'].includes(url.protocol)
    || (url.protocol === 'https:' ? names.some(name => typeof name !== 'string' || !/^[A-Z][A-Z0-9_]*$/u.test(name))
      : names.some(name => name !== undefined) || source.registryCaFile !== undefined)
    || (source.registryCaFile !== undefined && (!path.isAbsolute(String(source.registryCaFile)) || /[\r\n\0]/u.test(String(source.registryCaFile))))) {
    throw new Error('BUSTER_REGISTRY_PEER_INVALID');
  }
  // Compare public source references before resolving any confidential carrier.
  for (const alias of [capabilities.has('container.build') ? object(value.containerBuild, 'containerBuild') : null,
    capabilities.has('security.scan') ? object(object(value.securityScan, 'securityScan').registry, 'securityScan.registry') : null]) {
    if (alias && fields.some(key => alias[key] !== source[key])) throw new Error('BUSTER_REGISTRY_PEER_MISMATCH');
  }
  return Object.freeze({ ...source });
}

/** Resolve carriers only after the complete conditional source layer passes. */
export function captureRegistryPeer(value: Record<string, unknown>, capabilities: ReadonlySet<string>,
  environment: NodeJS.ProcessEnv) {
  const source = readRegistryPeerSource(value, capabilities);
  if (!source) return undefined;
  const username = optionalEnvironmentSecret(source, 'registryUsernameEnvironmentVariable', environment);
  const password = optionalEnvironmentSecret(source, 'registryPasswordEnvironmentVariable', environment);
  registryHealthConfiguration(true, source, username, password);
  // This captures values for this process only, not an authenticated original revision receipt.
  return Object.freeze({ source: Object.freeze({ ...source }), username, password });
}
