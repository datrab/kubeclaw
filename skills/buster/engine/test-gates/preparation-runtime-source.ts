import { createPublicKey } from 'node:crypto';

/** Effect-free receiver for the existing runtime.v1 source binding. This is
 * legacy runtime input, NOT selected-generation or original-boot authority.
 * Keep it separate from host evidence and capsule activation.
 */
export function readBusterPreparationRuntimeSource(runtime: Readonly<Record<string, unknown>>,
  environment: NodeJS.ProcessEnv) {
  const publicKeyName = runtime.sourceAttestationPublicKeyEnvironmentVariable;
  if (typeof publicKeyName !== 'string' || !/^[A-Z][A-Z0-9_]*$/u.test(publicKeyName)
    || typeof runtime.trustedSourceAuthority !== 'string' || !runtime.trustedSourceAuthority.trim()) {
    throw new Error('BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID');
  }
  let sourceAttestationPublicKey: string;
  try {
    const value = environment[publicKeyName];
    if (!value) throw new Error('missing public key');
    const key = createPublicKey(value);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong public key algorithm');
    sourceAttestationPublicKey = key.export({ type: 'spki', format: 'pem' }).toString();
  } catch { throw new Error('BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID'); }
  if (runtime.stateRoot !== '/var/lib/buster-v2/plan-jobs' || runtime.runtimeRoot !== '/var/lib/buster-v2/runs') {
    throw new Error('BUSTER_NATIVE_STATE_ROOT_INVALID');
  }
  if (!Number.isSafeInteger(runtime.shutdownTimeoutMs) || Number(runtime.shutdownTimeoutMs) < 1
    || Number(runtime.shutdownTimeoutMs) > 0x7fffffff) throw new Error('BUSTER_SERVICE_SHUTDOWN_TIMEOUT_REQUIRED');
  return Object.freeze({ sourceAttestationPublicKey, trustedSourceAuthority: runtime.trustedSourceAuthority,
    stateRoot: runtime.stateRoot, serviceShutdownTimeoutMs: Number(runtime.shutdownTimeoutMs) });
}

/** The existing shell producer's exact legacy projection, now validated before
 * any shell effects. These preserved v1 values are NOT a new CONFIG fallback.
 * The selected-owner successor must replace this producer as one complete
 * versioned contract; it cannot promote this value into verified boot facts.
 */
export function projectLegacyBusterPreparationSource(environment: NodeJS.ProcessEnv) {
  if (Object.hasOwn(environment, 'BUSTER_V2_STATE_DIR') || Object.hasOwn(environment, 'BUSTER_V2_RUN_DIR')) {
    throw new Error('BUSTER_NATIVE_LEGACY_STATE_ROOT_REJECTED');
  }
  const runtime = Object.freeze({
    sourceAttestationPublicKeyEnvironmentVariable: 'BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY',
    trustedSourceAuthority: environment.BUSTER_PLAN_TRUSTED_SOURCE_AUTHORITY || 'nova:production',
    stateRoot: environment.BUSTER_PLAN_STATE_DIR || '/var/lib/buster-v2/plan-jobs',
    runtimeRoot: environment.BUSTER_PLAN_RUN_DIR || '/var/lib/buster-v2/runs',
    shutdownTimeoutMs: 15000,
  });
  readBusterPreparationRuntimeSource(runtime, environment);
  return runtime;
}
