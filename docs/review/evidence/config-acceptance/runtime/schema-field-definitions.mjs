// C0 actual source-schema definition checks using the production registry compiler.
import fs from 'node:fs';import crypto from 'node:crypto';
import {validateReferencedSchema} from '../../../../../skills/common/plugin-runtime/foundation/registry/schema.ts';
const base='docs/review/evidence/config-acceptance/runtime/';const inv=JSON.parse(fs.readFileSync(base+'inventory-fragment.json'));
const rows=inv.rows.filter(r=>r.cases.includes('RT-C0-SCHEMA-DISCOVERY') || r.cases.includes(r.id+'-CURRENT-SCHEMA-FIELD'));const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const domainBaselinePath=base+'checkpoints/runtime-closure-input/inventory-fragment.json';const baselineDomains=new Map(JSON.parse(fs.readFileSync(domainBaselinePath)).rows.map(r=>[r.id,r.domain]));
const canonical='skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json';const documents=new Map();const compiled=new Map();
function doc(path){if(!documents.has(path))documents.set(path,JSON.parse(fs.readFileSync(path)));return documents.get(path);}
function pointer(root,value){if(value==='#')return root;if(!value.startsWith('#/'))throw Error('unsupported exact pointer '+value);return value.slice(2).split('/').reduce((node,k)=>{const key=k.replaceAll('~1','/').replaceAll('~0','~');if(node===null||typeof node!=='object'||!Object.hasOwn(node,key))throw Error('absent pointer '+value);return node[key];},root);}
const observations=[];
for(const row of rows){const path=row.source.path;let error=null,node,resolvedPath=path;
 try{const raw=fs.readFileSync(path);if(sha(raw)!==row.source.sha256)throw Error('owning source digest drift');
 if(!compiled.has(path)){try{validateReferencedSchema(raw.toString('utf8'),path);compiled.set(path,{result:'passed'});}catch(e){compiled.set(path,{result:'failed',error:String(e),details:e.details});}}
 const compile=compiled.get(path);if(compile.result!=='passed')throw Error('production registry schema compilation failed: '+compile.error);
 let current=doc(path);for(const [index,part]of row.source.field.split(' -> ').entries()){if(index===0)node=pointer(current,part);else if(part.startsWith('#'))node=pointer(current,part);else if(part.startsWith(doc(canonical).$id+'#')){resolvedPath=canonical;current=doc(canonical);node=pointer(current,part.slice(doc(canonical).$id.length));}else throw Error('unresolved external ref '+part);}
 if(!node||typeof node!=='object'||Array.isArray(node))throw Error('not a schema node');
 for(const[key,val]of Object.entries(baselineDomains.get(row.id))){if(JSON.stringify(node[key])!==JSON.stringify(val))throw Error('inventory domain mismatch '+key);}
 }catch(e){error=String(e);}
 observations.push({setting:row.id,owner:row.owner,registration:row.scope.registration,owningSchema:path,sourcePointer:row.source.field,sourceSha256:sha(fs.readFileSync(path)),schemaDomainVerified:baselineDomains.get(row.id),resolvedDefinitionPath:resolvedPath,resolvedDefinitionSha256:sha(fs.readFileSync(resolvedPath)),resolvedNode:node,domainIdentityMatches:!error,registrySchemaCompilation:compiled.get(path),result:error?'failed':'passed',error,limitation:'source identity/exact schema node/domain/actual production schema compiler only; not field consumer, defaults precedence, semantic runtime validator, authority or behavioral acceptance'});
}
const output={caseId:'RT-C0-SCHEMA-FIELD-DEFINITIONS',command:'node '+base+'schema-field-definitions.mjs',node:process.version,sourceDigests:{[domainBaselinePath]:sha(fs.readFileSync(domainBaselinePath)),'skills/common/plugin-runtime/foundation/registry/schema.ts':sha(fs.readFileSync('skills/common/plugin-runtime/foundation/registry/schema.ts')),[canonical]:sha(fs.readFileSync(canonical))},testDigests:{[base+'schema-field-definitions.mjs']:sha(fs.readFileSync(base+'schema-field-definitions.mjs'))},schemaCount:compiled.size,observations,result:observations.every(o=>o.result==='passed')?'passed':'failed',reviewerConfirmation:'pending'};fs.writeFileSync(base+'schema-field-definition-observations.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));process.exitCode=output.result==='passed'?0:1;
