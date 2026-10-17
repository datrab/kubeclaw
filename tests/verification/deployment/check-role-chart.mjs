import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {busterChartProjection} from '../../../scripts/generate-buster-chart-config.mjs';
import {buildBusterImageBundle} from '../../../scripts/build-buster-image-bundle.mjs';
import {nativePoolPolicy} from '../../../scripts/native-worker-node-policy.mjs';
import {prismAgentBridgeProjection} from '../../../scripts/generate-prism-chart-config.mjs';
import { spawnSync } from 'node:child_process';
import { parse, parseAllDocuments, stringify } from 'yaml';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'role-chart-delivery-'));
try {
const revision=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});assert.equal(revision.status,0,revision.stderr);
const buster=await buildBusterImageBundle({repository:process.cwd(),output:path.join(temporary,'buster-image'),revision:revision.stdout.trim(),builtAt:new Date().toISOString()});
const receipt=path.join(temporary,'delivery.yaml');fs.writeFileSync(receipt,stringify({pipelineDelivery:{buster:buster.metadata}}));
// Package the complete chart with the normal current-author build projection.
// Do not synthesize a receipt or change the selected release to Helm lint's
// hard-coded test-release identity.
const chart=path.join(temporary,'chart');fs.cpSync('charts/kubeclaw',chart,{recursive:true,dereference:true});
const topology=busterChartProjection(path.resolve('config'));
assert.equal(topology.generationDigest,buster.metadata.expected.generationDigest);
fs.writeFileSync(path.join(chart,'files/pipeline/buster-topology.json'),JSON.stringify(topology,null,2)+'\n');
const packaged=path.join(temporary,'packaged');fs.mkdirSync(packaged);
const packageResult=spawnSync('helm',['package',chart,'--destination',packaged],{encoding:'utf8'});
assert.equal(packageResult.status,0,packageResult.error??packageResult.stderr);
const archives=fs.readdirSync(packaged).filter(name=>name.endsWith('.tgz'));assert.equal(archives.length,1);
const archive=path.join(packaged,archives[0]);
const archived=spawnSync('tar',['-xzOf',archive,'kubeclaw/files/pipeline/buster-topology.json'],{encoding:'utf8'});
assert.equal(archived.status,0,archived.stderr);assert.deepEqual(JSON.parse(archived.stdout),topology);
// Helm lint has no release-name option. Lint the full default chart, then
// validate each role's schema and templates at its genuine selected identity.
const lint=spawnSync('helm',['lint',archive],{encoding:'utf8'});
assert.equal(lint.status,0,lint.error??lint.stdout+'\n'+lint.stderr);
const prism=prismAgentBridgeProjection(path.resolve('config')).deployment;
const nativeProfile = parse(fs.readFileSync('my-values/infra/native-worker-pools.yaml', 'utf8'));
nativeProfile.nodeName = 'role-chart-render-test';
nativeProfile.pools.buster.namespace = buster.metadata.namespace;
const nativeBinding = nativePoolPolicy(nativeProfile, 'buster');
const busterRuntimeIndex = parse(fs.readFileSync('my-values/buster-values.yaml', 'utf8')).extraContainers.findIndex(item => item.name === 'buster-v2-runtime');
assert.ok(busterRuntimeIndex >= 0);

for (const [role, values, repository] of [
  ['nova', 'my-values/nova-values.yaml', 'ghcr.io/datrab/kubeclaw-nova'],
  ['prism', 'my-values/prism-agent-values.yaml', 'ghcr.io/datrab/kubeclaw-prism-agent'],
  ['buster', 'my-values/buster-values.yaml', 'ghcr.io/datrab/kubeclaw-buster-gateway'],
]) {
  const deployment=role==='buster'?buster.metadata:role==='prism'?prism:{namespace:'kubeclaw',releaseName:`agent-${role}`};
  const extra=role==='buster'?['-f',receipt,
    '--set-string', `busterNative.nodeName=${nativeBinding.nodeName}`,
    '--set-string', `busterNative.namespace=${buster.metadata.namespace}`,
    '--set-string', `busterNative.policyDigest=${nativeBinding.policyDigest}`,
    // Shape-only render fixture, not built-image or native execution evidence.
    '--set-string', `extraContainers[${busterRuntimeIndex}].image=ghcr.io/datrab/kubeclaw-buster-runtime@sha256:${'a'.repeat(64)}`,
  ]:[];
  const rendered = spawnSync('helm', ['template', deployment.releaseName, archive, '--namespace', deployment.namespace, ...extra, '-f', values,
    '-f', 'tests/fixtures/helm/runtime-registry.yaml'], { encoding: 'utf8' });
  assert.equal(rendered.status, 0, `Real Helm rendering is required: ${rendered.error ?? rendered.stderr}`);
  if(role==='buster'){
    // Identity and receipt validation remain fail-closed in the packaged chart.
    const wrong=spawnSync('helm',['template','wrong-release',archive,'--namespace',deployment.namespace,...extra,'-f',values,'-f','tests/fixtures/helm/runtime-registry.yaml'],{encoding:'utf8'});
    assert.notEqual(wrong.status,0);assert.match(wrong.stderr,/release identity/);
    const missing=spawnSync('helm',['template',deployment.releaseName,archive,'--namespace',deployment.namespace,'-f',values,'-f','tests/fixtures/helm/runtime-registry.yaml'],{encoding:'utf8'});
    assert.notEqual(missing.status,0);assert.match(missing.stderr,/exact selected Buster image delivery receipt required/);
  }
  const objects = parseAllDocuments(rendered.stdout).map(doc => { assert.deepEqual(doc.errors, []); return doc.toJSON(); });
  const renderedDeployment = objects.find(doc => doc?.kind === 'Deployment' && doc.metadata.name === `agent-${role}`);
  assert.ok(renderedDeployment, `Missing ${role} deployment`);
  const containers = renderedDeployment.spec.template.spec.containers;
  assert.ok(containers.some(container => container.image === `${repository}:latest`), `Missing role image: ${role}`);
  if (role === 'prism') {
    assert.equal(containers.find(container => container.name === 'prism-agent-bridge')?.image, `${repository}:latest`);
    assert.ok([...containers, ...renderedDeployment.spec.template.spec.initContainers].every(container => !container.image.includes('kubeclaw-nova')));
  }
  assert.ok([...containers, ...renderedDeployment.spec.template.spec.initContainers].every(container => !container.image.includes('kubeclaw-general')));
}
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
console.log('Real Helm rendered Nova, Prism and Buster with separate role images.');
