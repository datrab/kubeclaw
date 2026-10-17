import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
): ProductionNovaTestGate {
  const canonical = fs.realpathSync(file);
  const directory = path.dirname(canonical);
  const value = object(JSON.parse(fs.readFileSync(canonical, 'utf8')), 'root');
  assertKnownKeys(value, ['schemaVersion', 'endpoint', 'authentication', 'tokenEnvironmentVariable',
    'sourceAttestationPrivateKeyEnvironmentVariable', 'sourceAuthority', 'stateRoot', 'pollMilliseconds',
    'maximumResponseBytes', 'maximumResultBytes', 'maximumArchiveBytes', 'maximumArchiveStoreBytes',
    'maximumEvidenceBytes', 'maximumEvidenceStoreBytes', 'recordLimits'], 'root');
  if (value.schemaVersion !== 'nova-remote-test-gate-runtime.v1') throw new Error('NOVA_REMOTE_CONFIG_VERSION_INVALID');
  for (const name of ['endpoint', 'sourceAttestationPrivateKeyEnvironmentVariable',
    'sourceAuthority', 'stateRoot']) {
    if (typeof value[name] !== 'string' || value[name].length === 0) throw new Error(`NOVA_REMOTE_CONFIG_INVALID:${name}`);
  }
  const authentication = value.authentication === 'spiffe-proxy' ? 'spiffe-proxy' : 'bearer';
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
