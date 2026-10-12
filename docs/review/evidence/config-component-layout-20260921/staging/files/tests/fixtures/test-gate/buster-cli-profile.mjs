import { canonicalSwarmEntry, readTestBundle, writeTestBundle } from '../config/swarm-bundle.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function cliProfile(root, admission) {
  const document = readTestBundle(canonicalSwarmEntry);
  document['buster-engine'].settings.admission = admission;
  const swarm = path.join(root, 'swarm.json'), platform = path.join(root, 'platform.json'), runtime = path.join(root, 'runtime.json');
  const plugins = path.resolve('skills/buster/plugins');
  const keys = crypto.generateKeyPairSync('ed25519');
  writeTestBundle(swarm, document);
  fs.writeFileSync(platform, JSON.stringify({ schemaVersion: 'pipeline-platform.v2', installationRoots: [plugins],
    trustedBuiltinRoots: [plugins], externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
    providers: {}, grants: {}, adapters: {}, activeAdapters: [], observers: {}, storageRoot: './platform-state',
    shutdownTimeoutMs: 5000, orchestratorIssuerId: 'admission-cli', administrativeDecisionIssuers: [] }));
  fs.writeFileSync(runtime, JSON.stringify({ schemaVersion: 'buster-remote-plan-runtime.v1', platformConfig: platform,
    host: '127.0.0.1', port: 0, tokenEnvironmentVariable: 'ADMISSION_TEST_TOKEN',
    sourceAttestationPublicKeyEnvironmentVariable: 'ADMISSION_TEST_SOURCE_KEY', trustedSourceAuthority: 'nova:admission',
    stateRoot: './plan-jobs', runtimeRoot: './runs', tarExecutable: '/usr/bin/tar', allowedCapabilities: [],
    recordLimits: { maximumRecords: 10, maximumBytes: 1048576, maximumRecordBytes: 131072 },
    maximumResultBytes: 65536, maximumResultStoreBytes: 1048576, maximumResponseBytes: 65536, shutdownTimeoutMs: 5000 }));
  return { runtime, environment: { ...process.env, SWARM_CONFIG: swarm, KUBECLAW_BUILD_REVISION: 'a'.repeat(40),
    ADMISSION_TEST_TOKEN: 'test-only-admission-token-000000000000',
    ADMISSION_TEST_SOURCE_KEY: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() } };
}
