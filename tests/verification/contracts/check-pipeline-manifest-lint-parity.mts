import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { executeLintReport } from '../../../skills/nova/plugins/lint/src/engine/index.ts';
import { createManifestParityFixture, legacyCompatibleWorkload, supportResources, workload } from './support/manifest-lint-parity-fixture.mts';

const fixture = createManifestParityFixture();
const originalCwd = process.cwd();
const recorded = JSON.parse(fs.readFileSync(
  'tests/fixtures/pipeline-test-gate/manifest-parity/legacy-comparison.v1.json', 'utf8'));
assert.equal(recorded.schemaVersion, 'legacy-manifest-comparison.v1');

async function replacement(): Promise<any> {
  return executeLintReport({
    workingDirectory: fixture.repository,
    policyPath: fixture.policyPath,
    policyProject: 'fixture',
    tier: 'full',
    includeExperimental: true,
  });
}

try {
  const legacyFriendly = legacyCompatibleWorkload();
  fs.writeFileSync(path.join(fixture.repository, 'legacy-valid.yaml'), legacyFriendly);
  assert.equal(recorded.cases.valid.status, 'PASS', 'immutable old-path evidence must retain the valid result');

  const replacementPass = await replacement();
  assert.equal(replacementPass.tools['kubernetes-schema'].status, 'ok');
  assert.equal(replacementPass.tools['kubernetes-policy'].status, 'ok');
  assert.equal(replacementPass.tools['kubernetes-policy'].findings.length, 0);
  assert.equal(replacementPass.tools['kubernetes-schema'].experimental_findings, 0);
  assert.equal(replacementPass.tools['kubernetes-policy'].experimental_findings, 0);
  assert.equal(replacementPass.tools['kubernetes-schema'].evidence.some((entry: any) =>
    entry.kind === 'helm-render' && entry.source === 'charts/fixture' && entry.bytes > 0), true,
  'parity must prove that the declared Helm chart was rendered and schema-checked');
  assert.equal(replacementPass.tools['kubernetes-policy'].evidence.some((entry: any) =>
    entry.kind === 'helm-render' && entry.source === 'charts/fixture' && entry.bytes > 0), true,
  'parity must prove that rendered Helm resources reached policy evaluation');

  fs.writeFileSync(path.join(fixture.repository, 'invalid.yaml'), 'apiVersion: apps/v1\nkind: Deployment\nmetadata: [\n');
  assert.equal(recorded.cases.invalidYaml.status, 'FAIL');
  const invalidPolicy = structuredClone(fixture.policy);
  invalidPolicy.projects[0].kubernetes.raw_manifests = ['invalid.yaml'];
  invalidPolicy.projects[0].kubernetes.helm_charts = [];
  fixture.writePolicy(invalidPolicy);
  const replacementInvalid = await replacement();
  assert.match(replacementInvalid.tools['kubernetes-schema'].error, /unexpected|flow|YAML|end of the stream/iu);
  assert.equal(replacementInvalid.summary.tools_failed > 0, true, 'authoritative invalid YAML must fail a required lint tool');

  fixture.writePolicy(fixture.policy);
  fixture.writeRaw(`${workload({ secondContainer: true, completeSecond: false })}${supportResources()}`);
  const perContainer = await replacement();
  const findings = perContainer.tools['kubernetes-policy'].findings;
  assert.equal(findings.some((entry: any) => entry.message.includes("container 'sidecar'") && entry.code.endsWith('/readiness-probe')), true);
  assert.equal(findings.some((entry: any) => entry.message.includes("container 'sidecar'") && entry.code.endsWith('/liveness-probe')), true);
  assert.equal(findings.filter((entry: any) => entry.message.includes("container 'sidecar'") && entry.code.endsWith('/resource-limits')).length, 2);
  assert.equal(findings.some((entry: any) => entry.message.includes("container 'app'") && entry.code.endsWith('/readiness-probe')), false,
    'one valid container and one invalid container must remain separate');

  fixture.writeRaw(`${workload({ secondContainer: false })}${supportResources()}`);
  const exactSources = await replacement();
  assert.equal(exactSources.tools['kubernetes-policy'].findings.length, 0,
    'Secret, ConfigMap envFrom, optional references, and ServiceAccount pull secrets must resolve');

  const missingSources = `${workload({ secondContainer: false })
    .replace('runtime-env', 'missing-env')
    .replace('runtime-config', 'missing-config')
    .replace('runtime-secret', 'missing-secret')}${supportResources()}`;
  fixture.writeRaw(missingSources);
  const missing = await replacement();
  const missingFindings = missing.tools['kubernetes-policy'].findings;
  assert.equal(missingFindings.some((entry: any) => entry.code.endsWith('/required-runtime-env') && entry.message.includes('unresolved envFrom')), true);
  assert.equal(missingFindings.some((entry: any) => entry.code.endsWith('/valid-secret-refs') && entry.message.includes('missing-secret/token')), true);

  const kinds = ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'];
  fixture.writeRaw(`${kinds.map((kind) => workload({ kind, name: kind.toLowerCase(), secondContainer: false })).join('---\n')}${supportResources()}`);
  const manyWorkloads = await replacement();
  assert.equal(manyWorkloads.tools['kubernetes-schema'].status, 'ok');
  assert.equal(manyWorkloads.tools['kubernetes-policy'].findings.length, 0);
  const rawEvidence = manyWorkloads.tools['kubernetes-policy'].evidence.find((entry: any) => entry.kind === 'raw-manifest');
  assert.equal(rawEvidence.source, 'raw.yaml');

  fixture.writeRaw(`${workload({ name: 'good', secondContainer: false })}---\n${workload({ name: 'bad', secondContainer: true, completeSecond: false })}${supportResources()}`);
  const separateWorkloads = await replacement();
  assert.equal(separateWorkloads.tools['kubernetes-policy'].findings.some((entry: any) => entry.message.includes('Deployment/bad')), true);
  assert.equal(separateWorkloads.tools['kubernetes-policy'].findings.some((entry: any) => entry.message.includes('Deployment/good')), false);

  fixture.writeRaw(`${workload({ secondContainer: false }).replace('apps/v1', 'apps/v2')}${supportResources()}`);
  const schemaFailure = await replacement();
  assert.equal(schemaFailure.tools['kubernetes-schema'].findings.some((entry: any) => entry.file === 'raw.yaml'), true);
  assert.equal(schemaFailure.tools['kubernetes-schema'].blocking_findings > 0, true);

  const networkPolicy = structuredClone(fixture.policy);
  networkPolicy.projects[0].kubernetes.schema_location = 'https://schemas.example.invalid/{{.ResourceKind}}.json';
  fixture.writePolicy(networkPolicy);
  await assert.rejects(replacement(), /operator-controlled path|network schema locations/u);

  const runtimeSource = fs.readFileSync('skills/nova/plugins/lint/src/engine/kubernetes-policy-tools.ts', 'utf8');
  assert.doesNotMatch(runtimeSource, /kubectl|kubernetes-client|apply\s/u,
    'static manifest lint must not contact or apply to a Kubernetes cluster');

  console.log(JSON.stringify({
    ok: true,
    phase: 'manifest-lint-parity',
    parityItems: 28,
    rawAndHelm: true,
    workloadKinds: kinds,
    defectsRemoved: 6,
    authority: 'replacement-only',
  }));
} finally {
  process.chdir(originalCwd);
  fixture.cleanup();
}
