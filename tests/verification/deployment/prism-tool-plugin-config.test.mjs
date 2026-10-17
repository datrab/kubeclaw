import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import yaml from 'js-yaml';
import register from '../../../skills/prism/openclaw-plugin/index.mjs';
import {prismAgentBridgeProjection} from '../../../scripts/generate-prism-chart-config.mjs';

// Render the complete normally packaged chart, not a hand-selected template closure.
// Local Helm/HTTP proof only; installed gateway/native acceptance remains separate.
test('central A/B selection renders actual gateway plugin startup policy and reaches HTTP without per-call authors', async t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'prism-tool-delivery-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const author=path.join(root,'config'),chart=path.join(root,'chart');
 fs.cpSync('config',author,{recursive:true});fs.cpSync('charts/kubeclaw',chart,{recursive:true,dereference:true});
 const packaged=path.join(root,'packaged');fs.mkdirSync(packaged);
 const gatewayValues=yaml.load(fs.readFileSync('my-values/prism-agent-values.yaml','utf8'));
 assert(!(gatewayValues.extraEnv??[]).some(variable=>variable.name==='PRISM_CONTROL_URL'));
 const calls=[], registered=[], selectedConfigs=[];let originalA;const servers=new Map();
 const render=(projection,namespace='kubeclaw')=>{
  fs.writeFileSync(path.join(chart,'files/pipeline/prism-agent-tools.json'),JSON.stringify({...projection.deployment,...projection.toolPlugin}));
  execFileSync('helm',['package',chart,'--destination',packaged],{stdio:'pipe'});
  const archives=fs.readdirSync(packaged).filter(file=>file.endsWith('.tgz'));assert.equal(archives.length,1);
  const output=execFileSync('helm',['template',projection.deployment.releaseName,path.join(packaged,archives[0]),'--namespace',namespace,'-f','my-values/prism-agent-values.yaml'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const docs=yaml.loadAll(output);
  const deployment=docs.find(doc=>doc?.kind==='Deployment'&&doc.metadata.name===projection.deployment.releaseName);assert.ok(deployment,'whole chart retains its actual workload');
  const bridge=deployment.spec.template.spec.containers.find(container=>container.name==='prism-agent-bridge');assert.ok(bridge);
  assert.deepEqual(bridge.command,['node','/app/prism/skills/packages/prism-engine/server/agent-bridge-entry.mjs']);
  assert.equal(bridge.readinessProbe.httpGet.port,projection.settings.port);assert.equal(bridge.livenessProbe.httpGet.port,projection.settings.port);
  assert(!docs.some(doc=>doc?.data?.['swarm.config.json']));
  const configMap=docs.find(doc=>doc?.kind==='ConfigMap'&&doc.data?.['openclaw.json']);assert.ok(configMap);
  return JSON.parse(configMap.data['openclaw.json']).plugins.entries['kubeclaw-prism'].config;
 };
 for(const name of ['A','B']){
  const server=createServer((request,response)=>{calls.push({selected:name,path:request.url});response.setHeader('content-type','application/json');response.end(JSON.stringify({selected:name}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));servers.set(name,server);
 }
 for(const name of ['A','B','restored-A']){
  const server=servers.get(name==='restored-A'?'A':name);
  const file=path.join(author,'components/prism-control.config.json'),doc=JSON.parse(fs.readFileSync(file));
  for(const profile of Object.values(doc.profiles))profile.settings.agentToolControlUrl=`http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(file,name==='restored-A'?originalA:JSON.stringify(doc));if(name==='A')originalA=fs.readFileSync(file);
  const projection=prismAgentBridgeProjection(author);
  const pluginConfig=render(projection);assert.deepEqual(pluginConfig,projection.toolPlugin);selectedConfigs.push(pluginConfig);
  const tools=[];register({pluginConfig,registerTool(tool){tools.push(tool);}});registered.push(tools);
  assert.throws(()=>render(projection,'other-namespace'),/release identity/);
 }
 assert.notDeepEqual(selectedConfigs[0],selectedConfigs[1]);assert.deepEqual(selectedConfigs[2],selectedConfigs[0]);
 for(const [index,name] of [[0,'A'],[1,'B'],[0,'A'],[2,'A']])for(const tool of registered[index])assert.equal((await tool.execute('tool',{}, {config:{controlUrl:'http://127.0.0.1:1'}})).details.selected,name);
 assert.deepEqual(calls,[...['A','B','A','A'].flatMap(selected=>[{selected,path:'/v1/agent/design-sets'},{selected,path:'/v1/agent/revisions'}])]);
 const file=path.join(author,'components/prism-control.config.json'),doc=JSON.parse(fs.readFileSync(file));delete doc.profiles.standard.settings.agentToolControlUrl;fs.writeFileSync(file,JSON.stringify(doc));
 assert.throws(()=>prismAgentBridgeProjection(author),/SWARM_CONFIG/);
});
