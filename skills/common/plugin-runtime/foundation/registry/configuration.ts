import fs from 'node:fs';
import path from 'node:path';
import { RegistryError } from './errors.ts';
import { resolveReferencedValue, validateReferencedValue } from './schema.ts';
import type { RegistrySnapshot } from './types.ts';
import type { JsonValue, ProviderConfigurationV1 } from '@kubeclaw/pipeline-test-gate-contract';

export interface ConfiguredStageRegistration {
  readonly type: string;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface RuntimeRegistrationConfiguration {
  readonly stages: readonly ConfiguredStageRegistration[];
  readonly observers: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly adapters: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}

function schemaPath(
  entry: {
    readonly package: { readonly root: string };
    readonly registration: { readonly configSchema: string };
  },
): string {
  return fs.realpathSync(path.join(entry.package.root, entry.registration.configSchema));
}

export function validateRuntimeRegistrationConfiguration(
  snapshot: RegistrySnapshot,
  enabledRegistrations: ReadonlySet<string>,
  configured: RuntimeRegistrationConfiguration,
): void {
  for (const stage of configured.stages) {
    const entry = snapshot.stages.get(stage.type);
    if (!entry) {
      throw new RegistryError(
        'REGISTRY_REGISTRATION_MISSING',
        `Configured stage type has no registered owner: ${stage.type}`,
      );
    }
    const registrationId = `${entry.package.manifest.id}:${entry.registration.id}`;
    if (!enabledRegistrations.has(registrationId)) {
      throw new RegistryError(
        'REGISTRY_REGISTRATION_MISSING',
        `Configured stage owner is not enabled: ${registrationId}`,
      );
    }
    validateReferencedValue(schemaPath(entry), stage.config, snapshot.schemas);
  }

  for (const registrationId of configured.observers.keys()) {
    if (!snapshot.observers.has(registrationId)) {
      throw new RegistryError(
        'REGISTRY_REGISTRATION_MISSING',
        `Configured observer does not exist: ${registrationId}`,
      );
    }
  }
  for (const registrationId of configured.adapters.keys()) {
    if (!snapshot.adapters.has(registrationId)) {
      throw new RegistryError(
        'REGISTRY_REGISTRATION_MISSING',
        `Configured adapter does not exist: ${registrationId}`,
      );
    }
  }

  for (const [registrationId, entry] of snapshot.observers) {
    if (!enabledRegistrations.has(registrationId)) continue;
    validateReferencedValue(
      schemaPath(entry),
      configured.observers.get(registrationId) ?? Object.freeze({}),
      snapshot.schemas,
    );
  }
  for (const [registrationId, entry] of snapshot.adapters) {
    if (!enabledRegistrations.has(registrationId)) continue;
    validateReferencedValue(
      schemaPath(entry),
      configured.adapters.get(registrationId) ?? Object.freeze({}),
      snapshot.schemas,
    );
  }
}

export function validateTestProviderConfiguration(
  snapshot: RegistrySnapshot,
  contractId: string,
  value: unknown,
): void {
  const entry = snapshot.testProviderContracts.get(contractId);
  if (!entry) {
    throw new RegistryError(
      'REGISTRY_REGISTRATION_MISSING',
      `Test-provider contract does not exist: ${contractId}`,
      { contractId },
    );
  }
  validateReferencedValue(entry.configSchemaPath, value, snapshot.schemas);
}

export function resolveTestProviderConfiguration(
  snapshot: RegistrySnapshot,
  contractId: string,
  value: Readonly<Record<string, JsonValue>>,
): ProviderConfigurationV1 {
  const entry = snapshot.testProviderContracts.get(contractId);
  if (!entry) {
    throw new RegistryError(
      'REGISTRY_REGISTRATION_MISSING',
      `Test-provider contract does not exist: ${contractId}`,
      { contractId },
    );
  }
  return Object.freeze({
    schemaVersion: 'provider-configuration.v1',
    contractId,
    schemaDigest: entry.configSchemaDigest,
    values: resolveReferencedValue(entry.configSchemaPath, value, snapshot.schemas) as Record<string, JsonValue>,
  });
}
