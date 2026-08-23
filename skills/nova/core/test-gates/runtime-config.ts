import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { LegacySuiteMigrationLedger } from './legacy-bridge.ts';
import { createProductionNovaTestGate, type ProductionNovaTestGate } from './production.ts';

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`NOVA_REMOTE_CONFIG_INVALID:${label}`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`NOVA_REMOTE_CONFIG_INVALID:${label}`);
  return value as number;
}

export function loadProductionNovaTestGate(
  file: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProductionNovaTestGate {
  const canonical = fs.realpathSync(file);
  const directory = path.dirname(canonical);
  const value = object(JSON.parse(fs.readFileSync(canonical, 'utf8')), 'root');
  if (value.schemaVersion !== 'nova-remote-test-gate-runtime.v1') throw new Error('NOVA_REMOTE_CONFIG_VERSION_INVALID');
  for (const name of ['endpoint', 'tokenEnvironmentVariable', 'sourceAttestationPrivateKeyEnvironmentVariable',
    'sourceAuthority', 'stateRoot', 'legacyLedgerPath']) {
    if (typeof value[name] !== 'string' || value[name].length === 0) throw new Error(`NOVA_REMOTE_CONFIG_INVALID:${name}`);
  }
  const tokenName = value.tokenEnvironmentVariable as string;
  if (!/^[A-Z][A-Z0-9_]*$/u.test(tokenName)) throw new Error('NOVA_REMOTE_CONFIG_TOKEN_ENV_INVALID');
  const token = environment[tokenName];
  if (!token) throw new Error('NOVA_REMOTE_CONFIG_TOKEN_MISSING');
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
  const endpoint = new URL(value.endpoint as string);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !loopback) throw new Error('NOVA_REMOTE_PLAN_TLS_REQUIRED');
  const ledgerPath = path.resolve(directory, value.legacyLedgerPath as string);
  const ledgerSource = object(JSON.parse(fs.readFileSync(fs.realpathSync(ledgerPath), 'utf8')), 'legacyLedger');
  const ledgerEntries = object(ledgerSource.suites, 'legacyLedger.suites');
  const ledger: Record<string, { state: 'unmigrated' | 'migrated'; successor: string }> = {};
  for (const [suite, entrySource] of Object.entries(ledgerEntries)) {
    const entry = object(entrySource, `legacyLedger.suites.${suite}`);
    if (!['unmigrated', 'migrated'].includes(String(entry.state)) || typeof entry.successor !== 'string' || entry.successor.length === 0) {
      throw new Error(`NOVA_REMOTE_CONFIG_INVALID:legacyLedger.suites.${suite}`);
    }
    ledger[suite] = { state: entry.state as 'unmigrated' | 'migrated', successor: entry.successor };
  }
  const records = object(value.recordLimits, 'recordLimits');
  return createProductionNovaTestGate({
    endpoint: endpoint.href,
    token,
    sourceAuthority: value.sourceAuthority as string,
    sourceAttestationPrivateKey: parsedSourceKey.export({ type: 'pkcs8', format: 'pem' }),
    stateRoot: path.resolve(directory, value.stateRoot as string),
    legacyLedger: ledger as LegacySuiteMigrationLedger,
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
