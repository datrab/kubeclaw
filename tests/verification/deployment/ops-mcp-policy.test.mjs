import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {execFileSync} from 'node:child_process';import yaml from 'js-yaml';
import {loadOpsMcpConfig} from '../../../tools/ops-mcp/src/config.mjs';
test('actual Ops Helm A/B delivers the sole captured MCP owner, ports, probes and restart identity',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ops-delivery-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const base=yaml.load(fs.readFileSync('charts/ops-pod/values.yaml','utf8'));const observed=[];
 for(const port of [8080,9080]){
  const value=structuredClone(base);value.codexImage='example/codex@sha256:'+'a'.repeat(64);value.mcpImage='example/mcp@sha256:'+'b'.repeat(64);value.networkPolicy.apiServerCIDRs=['127.0.0.1/32'];value.mcpPolicy.server.port=port;value.mcpPolicy.hubble.maxRawBytes=port;
  const values=path.join(dir,`values-${port}.yaml`);fs.writeFileSync(values,yaml.dump(value));const rendered=execFileSync('/usr/local/bin/helm',['template','ops','charts/ops-pod','--namespace','test','-f',values],{encoding:'utf8'});const docs=yaml.loadAll(rendered).filter(Boolean);
  const map=docs.find(d=>d.kind==='ConfigMap'&&d.metadata.name==='ops-mcp-policy');const file=path.join(dir,`policy-${port}.json`);fs.writeFileSync(file,map.data['policy.json']);const config=loadOpsMcpConfig({OPS_MCP_POLICY_FILE:file});const python=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'ops/pod');from runtime_policy import load_supervisor_policy;u,p=load_supervisor_policy(sys.argv[1]);print(json.dumps({'url':u,'policy':dict(p)}))",file],{encoding:'utf8'}));assert.equal(python.url,`http://127.0.0.1:${port}/mcp`);assert.deepEqual(python.policy,value.mcpPolicy.supervisor);assert.equal(config.port,port);assert.equal(config.hubble.maxRawBytes,port);assert.deepEqual(config.namespaces,value.rbac.namespaces);
  const sts=docs.find(d=>d.kind==='StatefulSet');const codex=sts.spec.template.spec.containers.find(c=>c.name==='codex');assert.deepEqual(codex.command,['python3','/opt/codex/policy-supervisor.py']);assert(codex.env.some(e=>e.name==='OPS_MCP_POLICY_FILE'));assert(codex.volumeMounts.some(v=>v.name==='mcp-policy'&&v.readOnly));const container=sts.spec.template.spec.containers.find(c=>c.name==='ops-mcp');assert.deepEqual(container.command,['node','src/policy-server.mjs']);assert(container.env.some(e=>e.name==='OPS_MCP_POLICY_FILE'));assert(!container.env.some(e=>['PORT','HOST','OPS_LOCAL_ONLY','OPS_DEFAULT_NAMESPACE','ARGOCD_NAMESPACE','OPS_ALLOWED_NAMESPACES'].includes(e.name)));assert(container.volumeMounts.some(v=>v.name==='mcp-policy'&&v.readOnly));assert(container.readinessProbe.exec.command.at(-1).includes(`:${port}/healthz`));assert.equal(docs.find(d=>d.kind==='Service').spec.ports[0].port,port);observed.push(sts.spec.template.metadata.annotations['checksum/mcp-policy']);
 }
 assert.notEqual(observed[0],observed[1]);
 const docker=fs.readFileSync('tools/ops-mcp/Dockerfile','utf8');assert(!/\n    (?:PORT|HOST|HUBBLE_BIN|HUBBLE_SERVER)=/.test(docker));assert.match(docker,/COPY src \.\/src/);
});
