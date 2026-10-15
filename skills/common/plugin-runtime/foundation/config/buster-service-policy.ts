import fs from 'node:fs';
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
const validate = new Constructor({ allErrors: true, strict: true }).compile(
  JSON.parse(fs.readFileSync(new URL('./buster-service-policy.schema.json', import.meta.url), 'utf8')) as object);

/** Closed immutable policy snapshot; missing/extra/legacy keys never default.
 * The caller must resolve its original selected generation BEFORE invoking it.
 */
export function readBusterRemotePlanServicePolicy(value: unknown): BusterRemotePlanServicePolicy {
  if (!validate(value)) throw new Error(`BUSTER_SERVICE_POLICY_INVALID:${JSON.stringify(validate.errors)}`);
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
  return readBusterRemotePlanServicePolicy({ host: runtime.host, port: runtime.port, recordLimits: runtime.recordLimits,
    maximumResultBytes: runtime.maximumResultBytes, maximumResultStoreBytes: runtime.maximumResultStoreBytes,
    maximumResponseBytes: runtime.maximumResponseBytes, shutdownTimeoutMs: runtime.shutdownTimeoutMs,
    allowedCapabilities: runtime.allowedCapabilities });
}
