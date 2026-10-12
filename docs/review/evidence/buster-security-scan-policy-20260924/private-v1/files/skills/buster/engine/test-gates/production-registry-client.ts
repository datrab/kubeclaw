import path from 'node:path';
import { object, optionalEnvironmentSecret } from './production-config-values.ts';
import { validateRegistryHealth, type RegistryHealthOptions } from './registry-health-access.ts';

/** Captured delivery of the existing operator registry descriptor, never an admission grant. */
export interface RegistryClientBinding {
  readonly origin: string;
  readonly registryReference: string;
  readonly username?: string;
  readonly password?: string;
  readonly caFile?: string;
}

export function registryClientBinding(value: unknown, directory: string,
  environment: Readonly<Record<string, string | undefined>>): RegistryClientBinding | undefined {
  if (value === undefined) return undefined;
  const source = object(value, 'registryClient');
  const fields = ['registryBaseUrl', 'registryReference', 'registryCaFile',
    'registryUsernameEnvironmentVariable', 'registryPasswordEnvironmentVariable'];
  if (Object.keys(source).some(key => !fields.includes(key))
    || typeof source.registryBaseUrl !== 'string' || typeof source.registryReference !== 'string') {
    throw new Error('BUSTER_REGISTRY_CLIENT_CONFIG_INVALID');
  }
  const url = new URL(source.registryBaseUrl);
  if (url.origin !== source.registryBaseUrl || url.host !== source.registryReference
    || !['https:', 'http:'].includes(url.protocol)) throw new Error('BUSTER_REGISTRY_CLIENT_ENDPOINT_INVALID');
  const ca = source.registryCaFile;
  if (Object.hasOwn(source, 'registryCaFile') && (typeof ca !== 'string' || !ca || ca.includes('\0') || url.protocol !== 'https:')) {
    throw new Error('BUSTER_REGISTRY_CLIENT_CA_INVALID');
  }
  const username = optionalEnvironmentSecret(source, 'registryUsernameEnvironmentVariable', environment);
  const password = optionalEnvironmentSecret(source, 'registryPasswordEnvironmentVariable', environment);
  const credentials = username === undefined && password === undefined ? {} : { username, password };
  const binding = { origin: url.origin, registryReference: url.host, ...credentials,
    ...(typeof ca === 'string' ? { caFile: path.resolve(directory, ca) } : {}) };
  validateRegistryHealth(binding);
  return Object.freeze(binding);
}

export function requiredRegistryClient(binding: RegistryClientBinding | undefined): RegistryClientBinding {
  if (!binding) throw new Error('BUSTER_REGISTRY_CLIENT_REQUIRED');
  return binding;
}

export function registryHealthConfiguration(enabled: unknown, binding: RegistryClientBinding | undefined): RegistryHealthOptions {
  if (enabled !== true) throw new Error('BUSTER_REGISTRY_HEALTH_CONFIG_INVALID');
  const selected = requiredRegistryClient(binding);
  return { origin: selected.origin,
    ...(selected.username === undefined ? {} : { username: selected.username, password: selected.password! }) };
}

export function scannerRegistry(binding: RegistryClientBinding | undefined) {
  if (!binding) return {};
  if (new URL(binding.origin).protocol === 'http:') return { unsupportedHttpRegistry: binding.registryReference };
  return { registryAccess: { registryReference: binding.registryReference,
    username: binding.username!, password: binding.password!,
    ...(binding.caFile === undefined ? {} : { caFile: binding.caFile }) } };
}
