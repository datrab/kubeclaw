import { createPublicKey } from 'node:crypto';

/** Effect-free receiver for the existing runtime.v1 source binding. This is
 * legacy runtime input, NOT selected-generation or original-boot authority.
 * Keep it separate from host evidence and capsule activation.
 */
export function readBusterPreparationRuntimeSource(runtime: Readonly<Record<string, unknown>>,
  environment: NodeJS.ProcessEnv) {
  // The parent must reject the same version/competing-owner boundary as the
  // child before accepting source trust. A future selected receiver is not v1.
  if (runtime.schemaVersion !== 'buster-remote-plan-runtime.v1') throw new Error('BUSTER_REMOTE_CONFIG_VERSION_INVALID');
  if (Object.hasOwn(runtime, 'runtimeService') || Object.hasOwn(runtime, 'remotePlanService')) {
    throw new Error('BUSTER_SERVICE_POLICY_COMPETING_AUTHOR');
  }
  // The generated installed-tool locator is not an editable policy or PATH
  // fallback. Reject unsupported input before reading any source carrier.
  if (runtime.tarExecutable !== '/usr/bin/tar') throw new Error('BUSTER_NATIVE_TAR_LOCATOR_INVALID');
  const publicKeyName = runtime.sourceAttestationPublicKeyEnvironmentVariable;
  if (typeof publicKeyName !== 'string' || !/^[A-Z][A-Z0-9_]*$/u.test(publicKeyName)
    || publicKeyName === runtime.tokenEnvironmentVariable
    || typeof runtime.trustedSourceAuthority !== 'string' || !runtime.trustedSourceAuthority.trim()) {
    throw new Error('BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID');
  }
  // Reject unsupported storage/timer metadata before accessing the public-key
  // carrier, just as the child validates its complete policy before authority.
  if (runtime.stateRoot !== '/var/lib/buster-v2/plan-jobs' || runtime.runtimeRoot !== '/var/lib/buster-v2/runs') {
    throw new Error('BUSTER_NATIVE_STATE_ROOT_INVALID');
  }
  if (!Number.isSafeInteger(runtime.shutdownTimeoutMs) || Number(runtime.shutdownTimeoutMs) < 1
    || Number(runtime.shutdownTimeoutMs) > 0x7fffffff) throw new Error('BUSTER_SERVICE_SHUTDOWN_TIMEOUT_REQUIRED');
  let sourceAttestationPublicKey: string;
  try {
    const value = environment[publicKeyName];
    if (!value) throw new Error('missing public key');
    const key = createPublicKey(value);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong public key algorithm');
    sourceAttestationPublicKey = key.export({ type: 'spki', format: 'pem' }).toString();
  } catch { throw new Error('BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID'); }
  return Object.freeze({ sourceAttestationPublicKey, trustedSourceAuthority: runtime.trustedSourceAuthority,
    stateRoot: runtime.stateRoot, tarExecutable: runtime.tarExecutable, serviceShutdownTimeoutMs: Number(runtime.shutdownTimeoutMs) });
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
    schemaVersion: 'buster-remote-plan-runtime.v1',
    sourceAttestationPublicKeyEnvironmentVariable: 'BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY',
    trustedSourceAuthority: environment.BUSTER_PLAN_TRUSTED_SOURCE_AUTHORITY || 'nova:production',
    stateRoot: environment.BUSTER_PLAN_STATE_DIR || '/var/lib/buster-v2/plan-jobs',
    runtimeRoot: environment.BUSTER_PLAN_RUN_DIR || '/var/lib/buster-v2/runs',
    tarExecutable: '/usr/bin/tar',
    shutdownTimeoutMs: 15000,
  });
  readBusterPreparationRuntimeSource(runtime, environment);
  return runtime;
}
