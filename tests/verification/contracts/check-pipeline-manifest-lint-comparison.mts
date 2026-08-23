import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { executeLintReport } from '../../../skills/nova/plugins/lint/src/engine/index.ts';
import { createManifestParityFixture, legacyCompatibleWorkload, supportResources, workload } from './support/manifest-lint-parity-fixture.mts';

const fixture = createManifestParityFixture();
const recorded = JSON.parse(fs.readFileSync(
  'tests/fixtures/pipeline-test-gate/manifest-parity/legacy-comparison.v1.json', 'utf8'));

async function replacement(): Promise<any> {
  return executeLintReport({
    workingDirectory: fixture.repository,
    policyPath: fixture.policyPath,
    policyProject: 'fixture',
    tier: 'full',
  });
}

try {
  fixture.writeRaw(`${workload({ secondContainer: true, completeSecond: false })}${supportResources()}`);
  assert.equal(recorded.cases.incompleteSidecar.status, 'PASS');
  const aggregate = await replacement();
  assert.equal(aggregate.summary.total_blocking > 0, true);
  assert.equal(aggregate.tools['kubernetes-policy'].findings.some((entry: any) =>
    entry.message.includes("container 'sidecar'") && entry.code.endsWith('/readiness-probe')), true,
  'the authoritative replacement must reject the incomplete sidecar hidden by the old aggregate result');

  fixture.writeRaw(`${legacyCompatibleWorkload()}${supportResources()}`);
  const valid = await replacement();
  assert.equal(recorded.cases.valid.status, 'PASS');
  assert.equal(valid.summary.total_blocking, 0);
  assert.equal(valid.tools['kubernetes-schema'].status, 'ok');
  assert.equal(valid.tools['kubernetes-policy'].findings.length, 0);

  const secondSecretWorkload = workload({ secondContainer: false })
    .replace('runtime-secret, key: token', 'other-secret, key: token');
  fixture.writeRaw(`${secondSecretWorkload}${supportResources()}---\napiVersion: v1\nkind: Secret\nmetadata: { name: other-secret }\nstringData: { token: value }\n`);
  assert.equal(recorded.cases.secondDeclaredSecret.status, 'FAIL');
  const secondSecret = await replacement();
  assert.equal(secondSecret.tools['kubernetes-policy'].findings.some((entry: any) =>
    entry.code.endsWith('/valid-secret-refs')), false,
  'the replacement must resolve every declared Secret rather than one configured legacy Secret');

  fs.writeFileSync(path.join(fixture.repository, 'invalid.yaml'), 'kind: Deployment\nmetadata: [\n');
  const invalidPolicy = structuredClone(fixture.policy);
  invalidPolicy.projects[0].kubernetes.raw_manifests = ['invalid.yaml'];
  invalidPolicy.projects[0].kubernetes.helm_charts = [];
  fixture.writePolicy(invalidPolicy);
  assert.equal(recorded.cases.invalidYaml.status, 'FAIL');
  const invalid = await replacement();
  assert.equal(invalid.summary.tools_failed > 0, true);

  console.log(JSON.stringify({
    ok: true,
    phase: 'manifest-lint-cutover-comparison',
    authority: 'replacement-only',
    legacyEvidence: 'immutable-record',
    cases: ['pass', 'invalid-yaml', 'per-container', 'multi-secret'],
  }));
} finally {
  fixture.cleanup();
}
