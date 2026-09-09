import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {SecurityScanCapabilityInvoker} from '../../../skills/buster/engine/test-gates/security-scan-runtime.ts';

const digest=(value:Buffer)=>'sha256:'+createHash('sha256').update(value).digest('hex');
test('original scanner and pinned native Trivy pull an authenticated TLS OCI image with scoped Docker credentials',async()=>{
 const binary=process.env.REGISTRY_TRIVY_BINARY;const databases=process.env.REGISTRY_TRIVY_CACHE;
 assert.ok(binary&&databases,'REGISTRY_TRIVY_BINARY and REGISTRY_TRIVY_CACHE require actual pinned executable and real downloaded databases');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'registry-native-'));let server:https.Server|undefined;
 try{
  const key=path.join(root,'key.pem'),cert=path.join(root,'cert.pem'),cache=path.join(root,'cache');fs.mkdirSync(cache);
  for(const database of ['db','java-db'])fs.cpSync(path.join(databases,database),path.join(cache,database),{recursive:true});
  const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
  const config=Buffer.from(JSON.stringify({architecture:'amd64',os:'linux',config:{},rootfs:{type:'layers',diff_ids:[]},history:[]}));
  const manifest=Buffer.from(JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:{mediaType:'application/vnd.oci.image.config.v1+json',digest:digest(config),size:config.length},layers:[]}));
  const requests:Array<{path:string;authorized:boolean}>=[];
  server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
   const authorized=req.headers.authorization==='Basic '+Buffer.from('reader:native-local-test').toString('base64');requests.push({path:req.url!,authorized});
   if(!authorized){res.writeHead(401,{'www-authenticate':'Basic realm="local-registry"'});res.end('{}');return;}
   if(req.url==='/v2/'){res.writeHead(200);res.end('{}');return;}
   const content=req.url?.includes('/manifests/')?manifest:req.url?.endsWith(digest(config))?config:undefined;
   if(!content){res.writeHead(404);res.end('{}');return;}
   res.writeHead(200,{'content-type':content===manifest?'application/vnd.oci.image.manifest.v1+json':'application/vnd.oci.image.config.v1+json','content-length':content.length,'docker-content-digest':digest(content)});res.end(req.method==='HEAD'?undefined:content);
  });
  await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  const host=`127.0.0.1:${(server.address() as {port:number}).port}`;const image=`${host}/kubeclaw/native@${digest(manifest)}`;
  const scanner=(registryReference=host,password='native-local-test')=>new SecurityScanCapabilityInvoker({workspaceRoot:root,trivyExecutable:binary,cacheDirectory:cache,allowedRegistryPrefixes:[`${host}/kubeclaw`],maximumExecutionMs:60000,maximumOutputBytes:4*1024*1024,registryAccess:{registryReference,username:'reader',password,caFile:cert}});
  const request={operation:'image',payload:{image,digest:digest(manifest),timeoutMs:60000}};
  const lab=new SecurityScanCapabilityInvoker({workspaceRoot:root,trivyExecutable:binary,cacheDirectory:cache,allowedRegistryPrefixes:[`${host}/kubeclaw`],maximumExecutionMs:60000,maximumOutputBytes:4*1024*1024,unsupportedHttpRegistry:host});
  await assert.rejects(lab.invoke('security.scan',request,new AbortController().signal),/SECURITY_SCAN_HTTP_LAB_UNSUPPORTED/u);assert.equal(requests.length,0);
  const result=await scanner().invoke('security.scan',request,new AbortController().signal);
  assert.equal(result.operation,'image');assert.ok(result.databaseEvidence);assert.ok(requests.some(item=>item.authorized&&item.path.includes('/manifests/')));assert.ok(requests.some(item=>item.authorized&&item.path.includes('/blobs/')));
  assert.equal(fs.readdirSync(cache).some(name=>name.startsWith('.registry-auth-')),false);
  requests.length=0;
  await assert.rejects(scanner(host,'wrong').invoke('security.scan',request,new AbortController().signal));
  assert.ok(requests.some(item=>!item.authorized));assert.equal(fs.readdirSync(cache).some(name=>name.startsWith('.registry-auth-')),false);
  requests.length=0;
  await assert.rejects(scanner('other.example.test').invoke('security.scan',request,new AbortController().signal));
  assert.equal(requests.some(item=>item.authorized),false,'foreign registry scope cannot receive credentials');
 }finally{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}fs.rmSync(root,{recursive:true,force:true});}
});
