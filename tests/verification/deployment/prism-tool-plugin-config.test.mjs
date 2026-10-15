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

// Isolates the real gateway ConfigMap template because the full Kubeclaw chart's
// legacy Buster helper is still an OPEN migration. Not whole-chart acceptance.
test('central A/B selection renders actual gateway plugin startup policy and reaches HTTP without per-call authors', async t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'prism-tool-delivery-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const author=path.join(root,'config'),chart=path.join(root,'chart');
 fs.cpSync('config',author,{recursive:true});fs.mkdirSync(path.join(chart,'templates'),{recursive:true});fs.mkdirSync(path.join(chart,'files/pipeline'),{recursive:true});
 for(const file of ['Chart.yaml','values.yaml'])fs.copyFileSync(`charts/kubeclaw/${file}`,path.join(chart,file));
 // This focused renderer has no dependency workload templates.
 const metadata=yaml.load(fs.readFileSync(path.join(chart,'Chart.yaml'),'utf8'));delete metadata.dependencies;fs.writeFileSync(path.join(chart,'Chart.yaml'),yaml.dump(metadata));
 for(const file of ['_helpers.tpl','configmap-gateway.yaml'])fs.copyFileSync(`charts/kubeclaw/templates/${file}`,path.join(chart,'templates',file));
 const gatewayValues=yaml.load(fs.readFileSync('my-values/prism-agent-values.yaml','utf8'));
 assert(!(gatewayValues.extraEnv??[]).some(variable=>variable.name==='PRISM_CONTROL_URL'));
 const calls=[], registered=[];
 const render=(projection,namespace='kubeclaw')=>{
  fs.writeFileSync(path.join(chart,'files/pipeline/prism-agent-tools.json'),JSON.stringify({...projection.deployment,...projection.toolPlugin}));
  const output=execFileSync('helm',['template','agent-prism',chart,'--namespace',namespace,'-f','my-values/prism-agent-values.yaml'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const configMap=yaml.loadAll(output).find(doc=>doc?.kind==='ConfigMap');
  return JSON.parse(configMap.data['openclaw.json']).plugins.entries['kubeclaw-prism'].config;
 };
 for(const name of ['A','B']){
  const server=createServer((request,response)=>{calls.push(name);response.setHeader('content-type','application/json');response.end(JSON.stringify({selected:name}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const file=path.join(author,'components/prism-control.config.json'),doc=JSON.parse(fs.readFileSync(file));
  for(const profile of Object.values(doc.profiles))profile.settings.agentToolControlUrl=`http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(file,JSON.stringify(doc));
  const projection=prismAgentBridgeProjection(author);
  const pluginConfig=render(projection);assert.deepEqual(pluginConfig,projection.toolPlugin);
  const tools=[];register({pluginConfig,registerTool(tool){tools.push(tool);}});registered.push(tools);
  assert.throws(()=>render(projection,'other-namespace'),/release identity/);
 }
 for(const [index,name] of [[0,'A'],[1,'B'],[0,'A']])assert.equal((await registered[index][0].execute('tool',{}, {config:{controlUrl:'http://127.0.0.1:1'}})).details.selected,name);
 assert.deepEqual(calls,['A','B','A']);
 const file=path.join(author,'components/prism-control.config.json'),doc=JSON.parse(fs.readFileSync(file));delete doc.profiles.standard.settings.agentToolControlUrl;fs.writeFileSync(file,JSON.stringify(doc));
 assert.throws(()=>prismAgentBridgeProjection(author),/SWARM_CONFIG/);
});
