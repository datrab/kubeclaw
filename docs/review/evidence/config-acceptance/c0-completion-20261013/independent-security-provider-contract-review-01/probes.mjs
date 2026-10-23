import fs from 'node:fs';import vm from 'node:vm';import Ajv2020 from 'ajv/dist/2020.js';import addFormats from 'ajv-formats';
import {testContract as headers} from '../../../../../../skills/buster/plugins/security-providers/src/headers.js';
const base='docs/review/evidence/config-acceptance/c0-completion-20261013/security-provider-contracts-01';
const out='docs/review/evidence/config-acceptance/c0-completion-20261013/independent-security-provider-contract-review-01';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));const owner=read(`${base}/config/plugins/kubeclaw.security-providers.config.json`),assoc=read(`${base}/native-resource-association.json`),manifest=read('skills/buster/plugins/security-providers/plugin.json'),decls=Object.fromEntries(manifest.testProviders.map(x=>[x.id,x]));
const ajv=new Ajv2020({strict:true,allowUnionTypes:true,allErrors:true,useDefaults:false,coerceTypes:false,removeAdditional:false});addFormats(ajv);const ov=ajv.compile(read(`${base}/schemas/kubeclaw.security-providers.schema.json`)),rv=ajv.compile(read(`${base}/schemas/pipeline-entry.schema.json`));
const source=fs.readFileSync(`${base}/check-definition.mjs`,'utf8');const context=vm.createContext({owner,assoc,decls});
const ss=source.indexOf('function semanticOwnerErrors('),se=source.indexOf("record('ALL-complete-profiles-semantic-relations'",ss),es=source.indexOf('function entryErrors('),ee=source.indexOf('for(const f of fs.readdirSync',es);
vm.runInContext(source.slice(ss,se)+'\n'+source.slice(es,ee)+'\nthis.ownerErrors=semanticOwnerErrors;this.rootErrors=entryErrors;',context);
const nativeSource=fs.readFileSync('skills/buster/engine/test-gates/network-http-runtime.ts','utf8');const ns=nativeSource.indexOf('function responseHeaderNames('),ne=nativeSource.indexOf('function exactPayload(',ns),denied=nativeSource.match(/const DENIED_HEADERS = new Set\([^;]+;/)[0];
const fn=nativeSource.slice(ns,ne).replace('value: unknown','value').replace(': readonly string[]','');const nc=vm.createContext({});vm.runInContext(denied+'\n'+fn+'\nthis.nativeResponseHeaderNames=responseHeaderNames;',nc);
const observations=[];const errorOf=f=>{try{f();return null;}catch(e){return e.message;}};
for(const variant of ['33-unique-headers','denied-response-header']){
 const mutated=structuredClone(owner),h=mutated.profiles.A.registrations.headers.processing;
 h.rules.add=variant==='33-unique-headers'?Array.from({length:29},(_,i)=>({id:`extra-${i}`,header:`x-extra-${i}`,severity:'low',kind:'present'})):[{id:'extra-response',header:'connection',severity:'low',kind:'present'}];
 const resolved=headers.rules(h.profile,h.rules),names=[...new Set(resolved.map(x=>x.header))];observations.push({check:variant,ownerSchemaAccepts:ov(mutated),authorSemanticErrors:context.ownerErrors(mutated),actualSourceRuleCount:resolved.length,uniqueRequestedHeaders:names.length,actualNativePureBoundary:errorOf(()=>nc.nativeResponseHeaderNames(names)),providerOrNativeInvoked:false});
}
const split=read(`${base}/config/pipeline.config.json`);split.pluginSelections.find(t=>t.registrationId==='kubeclaw.security-providers:image-trivy').serviceInstanceId='fixture.service.buster-preparation';
observations.push({check:'split-security-package-service-context',rootSchemaAccepts:rv(split),authorEntryErrors:context.rootErrors(split),securityServiceIds:[...new Set(split.pluginSelections.filter(t=>t.packageId===owner.packageId).map(t=>t.serviceInstanceId))],productiveSelectionExecuted:false});
fs.writeFileSync(`${out}/probe-observations.json`,JSON.stringify({qualification:'Specific read-only schema/current rule/native response-name and existing author finite-predicate probes only; no provider/native invoke/activation/network/API/credentials/browser/timer/Eval',node:process.version,observations},null,2)+'\n');console.log(JSON.stringify(observations));
