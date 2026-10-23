// Evaluate ONLY the current JSON author expressions with synthetic bound inputs.
// No productive file writes/imports, native startup, registry calls or credentials.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const out=__dirname,repo=path.resolve(out,'../../../../..'),source=fs.readFileSync(path.join(repo,'docker/buster-runtime-entrypoint.sh'),'utf8');
const block=source.split("node <<'NODE'\n")[1].split('\nNODE\n')[0];
const observations=[];
for(const profile of ['A','B']){
 const generated={},fixture=profile.toLowerCase();
 const registry={registryBaseUrl:`https://registry-${fixture}.delivery.invalid:443`,registryReference:`registry-${fixture}.delivery.invalid:443`,registryUsernameEnvironmentVariable:'DLV_REGISTRY_USERNAME',registryPasswordEnvironmentVariable:'DLV_REGISTRY_PASSWORD',registryCaFile:`/fixtures/${fixture}/registry-ca.crt`};
 const env={RUNTIME_CONFIG_ROOT:'/run/kubeclaw-buster/config',REGISTRY_REFERENCE:registry.registryReference,REGISTRY_CLIENT_RUNTIME:`/fixtures/${fixture}/registry.json`,CONTROLLER_NAMESPACE:`dlv-${fixture}`,BUSTER_PLAN_PORT:profile==='A'?'18891':'18892',BUSTER_TRUSTED_PEER_SPIFFE_ID:`spiffe://delivery.invalid/ns/dlv-${fixture}/sa/nova`,BUSTER_PLAN_TRUSTED_SOURCE_AUTHORITY:`nova:delivery-${fixture}`,BUSTER_V2_STATE_DIR:'/var/lib/buster-v2/plan-jobs',BUSTER_V2_RUN_DIR:'/var/lib/buster-v2/runs',BUILDKIT_HOST:`unix:///fixtures/${fixture}/buildkit.sock`,BUSTER_NETWORK_HTTP_EXACT_ORIGINS:`https://http-${fixture}.delivery.invalid`,BUSTER_BROWSER_AXE_EXACT_ORIGINS:`http://browser-${fixture}.delivery.invalid:18080`,BUSTER_NETWORK_HTTP_ALLOW_WEBSOCKET:'false',BUSTER_BROWSER_PLAYWRIGHT_CGROUP_ROOT:`/fixtures/${fixture}/delegated-cgroup`};
 const fakeFs={readFileSync(file){if(file!==env.REGISTRY_CLIENT_RUNTIME)throw Error('Unexpected read:'+file);return JSON.stringify(registry);},writeFileSync(file,data){generated[path.basename(file)]=JSON.parse(data);}};
 vm.runInNewContext(block,{process:{env},require(name){if(name==='fs')return fakeFs;if(name==='path')return path;if(name==='/app/node_modules/playwright')return {chromium:{executablePath:()=>'/ms-playwright/selected-chromium/chrome'}};throw Error('Unexpected import:'+name)}},{timeout:1000});
 if(profile==='B'){
  const runtime=generated['runtime.json'];
  for(const [key,value] of Object.entries(runtime)){if(key.startsWith('maximum')&&typeof value==='number')runtime[key]=Math.floor(value/2);}
  for(const section of ['directCommand','containerBuild','networkHttp','browserAxe','browserVisual','browserLighthouse','browserPlaywright','securityScan'])for(const [key,value] of Object.entries(runtime[section]))if((key.startsWith('maximum')||key==='terminationGraceMs')&&typeof value==='number')runtime[section][key]=Math.floor(value/2);
  runtime.securityScan.databasePolicy={maximumVulnerabilityAgeMs:86400000,maximumJavaAgeMs:259200000,maximumDatabaseBytes:4294967296};
  generated['platform.json'].effectLockTtlMs=600000; // schema-only unused effect witness
 }
 const files={};for(const [name,value] of Object.entries(generated)){const relative=`buster-definition-profiles-bce3f075/${profile}/${name}`,dest=path.join(out,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(value,null,2)+'\n');files[relative]=crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');}
 observations.push({profile,syntheticEnvironmentBindings:env,files,prerequisites:'Native fixed config/state/run roots retained. Config root ancestors rootowned/no groupworldwrite; runtime file rootowned regular NOFOLLOW,nlink1,bounded bytes. Exact ed25519 key/native pool launcher/runtime+engine identity required. Real isolated native fixture must provision executable/browser/package/CA/public signature key/registry/controller grants/cgroup/state roots and identities. No fixture exists or worker executed here. A/B are complete definition JSON witnesses, not validated native profiles.',limit:'Current author-expression evaluation with no productive imports/effects; B subsequent bounded policy variant, protocol and actual identity bindings retained.'});
}
fs.writeFileSync(path.join(out,'buster-definition-profiles-bce3f075.json'),JSON.stringify({sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),method:'current JSON author expressions evaluated in synthetic no-effect VM only; no native/runtime acceptance',profiles:observations},null,2)+'\n');
console.log('Materialized complete A/B Buster definition JSON only; native prerequisites remain unrun.');
