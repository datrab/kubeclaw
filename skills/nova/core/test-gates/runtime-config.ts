import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadCoreRuntimePolicy } from '@kubeclaw/plugin-foundation/config/core-runtime-policy';
import { captureSourceAcquisitionPolicy, type SourceAcquisitionPolicy } from './source-acquisition-policy.ts';
import { assertSecureRemoteEndpoint } from './secure-endpoint.ts';
import { createProductionNovaTestGate, type ProductionNovaTestGate } from './production.ts';

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`NOVA_REMOTE_CONFIG_INVALID:${label}`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`NOVA_REMOTE_CONFIG_INVALID:${label}`);
  return value as number;
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknown) throw new Error(`NOVA_REMOTE_CONFIG_INVALID:${label}.${unknown}`);
}

export function loadProductionNovaTestGate(
  file: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  sourceAcquisitionSelection?: SourceAcquisitionPolicy,
  cleanupMillisecondsSelection?: number,
): ProductionNovaTestGate {
  // Explicit receiving only: v1 stays closed; never read live Core during recovery.
  let sourceAcquisitionPolicy = sourceAcquisitionSelection === undefined
    ? undefined : captureSourceAcquisitionPolicy(sourceAcquisitionSelection);
  let cleanupMilliseconds = cleanupMillisecondsSelection;
  if (cleanupMilliseconds !== undefined && (!Number.isSafeInteger(cleanupMilliseconds)
    || cleanupMilliseconds < 1 || cleanupMilliseconds > 2147483647)) throw new Error('NOVA_REMOTE_CLEANUP_TIMEOUT_INVALID');
  const canonical = fs.realpathSync(file);
  const directory = path.dirname(canonical);
  const value = object(JSON.parse(fs.readFileSync(canonical, 'utf8')), 'root');
  const selectedVersion = value.schemaVersion === 'nova-remote-test-gate-runtime.v2';
  assertKnownKeys(value, [...(selectedVersion ? ['corePolicySelection'] : []), 'schemaVersion', 'endpoint', 'authentication', 'tokenEnvironmentVariable',
    'sourceAttestationPrivateKeyEnvironmentVariable', 'sourceAuthority', 'stateRoot', 'pollMilliseconds',
    'maximumResponseBytes', 'maximumResultBytes', 'maximumArchiveBytes', 'maximumArchiveStoreBytes',
    'maximumEvidenceBytes', 'maximumEvidenceStoreBytes', 'recordLimits'], 'root');
  if (!selectedVersion && value.schemaVersion !== 'nova-remote-test-gate-runtime.v1') throw new Error('NOVA_REMOTE_CONFIG_VERSION_INVALID');
  // The migrated reader requires an authored mode. Keep implicit bearer only
  // in the closed v1 decoder; invalid v2 values cannot select that old policy.
  if (selectedVersion && value.authentication !== 'bearer' && value.authentication !== 'spiffe-proxy') {
    throw new Error('NOVA_REMOTE_CONFIG_INVALID:authentication');
  }
  if (selectedVersion && value.authentication === 'spiffe-proxy' && Object.hasOwn(value, 'tokenEnvironmentVariable')) {
    throw new Error('NOVA_REMOTE_CONFIG_INVALID:tokenEnvironmentVariable');
  }
  if (selectedVersion) {
    const selection = object(value.corePolicySelection, 'corePolicySelection');
    assertKnownKeys(selection, ['file', 'profile'], 'corePolicySelection');
    if (typeof selection.file !== 'string' || !selection.file || typeof selection.profile !== 'string' || !selection.profile) {
      throw new Error('NOVA_REMOTE_CONFIG_INVALID:corePolicySelection');
    }
    // A retained v2 operation must supply the complete original policy pair.
    // Never mix captured source policy with a hidden cleanup default, or a
    // captured cleanup budget with the current owner's source policy.
    if ((sourceAcquisitionPolicy === undefined) !== (cleanupMilliseconds === undefined)) {
      throw new Error('NOVA_REMOTE_RETAINED_POLICY_INCOMPLETE');
    }
    // Original captures are passed explicitly by retained callers. New starts
    // resolve exactly one selected central owner, relative to this runtime file.
    // v1 remains closed and keeps its original no-selection behavior.
    if (sourceAcquisitionPolicy === undefined) {
      const selected = loadCoreRuntimePolicy({
        file: path.resolve(directory, selection.file), profile: selection.profile,
      });
      sourceAcquisitionPolicy = captureSourceAcquisitionPolicy(selected.sourceAcquisition);
      cleanupMilliseconds ??= selected.remotePlanDispatch.cleanupMilliseconds;
    }
  }
  for (const name of ['endpoint', 'sourceAttestationPrivateKeyEnvironmentVariable',
    'sourceAuthority', 'stateRoot']) {
    if (typeof value[name] !== 'string' || value[name].length === 0) throw new Error(`NOVA_REMOTE_CONFIG_INVALID:${name}`);
  }
  const authentication = selectedVersion ? value.authentication as 'bearer' | 'spiffe-proxy'
    : value.authentication === 'spiffe-proxy' ? 'spiffe-proxy' : 'bearer';
  let tokenName: string | undefined;
  let token: string | undefined;
  if (authentication === 'bearer') {
    if (typeof value.tokenEnvironmentVariable !== 'string'
      || !/^[A-Z][A-Z0-9_]*$/u.test(value.tokenEnvironmentVariable)) {
      throw new Error('NOVA_REMOTE_CONFIG_TOKEN_ENV_INVALID');
    }
    tokenName = value.tokenEnvironmentVariable;
    token = environment[tokenName];
    if (!token) throw new Error('NOVA_REMOTE_CONFIG_TOKEN_MISSING');
  }
  const sourceKeyName = value.sourceAttestationPrivateKeyEnvironmentVariable as string;
  if (!/^[A-Z][A-Z0-9_]*$/u.test(sourceKeyName) || sourceKeyName === tokenName) {
    throw new Error('NOVA_SOURCE_ATTESTATION_ENV_INVALID');
  }
  const sourceAttestationPrivateKey = environment[sourceKeyName];
  if (!sourceAttestationPrivateKey) throw new Error('NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_MISSING');
  let parsedSourceKey: crypto.KeyObject;
  try { parsedSourceKey = crypto.createPrivateKey(sourceAttestationPrivateKey); }
  catch (error) { throw new Error('NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_INVALID', { cause: error }); }
  if (parsedSourceKey.asymmetricKeyType !== 'ed25519') throw new Error('NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_INVALID');
  const endpoint = assertSecureRemoteEndpoint(value.endpoint as string);
  const records = object(value.recordLimits, 'recordLimits');
  assertKnownKeys(records, ['maximumRecords', 'maximumBytes', 'maximumRecordBytes'], 'recordLimits');
  return createProductionNovaTestGate({
    ...(cleanupMilliseconds === undefined ? {} : { cleanupMilliseconds }),
    ...(sourceAcquisitionPolicy ? { sourceAcquisitionPolicy } : {}),
    endpoint: endpoint.href,
    ...(token ? { token } : {}),
    authentication,
    sourceAuthority: value.sourceAuthority as string,
    sourceAttestationPrivateKey: parsedSourceKey.export({ type: 'pkcs8', format: 'pem' }),
    stateRoot: path.resolve(directory, value.stateRoot as string),
    pollMilliseconds: integer(value.pollMilliseconds, 'pollMilliseconds', 10),
    maximumResponseBytes: integer(value.maximumResponseBytes, 'maximumResponseBytes'),
    maximumResultBytes: integer(value.maximumResultBytes, 'maximumResultBytes'),
    maximumArchiveBytes: integer(value.maximumArchiveBytes, 'maximumArchiveBytes'),
    maximumArchiveStoreBytes: integer(value.maximumArchiveStoreBytes, 'maximumArchiveStoreBytes'),
    maximumEvidenceBytes: integer(value.maximumEvidenceBytes, 'maximumEvidenceBytes'),
    maximumEvidenceStoreBytes: integer(value.maximumEvidenceStoreBytes, 'maximumEvidenceStoreBytes'),
    recordLimits: {
      maximumRecords: integer(records.maximumRecords, 'recordLimits.maximumRecords'),
      maximumBytes: integer(records.maximumBytes, 'recordLimits.maximumBytes'),
      maximumRecordBytes: integer(records.maximumRecordBytes, 'recordLimits.maximumRecordBytes'),
    },
  });
}
