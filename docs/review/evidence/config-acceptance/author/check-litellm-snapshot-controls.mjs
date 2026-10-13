// Existing local renderer only: no cluster, external LiteLLM or API execution.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { loadAll, dump } from 'js-yaml';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const renderer = resolve('scripts/render-litellm-deployment.mjs');
const temporary = mkdtempSync(join(tmpdir(), 'c0-litellm-snapshot-'));
const results = [];
const deployment = {
  apiVersion:'apps/v1', kind:'Deployment', metadata:{name:'litellm'},
  spec:{replicas:1, selector:{matchLabels:{app:'litellm'}}, template:{
    metadata:{labels:{app:'litellm'}, annotations:{}}, spec:{
      containers:[{name:'litellm',image:'example.invalid/litellm@sha256:'+'a'.repeat(64),
        volumeMounts:[{name:'config',mountPath:'/config'}]}],
      volumes:[{name:'config',configMap:{name:'litellm-config'}}]}}}
};
function observe(name, config, documents, expectedError) {
  const configPath=join(temporary,'config.yaml');
  const deploymentPath=join(temporary,'deployment.yaml');
  const manifest=documents.map(value=>dump(value)).join('---\n');
  writeFileSync(configPath,config); writeFileSync(deploymentPath,manifest);
  const argv=[renderer,configPath,deploymentPath];
  const process=spawnSync(processExec(),argv,{encoding:'utf8'});
  if(expectedError) {
    assert.notEqual(process.status,0); assert.ok(process.stderr.includes(expectedError));
  } else {
    assert.equal(process.status,0,process.stderr);
    const output=loadAll(process.stdout);
    const configMap=output.find(value=>value.kind==='ConfigMap');
    const rendered=output.find(value=>value.kind==='Deployment');
    assert.equal(configMap.data['config.yaml'],config);
    assert.equal(rendered.spec.template.metadata.annotations['checksum/litellm-config'],hash(config));
  }
  results.push({name,argv,exit:process.status,configSha256:hash(config),
    deploymentSha256:hash(manifest),stdout:process.stdout,stderr:process.stderr,
    expectedError:expectedError??null,passed:true});
}
function processExec(){ return process.execPath; }
try {
  observe('A-original-config-snapshot','model_list: []\n',[deployment]);
  observe('B-distinct-config-same-snapshot','model_list: []\ngeneral_settings:\n  max_parallel_requests: 2\n',[deployment]);
  observe('duplicate-named-deployment-rejected','model_list: []\n',[deployment,deployment],'LITELLM_DEPLOYMENT_REQUIRED');
  const bad=structuredClone(deployment); bad.spec.template.spec.volumes[0].configMap.name='different';
  observe('different-config-mount-rejected','model_list: []\n',[bad],'LITELLM_CONFIG_MOUNT_INVALID');
  const receipt={scope:'Actual existing local renderer definition checks only. Synthetic complete Kubernetes-shaped inputs are not external-schema, image, deployment, LiteLLM behavior or runtime acceptance.',
    sourceSha256:hash(readFileSync(renderer)),testSha256:hash(readFileSync(new URL(import.meta.url))),results};
  writeFileSync('docs/review/evidence/config-acceptance/author/litellm-snapshot-controls-20261013.json',JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({passed:results.length,scope:receipt.scope}));
} finally { rmSync(temporary,{recursive:true,force:true}); }
