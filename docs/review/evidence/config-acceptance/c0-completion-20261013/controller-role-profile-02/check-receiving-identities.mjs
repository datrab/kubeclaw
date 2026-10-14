import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import Ajv2020 from '../../../../../..//node_modules/ajv/dist/2020.js';
const root='/home/node/.openclaw/workspace/kubeclaw-config-c0';
const base=path.dirname(new URL(import.meta.url).pathname);
const old=base.replace(/02$/,'01');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const pointer=(o,p)=>{if(typeof p!=='string'||!p.startsWith('/'))throw Error('missing pointer');for(const k of p.slice(1).split('/')){const n=k.replaceAll('~1','/').replaceAll('~0','~');if(o===null||!Object.hasOwn(o,n))throw Error('unresolved pointer');o=o[n];}return o;};
function inspect(map,allowLegacyListener=false){
 const results=[];
 for(const row of map.fields)for(const role of ['A','B']){
  const r=row.receivingProjection;const errors=[];let actual;
  const file=r[`profileFile${role}`]||(allowLegacyListener?path.relative(root,path.join(old,'profiles',role+'.json')):null);
  try{
   if(!file||!r[`sha256${role}`])errors.push('missing declared physical file/refSHA');
   if(file){const full=path.join(root,file);if(r[`sha256${role}`]&&sha(full)!==r[`sha256${role}`])errors.push('profile SHA mismatch');actual=pointer(read(full),r.pointer||r.profilePointer);if(!isDeepStrictEqual(actual,r[`typed${role}`]))errors.push('declared typed value differs from complete physical node');}
   if(!r.schemaFile||sha(path.join(root,r.schemaFile))!==r.schemaSha256)errors.push('schema SHA mismatch');
  }catch(e){errors.push(e.message);}
  results.push({id:row.id,profile:role,file,pointer:r.pointer||r.profilePointer,declared:r[`typed${role}`],actual,errors});
 }
 return results;
}
const mode=process.argv[2]||'corrected';
const input=mode==='prior'?path.join(old,'original49-field-contracts.json'):path.join(base,'original49-field-contracts.json');
const map=read(input);const nodes=inspect(map,mode==='prior');
const observations=[];const check=(name,value,details)=>observations.push({name,pass:!!value,details});
if(mode!=='prior'){
 check('all original49 receiver identities explicit and 98 nodes exact',nodes.length===98&&nodes.every(n=>!n.errors.length));
 for(const row of map.fields)for(const role of ['A','B']){
  const mutant=structuredClone(map);mutant.fields.find(r=>r.id===row.id).receivingProjection[`typed${role}`]={quietMiss:true};
  check(`negative altered node ${row.id}/${role}`,inspect(mutant).some(n=>n.id===row.id&&n.profile===role&&n.errors.includes('declared typed value differs from complete physical node')));
 }
 for(const kind of ['sha','pointer']){const mutant=structuredClone(map);if(kind==='sha')mutant.fields[0].receivingProjection.sha256A='0'.repeat(64);else mutant.fields[0].receivingProjection.pointer='/nonexistent';check(`negative ${kind}`,inspect(mutant).some(n=>n.errors.length));}
 const producer=map.fields.find(r=>r.id.endsWith('BUSTER-READY-PRODUCER'));const mutant=structuredClone(map);delete mutant.fields.find(r=>r.id===producer.id).receivingProjection.typedA.port;check('negative stale producer whole-node missing port',inspect(mutant).some(n=>n.id===producer.id&&n.profile==='A'&&n.errors.length));
 const A=read(path.join(old,'profiles/A.json'));const contrast=read(path.join(old,'profiles/Ready-port-contrast.json'));const normalized=structuredClone(contrast);normalized.profileId=A.profileId;normalized.settings.busterNamespaceBroker.controller.readiness.port=8443;
 check('complete 8444 contrast changes only selected profileId/one same Chart S policy',contrast.settings.busterNamespaceBroker.controller.readiness.port===8444&&isDeepStrictEqual(normalized,A));
 const off=read(path.join(old,'profiles/role-off.json'));const readyOff=read(path.join(old,'profiles/ready-product-off.json'));
 check('broker-off controller omitted',off.settings.busterNamespaceBroker.enabled===false&&!Object.hasOwn(off.settings.busterNamespaceBroker,'controller'));
 check('Ready-off port and TLS omitted/Product false',isDeepStrictEqual(readyOff.settings.busterNamespaceBroker.controller.readiness,{enabled:false})&&readyOff.readonlyBindings.product.enabled===false);
 const source=fs.readFileSync(path.join(root,'cmd/buster-namespace-controller/main.go'),'utf8');
 const start=source.indexOf('if err := kubeResponseError(resp.StatusCode, responseBody); err != nil {');const decode=source.indexOf('return json.Unmarshal(responseBody, out)',start);const outNil=source.indexOf('if out == nil || len(responseBody) == 0',start);
 check('source actual error-first branch precedes out=nil and typed decode',start>=0&&outNil>start&&decode>outNil&&source.slice(start,outNil).includes('return err')&&source.includes('return &apiError{statusCode: statusCode, message: message}'));
 const schema=read(path.join(base,'deployment-binding-fragment.schema.json'));const ajv=new Ajv2020({strict:true,allErrors:true,coerceTypes:false,useDefaults:false});const validate=ajv.compile(schema);
 for(const p of ['A','B'])check(`proposal-only closed ABI fragment ${p}`,validate(read(path.join(base,`deployment-binding-fragment-${p}.json`))));
 for(const kind of ['old-version','missing-profile','unknown-writer']){const f=read(path.join(base,'deployment-binding-fragment-A.json'));if(kind==='old-version')f.schemaVersion='pipeline-entry.v5';if(kind==='missing-profile')delete f.deploymentBindings.kubeclaw.profile;if(kind==='unknown-writer')f.deploymentBindings.kubeclaw.producer='private';check(`negative ABI ${kind}`,!validate(f));}
 const provider=read(path.join(root,'docs/review/evidence/config-acceptance/c0-completion-20261013/runtime-provider-contracts-03/schemas/pipeline-entry.schema.json'));const oldValidate=ajv.compile(provider);check('current closed v5 explicitly lacks deploymentBindings support',provider.properties.schemaVersion.const==='pipeline-entry.v5'&&!Object.hasOwn(provider.properties,'deploymentBindings')&&provider.additionalProperties===false&&!oldValidate(read(path.join(base,'deployment-binding-fragment-A.json'))));
 const c=read(path.join(base,'conservation.json'));check('unchanged49 original bodies/six original cases',c.fields.every(r=>r.originalBodyEqual&&r.priorContractOriginalEqual)&&c.cases.every(r=>r.originalBodyEqual));
 check('no field semantic acceptance inferred',map.fields.every(r=>r.semanticAccepted===false));
}
const failedNodes=nodes.filter(n=>n.errors.length);const failures=failedNodes.length+observations.filter(o=>!o.pass).length;
console.log(JSON.stringify({qualification:'Narrow physical receiver/schema/source identity evidence only, no Go/native/semantic/global PASS',mode,input,inputSha256:sha(input),scriptSha256:sha(new URL(import.meta.url).pathname),node:process.version,receivingNodes:nodes,observations,failedNodes:failedNodes.length,failedObservations:observations.filter(o=>!o.pass).length},null,2));
process.exitCode=failures?1:0;
