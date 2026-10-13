import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import Ajv2020 from 'ajv/dist/2020.js';
import {loadSwarmSettings} from '../../../../../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
const base='docs/review/evidence/config-acceptance/c0-completion-20261013',source=path.resolve(base,'c1-complete-profile-pairs-01'),out=path.resolve(base,'independent-c1-case-oracles/complete-pair-recheck-01');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const pairs=read(path.join(source,'pairs.json')),owners=Object.keys(pairs.pairs[0].ASelection),docs=Object.fromEntries(owners.map(o=>[o,read(path.join(source,'config/components',o+'.config.json'))]));
const ajv=new Ajv2020({strict:true,allErrors:true,useDefaults:false,removeAdditional:false,coerceTypes:false}),schemaResults=[];
for(const owner of owners){const p=path.join(base,'components/batch-15/schemas/C1',owner+'.schema.json');const v=ajv.compile(read(p));schemaResults.push({owner,source:p,sha256:sha(p),profiles:Object.keys(docs[owner].profiles).length,valid:v(docs[owner]),errors:v.errors});}
const root=fs.mkdtempSync(path.join(out,'current-wire-')),observations=[];
function frozen(v){return v===null||typeof v!=='object'||Object.isFrozen(v)&&Object.values(v).every(frozen);}
try {for(const pair of pairs.pairs){for(const side of ['A','B']){
 const dir=path.join(root,pair.caseId,side);fs.mkdirSync(dir,{recursive:true});const entry=read('charts/kubeclaw/files/config/swarm.config.json');const entryPath=path.join(dir,'swarm.config.json');fs.writeFileSync(entryPath,JSON.stringify(entry));
 for(const owner of owners){const settings=docs[owner].profiles[pair[side+'Selection'][owner]].settings;fs.writeFileSync(path.join(dir,owner+'.config.json'),JSON.stringify({schemaVersion:'swarm-component.v1',owner,settings}));}
 try {const value=loadSwarmSettings({SWARM_CONFIG:entryPath});if(value.identity.files.length!==7||!frozen(value))throw Error('file/freeze closure missing');observations.push({caseId:pair.caseId,side,result:'passed-current-value-definition-check',files:value.identity.files,recursiveFreeze:true});}
 catch(e){observations.push({caseId:pair.caseId,side,result:'failed',error:String(e)});}
}}}finally{fs.rmSync(root,{recursive:true,force:true});}
const result={qualification:'Independent C0 definition replay only: strict typed owner schemas and CURRENT v2/v1 config loader. No v3 runtime/native behavior accepted.',nodeVersion:process.version,argv:process.argv,ownerSchemaResults:schemaResults,declaredProfiles:schemaResults.reduce((n,r)=>n+r.profiles,0),currentWireObservations:observations,errors:observations.filter(r=>r.result==='failed'),futureImplementationResults:'not-run'};
fs.writeFileSync(path.join(out,'replay-observations.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({profiles:result.declaredProfiles,strictSchemas:schemaResults.length,schemaErrors:schemaResults.filter(r=>!r.valid),currentLoaderChecks:observations.length,errors:result.errors}));
