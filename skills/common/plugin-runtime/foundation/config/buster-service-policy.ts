import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';

/** Exact ten reviewed C3 service leaves on the EXISTING Buster owner.
 * This codec is neither a second author nor source/image/grant authority.
 * Whole-generation/selected-owner and credential receipts remain separate.
 */
export interface BusterRemotePlanServicePolicy {
  readonly host: '0.0.0.0' | '127.0.0.1';
  readonly port: number;
  readonly recordLimits: Readonly<{ maximumRecords: number; maximumBytes: number; maximumRecordBytes: number }>;
  readonly maximumResultBytes: number;
  readonly maximumResultStoreBytes: number;
  readonly maximumResponseBytes: number;
  readonly shutdownTimeoutMs: number;
  readonly allowedCapabilities: readonly string[];
}
interface Validator { (value: unknown): boolean; errors?: unknown[] | null }
const Constructor = Ajv2020 as unknown as new (options: { allErrors: boolean; strict: boolean }) => {
  compile(schema: object): Validator;
};
const schema = JSON.parse(fs.readFileSync(new URL('./buster-service-policy.schema.json', import.meta.url), 'utf8'));
const validate = new Constructor({ allErrors: true, strict: true }).compile(schema);
// Historical v1 explicitly supports an empty deny-all capability set. Keep that
// compatibility local to its versioned receiver; selected-owner domain is unchanged.
const legacySchema = structuredClone(schema);
legacySchema.properties.allowedCapabilities.minItems = 0;
const validateLegacy = new Constructor({ allErrors: true, strict: true }).compile(legacySchema);

/** Closed immutable policy snapshot; missing/extra/legacy keys never default.
 * The caller must resolve its original selected generation BEFORE invoking it.
 */
export function readBusterRemotePlanServicePolicy(value: unknown): BusterRemotePlanServicePolicy {
  return readPolicy(value, validate);
}

function readPolicy(value: unknown, validator: Validator): BusterRemotePlanServicePolicy {
  if (!validator(value)) throw new Error(`BUSTER_SERVICE_POLICY_INVALID:${JSON.stringify(validator.errors)}`);
  const policy = value as BusterRemotePlanServicePolicy;
  return Object.freeze({ host: policy.host, port: policy.port,
    recordLimits: Object.freeze({ ...policy.recordLimits }),
    maximumResultBytes: policy.maximumResultBytes, maximumResultStoreBytes: policy.maximumResultStoreBytes,
    maximumResponseBytes: policy.maximumResponseBytes, shutdownTimeoutMs: policy.shutdownTimeoutMs,
    allowedCapabilities: Object.freeze([...policy.allowedCapabilities]) });
}

/** Adapter for the EXISTING legacy generated runtime receiver only. This is
 * not the future v10 selected-owner projection and cannot authenticate it.
 * Explicitly project required leaves: no alias/spread/default/ENV author.
 */
export function readLegacyBusterRuntimeServicePolicy(runtime: Readonly<Record<string, unknown>>) {
  if (runtime.schemaVersion !== 'buster-remote-plan-runtime.v1') throw new Error('BUSTER_REMOTE_CONFIG_VERSION_INVALID');
  if (Object.hasOwn(runtime, 'runtimeService') || Object.hasOwn(runtime, 'remotePlanService')) {
    throw new Error('BUSTER_SERVICE_POLICY_COMPETING_AUTHOR');
  }
  return readPolicy({ host: runtime.host, port: runtime.port, recordLimits: runtime.recordLimits,
    maximumResultBytes: runtime.maximumResultBytes, maximumResultStoreBytes: runtime.maximumResultStoreBytes,
    maximumResponseBytes: runtime.maximumResponseBytes, shutdownTimeoutMs: runtime.shutdownTimeoutMs,
    allowedCapabilities: runtime.allowedCapabilities }, validateLegacy);
}

/** Preserve the actual runtime receiver's retired-author boundary in the
 * selected v2 source relation too. Equal values are still competing authors;
 * this validation grants no source/caller/native or output authority.
 */
export function rejectRetiredBusterRuntimeAuthors(value: Readonly<Record<string, unknown>>): void {
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
}

/** Versioned runtime.v2 receiving relation. The selected policy must come from
 * the original, whole-generation Buster binding; this comparison is not a
 * delivery/source grant and must never authorize v10 by itself.
 */
export function receiveBusterRuntimeV2ServicePolicy(
  runtime: Readonly<Record<string, unknown>>,
  originalSelectedPolicy: unknown,
): BusterRemotePlanServicePolicy {
  if (runtime.schemaVersion !== 'buster-remote-plan-runtime.v2') throw new Error('BUSTER_REMOTE_CONFIG_VERSION_INVALID');
  if (Object.hasOwn(runtime, 'runtimeService') || Object.hasOwn(runtime, 'remotePlanService')) {
    throw new Error('BUSTER_SERVICE_POLICY_COMPETING_AUTHOR');
  }
  rejectRetiredBusterRuntimeAuthors(runtime);
  const selected = readBusterRemotePlanServicePolicy(originalSelectedPolicy);
  const received = readBusterRemotePlanServicePolicy({ host: runtime.host, port: runtime.port,
    recordLimits: runtime.recordLimits, maximumResultBytes: runtime.maximumResultBytes,
    maximumResultStoreBytes: runtime.maximumResultStoreBytes,
    maximumResponseBytes: runtime.maximumResponseBytes, shutdownTimeoutMs: runtime.shutdownTimeoutMs,
    allowedCapabilities: runtime.allowedCapabilities });
  if (!isDeepStrictEqual(received, selected)) throw new Error('BUSTER_SELECTED_SERVICE_POLICY_MISMATCH');
  return selected;
}


/** Shared effect-free source envelope of the actual production reader.
 * The version is selected by the receiving path, never by the received value.
 * Public locator/issuer shape is not installed native or credential authority.
 */
export function validateBusterRuntimeSourceMetadata(value: Readonly<Record<string, unknown>>,
  version: 'buster-remote-plan-runtime.v1' | 'buster-remote-plan-runtime.v2'): void {
  if (value.schemaVersion !== version) throw new Error('BUSTER_REMOTE_CONFIG_VERSION_INVALID');
  if (value.tarExecutable !== '/usr/bin/tar') throw new Error('BUSTER_NATIVE_TAR_LOCATOR_INVALID');
  rejectRetiredBusterRuntimeAuthors(value);
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
