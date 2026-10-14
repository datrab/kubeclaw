// Finite task-local pure JSON/schema checks, not a production loader or generic validator.
// Reviewed safety: only builtin fs/crypto plus existing Ajv; reads fixed evidence
// JSON files and named pinned input sources, no imports or calls to source modules.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../../../package.json',import.meta.url));
const Ajv=require('/home/node/.openclaw/workspace/kubeclaw-config-c0/node_modules/ajv/dist/2020.js');
const formats=require('/home/node/.openclaw/workspace/kubeclaw-config-c0/node_modules/ajv-formats');
const directory=new URL('.',import.meta.url), root='/home/node/.openclaw/workspace/kubeclaw-config-c0/';
const read=name=>JSON.parse(fs.readFileSync(new URL(name,directory),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const assert=(condition,reason)=>{if(!condition)throw Error(reason);};
const schema=read('receiving-projections.schema.json');
const ajv=new Ajv({strict:true,allErrors:true});formats(ajv);
const safe=9007199254740991;
const receipt=read('original-records.json');assert(receipt.rows.length===4&&receipt.cases.length===8,'original counts');
for(const row of receipt.rows){const source=JSON.parse(fs.readFileSync(root+row.source.path,'utf8'));let current=source;for(const part of row.pointer.split('/').slice(1))current=current[part.replace(/~1/g,'/').replace(/~0/g,'~')];assert(JSON.stringify(current)===JSON.stringify(row.body),'original body conserved');assert(JSON.stringify(source.currentProviderFieldAdoption)===JSON.stringify(receipt.currentProviderFieldAdoption),'root22 metadata preserved');}
const contracts=read('contracts.json');assert(contracts.contracts.length===4&&!contracts.globalC0Accepted&&!contracts.implementationAuthorization,'four bounded contracts');
const cases=read('future-case-contracts.json');assert(cases.count===8&&cases.cases.every(x=>x.status==='not-run'&&x.requirementsUnchanged),'notrun original cases');
let checks=0;
for(const [name,example] of Object.entries({outboxLimits:{maximumRecords:10,maximumBytes:50000},blobLimits:{maximumBytes:8,maximumTotalBytes:16},quantityProjection:{requestedStorage:'.'+'0'.repeat(55)+'1e64',originalMaximumClaimBytes:'100000000',originalMaximumTotalBytes:'200000000'}})){
 const validate=ajv.compile({...schema,$id:schema.$id+'/'+name,$ref:'#/$defs/'+name});assert(validate(example),name+JSON.stringify(validate.errors));checks++;
 for(const changed of [{...example,unknown:true},Object.fromEntries(Object.entries(example).slice(1))]){assert(!validate(changed),name+' must reject');checks++;}
}
const observed={status:'observed',value:0,source:'native-owned-scope',coverage:'complete'};
const measurement={state:'observed',originalEnvelopeDigest:'sha256:'+'a'.repeat(64),originalClaimDigest:'sha256:'+'b'.repeat(64),originalSourceDigest:'sha256:'+'c'.repeat(64),phase:'closed',scope:'native-owned-scope',cpuTimeMs:observed,maximumMemoryBytes:observed,maximumProcesses:observed,originalPolicyDigest:'sha256:'+'d'.repeat(64),originalAttemptId:'synthetic-shape-only',originalClaimDeadline:'2026-10-14T00:00:00Z',sourceIdentity:{sourceDigest:'sha256:'+'e'.repeat(64),issuerRef:'synthetic-shape-only-not-attestation',scopeIdentity:'synthetic-shape-only'},processIdentity:{bootId:'synthetic-shape-only',pid:1,startTicks:0},clockTicksPerSecond:null};
const validate=ajv.compile({...schema,$id:schema.$id+'/measurementProjection',$ref:'#/$defs/measurementProjection'});assert(validate(measurement),JSON.stringify(validate.errors));checks++;
for(const invalid of [{...measurement,cpuTimeMs:{...observed,value:-1}},{...measurement,cpuTimeMs:{status:'unavailable',value:0,reason:'missing'}},{...measurement,unknown:true}]){assert(!validate(invalid),'measurement rejects invalid shape');checks++;}
for(const item of read('input-identities.json').inputs)assert(hash(root+item.path)===item.sha256&&item.sha256===item.endSha256,'input/end pin:'+item.path);
for(const item of read('source-witnesses.json').witnesses){assert(hash(root+item.path)===item.sha256,'source pin');assert(fs.readFileSync(root+item.path,'utf8').split('\n')[item.line-1]===item.expression,'exact line');}
console.log(JSON.stringify({shapeControls:checks,originalRows:4,originalCases:8,sourcePins:read('source-witnesses.json').witnesses.length,inputEndPins:read('input-identities.json').inputs.length,node:process.version,maximumBufferLength:require('node:buffer').constants.MAX_LENGTH,meaning:'Synthetic JSON shape/conservation only; no authentic measurements, semantic crossfield binding, future source helpers, native or productive acceptance',executedFutureCases:0}));
