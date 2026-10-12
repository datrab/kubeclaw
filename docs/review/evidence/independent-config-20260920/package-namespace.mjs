import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { loadWorkerConfig } from '../../../../skills/prism/server/worker-config.ts';
const root=process.cwd();const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'independent-package-'));
try {
 execFileSync('helm',['package',path.join(root,'charts/prism'),'--destination',tmp],{stdio:'pipe'});
 const archive=path.join(tmp,fs.readdirSync(tmp).find(n=>n.endsWith('.tgz')));
 for(const namespace of ['default','review-isolated']) {
  const docs=yaml.loadAll(execFileSync('helm',['template','review',archive,'--namespace',namespace,'-f',path.join(root,'charts/prism/ci-values.yaml'),'--set',`worker.native.namespace=${namespace}`],{encoding:'utf8'})).filter(Boolean);
  const cm=docs.find(d=>d.kind==='ConfigMap'&&d.metadata.name==='prism-swarm-config');
  const dep=docs.find(d=>d.kind==='Deployment'&&d.metadata.name==='prism-worker');
  assert.equal(cm.metadata.namespace??namespace,dep.metadata.namespace??namespace);
  assert.equal(dep.spec.template.spec.volumes.find(v=>v.name==='swarm-config').configMap.name,cm.metadata.name);
  const file=path.join(tmp,'mounted.json');fs.writeFileSync(file,cm.data['swarm.config.json']);
  const actual=loadWorkerConfig({SWARM_CONFIG:file,WORKER_TRUST_SPIFFE_ENABLED:'true',PRISM_TRUSTED_CONTROL_SPIFFE_ID:'spiffe://review/control'});
  const authored=JSON.parse(fs.readFileSync('charts/kubeclaw/files/config/swarm.config.json')).operator.prism.worker;
  assert.equal(actual.shutdownTimeoutMs,authored.shutdownTimeoutMs);
  for(const key of Object.keys(authored).filter(k=>k!=='shutdownTimeoutMs'))assert.equal(actual.ingress[key],authored[key]);
  console.log(JSON.stringify({namespace,configMap:cm.metadata.name,settings:authored,packageToRuntime:true}));
 }
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
