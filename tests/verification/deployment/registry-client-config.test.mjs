import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseAllDocuments} from 'yaml';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import https from 'node:https';
import {spawn,spawnSync} from 'node:child_process';
import {registryClientConfig,writeRegistryClients} from '../../../scripts/registry-client-config.mjs';

const auth={usernameEnvironmentVariable:'REGISTRY_TEST_USER',passwordEnvironmentVariable:'REGISTRY_TEST_PASSWORD'};
const environment={REGISTRY_TEST_USER:'builder',REGISTRY_TEST_PASSWORD:'local-test-only'};
const secure=()=>({schemaVersion:'registry-clients.v1',registry:{endpoint:'https://registry.example.test:5443',transport:'https',auth}});
test('one explicit registry contract produces aligned BuildKit, runtime and node clients',()=>{
 const input=secure();input.dockerHubMirror={endpoint:'http://mirror.example.test:5000',transport:'http-lab'};
 const result=registryClientConfig(input,environment);
 assert.equal(result.runtime.registryBaseUrl,input.registry.endpoint);assert.equal(result.runtime.registryReference,'registry.example.test:5443');
 assert.match(result.buildkit,/\[registry\."docker.io"\]\n  mirrors = \["mirror.example.test:5000"\]/u);
 assert.doesNotMatch(result.buildkit,/insecure|password|local-test-only/u);
 assert.deepEqual(result.node.mirrors['docker.io'].endpoint,[input.dockerHubMirror.endpoint]);
 assert.equal(result.node.configs[result.runtime.registryReference].auth.password,environment.REGISTRY_TEST_PASSWORD);
 assert.equal(result.node.mirrors['ghcr.io'],undefined);
});
test('missing transport, URL mismatches, plaintext credentials and incomplete trust fail explicitly',()=>{
 for(const input of [{}, {...secure(),registry:{endpoint:'http://registry.example.test:5000',transport:'https',auth}}, {...secure(),registry:{endpoint:'http://registry.example.test:5000',transport:'http-lab',auth}}, {...secure(),registry:{...secure().registry,caFile:'/a/ca.crt'}}, {...secure(),registry:{...secure().registry,endpoint:'https://user:secret@registry.example.test'}}])assert.throws(()=>registryClientConfig(input,environment));
 assert.throws(()=>registryClientConfig(secure(),{}),/missing or empty/u);
 for(const input of [{...secure(),dockerHubMiror:{}},{...secure(),registry:{...secure().registry,transprot:'https'}},{...secure(),registry:{...secure().registry,auth:{...auth,passwordEnvironmentVariabl:'BAD'}}},{...secure(),dockerHubMirror:{}},{...secure(),dockerHubMirror:{endpoint:'',transport:'https'}},{...secure(),dockerHubMirror:{endpoint:'',transport:'',caFile:'/tmp/ca'}},{...secure(),dockerHubMirror:{endpoint:'',transport:'',unexpected:true}}])assert.throws(()=>registryClientConfig(input,environment));
 assert.doesNotThrow(()=>registryClientConfig({...secure(),dockerHubMirror:{endpoint:'',transport:''}},environment));
 const lab=registryClientConfig({schemaVersion:'registry-clients.v1',registry:{endpoint:'http://registry.example.test:5000',transport:'http-lab'}});
 assert.match(lab.buildkit,/http = true/u);assert.deepEqual(lab.node.configs,{});
});
test('generator writes node credentials privately, never overwrites existing host configuration',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'registry-clients-'));try{
 const file=path.join(root,'node.json');writeRegistryClients(secure(),environment,{node:file});assert.equal(fs.statSync(file).mode&0o777,0o600);
 assert.throws(()=>writeRegistryClients(secure(),environment,{node:file}),/EEXIST/u);
 const relocated=path.join(root,'generator.mjs');fs.copyFileSync('scripts/registry-client-config.mjs',relocated);
 const input=path.join(root,'input.json'),output=path.join(root,'relocated-node.json');fs.writeFileSync(input,JSON.stringify(secure()));
 const child=spawnSync(process.execPath,[relocated,input,'node',output],{env:{...process.env,...environment},encoding:'utf8'});assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(output)),JSON.parse(fs.readFileSync(file)));assert.equal(fs.statSync(output).mode&0o777,0o600);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
function helm(args){return spawnSync('helm',['template','registry-test','charts/kubeclaw',...args],{encoding:'utf8'});}
test('real Helm wires exactly the selected sidecar and refuses missing/duplicate/contradictory configuration',()=>{
 assert.equal(helm([]).status,0);
 const base=['-f','my-values/buster-values.yaml'];assert.notEqual(helm(base).status,0);
 const configured=[...base,'--set','runtimeInfrastructure.registry.endpoint=https://registry.example.test:5443','--set','runtimeInfrastructure.registry.transport=https','--set','runtimeInfrastructure.registry.authSecretName=registry-auth'];
 const result=helm(configured);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/KUBECLAW_REGISTRY_CONFIG/u);assert.match(result.stdout,/name: registry-auth/u);
 assert.doesNotMatch(result.stdout,/KUBECLAW_LOCAL_REGISTRY/u);
 assert.notEqual(helm([...configured,'--set','extraContainers[0].name=misspelled-runtime']).status,0);
 assert.notEqual(helm([...configured,'--set','extraContainers[1].name=buster-v2-runtime']).status,0);
 assert.notEqual(helm([...configured,'--set','runtimeInfrastructure.registry.transport=http-lab']).status,0);
 assert.notEqual(helm([...configured,'--set','runtimeInfrastructure.dockerHubMiror.endpoint=https://mirror.example.test']).status,0);
 assert.notEqual(helm([...configured,'--set','runtimeInfrastructure.dockerHubMirror.transport=https']).status,0);
 const trusted=helm([...configured,'--set','runtimeInfrastructure.registry.caSecretName=registry-ca','--set','runtimeInfrastructure.registry.nodeCaFile=/etc/registry/ca.crt']);assert.equal(trusted.status,0,trusted.stderr);
 const deployment=parseAllDocuments(trusted.stdout).map(doc=>doc.toJSON()).find(doc=>doc?.kind==='Deployment'&&doc.spec.template.spec.containers.some(container=>container.name==='buster-v2-runtime'));
 const pod=deployment.spec.template.spec,worker=pod.containers.find(container=>container.name==='buster-v2-runtime');
 assert.equal(worker.env.find(item=>item.name==='NODE_EXTRA_CA_CERTS').value,'/var/run/kubeclaw-registry-trust/ca.crt');assert.ok(worker.volumeMounts.some(item=>item.mountPath==='/var/run/kubeclaw-registry-trust'&&item.readOnly));assert.ok(pod.volumes.some(item=>item.secret?.secretName==='registry-ca'));
 assert.ok(pod.containers.filter(container=>container!==worker).every(container=>!container.env?.some(item=>item.name==='KUBECLAW_REGISTRY_PASSWORD')));
});
test('original container-build manifest consumer verifies generated HTTPS origin, CA and scoped credentials',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'registry-tls-'));let server;try{
 const key=path.join(root,'key.pem'),cert=path.join(root,'cert.pem');
 const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
 const manifest='{}';const digest='sha256:'+createHash('sha256').update(manifest).digest('hex');
 server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{res.writeHead(req.headers.authorization==='Basic '+Buffer.from('builder:local-test-only').toString('base64')?200:401);res.end(manifest);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const input=secure();input.registry={...input.registry,endpoint:`https://127.0.0.1:${server.address().port}`,caFile:cert,nodeCaFile:cert};
 const runtime=path.join(root,'runtime.json');writeRegistryClients(input,environment,{runtime});
 const consumer=pathToFileURL(path.resolve('skills/buster/engine/test-gates/container-build-runtime.ts')).href;
 const code=`const {verifyContainerManifest}=await import(${JSON.stringify(consumer)});const r=JSON.parse((await import('node:fs')).readFileSync(process.argv[1]));try{await verifyContainerManifest({maximumManifestBytes:1024,...(process.argv[2]?{registryUsername:'builder',registryPassword:'local-test-only'}:{})},new URL(r.registryBaseUrl),'kubeclaw/test',${JSON.stringify(digest)},AbortSignal.timeout(5000));console.log('verified')}catch(error){console.log(error.message);process.exitCode=9}`;
 const fetchChild=(trusted,authorization)=>new Promise(resolve=>{const child=spawn(process.execPath,['--input-type=module','-e',code,runtime,authorization],{env:{...process.env,NODE_EXTRA_CA_CERTS:trusted?cert:''},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.on('close',status=>resolve({status,output}));});
 assert.equal((await fetchChild(false,'')).status,9);assert.match((await fetchChild(true,'')).output,/REGISTRY_READ_FAILED:401/u);
 assert.equal((await fetchChild(true,'Basic '+Buffer.from('builder:local-test-only').toString('base64'))).output.trim(),'verified');
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}fs.rmSync(root,{recursive:true,force:true});}
});
