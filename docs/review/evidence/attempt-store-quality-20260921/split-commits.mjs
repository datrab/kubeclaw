import fs from 'node:fs';
import ts from 'typescript';
const dir='skills/common/plugin-runtime/foundation/observability/';
let file=dir+'attempt-retirement.ts',source=fs.readFileSync(file,'utf8');
source=source.replace("import type { AttemptState }", "import type { ProducerClosureV1 } from '@kubeclaw/pipeline-observability-contract';\nimport type { DurableAttemptStoreSnapshot } from './durable-attempts.ts';\nimport type { ProjectedResultMetadata } from './attempt-projection.ts';\nimport type { AttemptState }");
let additions='\ninterface RetirementOutcome {newlyRetired:boolean;releasedBytes:number}\ntype CheckpointFence=(operation:()=>RetirementOutcome)=>RetirementOutcome;\n';
for(const [name,helper,args,parameters] of [
 ['retireImportedResult','commitImportedResult','store,state,intent,existing,authorize','store:AttemptState,state:DurableAttemptStoreSnapshot,intent:AttemptRetirementIntent,existing:ProjectedResultMetadata|undefined,authorize:()=>void'],
 ['retireImportedClosure','commitImportedClosure','store,state,intent,closure,authorize','store:AttemptState,state:DurableAttemptStoreSnapshot,intent:ClosureRetirementIntent,closure:ProducerClosureV1,authorize:()=>void']]) {
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 const fn=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===name);
 let call;const visit=n=>{if(ts.isCallExpression(n)&&n.expression.getText(tree)==='withCheckpointFence')call=n;ts.forEachChild(n,visit)};visit(fn);
 const arrow=call.arguments[0];const body=arrow.body.getText(tree);
 additions+=`\nfunction ${helper}(${parameters}):RetirementOutcome ${body}\n`;
 const changes=[{start:arrow.getStart(tree),end:arrow.end,text:`()=>${helper}(${args})`},
 {start:fn.parameters.find(p=>p.name.getText(tree)==='withCheckpointFence').type.getStart(tree),end:fn.parameters.find(p=>p.name.getText(tree)==='withCheckpointFence').type.end,text:'CheckpointFence'}];
 for(const edit of changes.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
}
fs.writeFileSync(file,source+additions);
file=dir+'attempt-completeness.ts';source=fs.readFileSync(file,'utf8');
let tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),declaration;
const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='closureItems')declaration=n;ts.forEachChild(n,visit)};visit(tree);
const original=declaration.initializer.getText(tree);source=source.slice(0,declaration.initializer.getStart(tree))+'missingClosureIssues(state,missingClosureIds,requirements)'+source.slice(declaration.initializer.end);
source+=`\nfunction missingClosureIssues(state:DurableAttemptStoreSnapshot,missingClosureIds:readonly string[],requirements:readonly RequiredProducerClosure[]):UnresolvedObservabilityItemV1[] {return ${original};}\n`;fs.writeFileSync(file,source);
file=dir+'attempt-evidence.ts';source=fs.readFileSync(file,'utf8');const start=source.indexOf('  const total =',source.indexOf('async function persistEvidence'));const end=source.indexOf('  const hex =',start);const capacity=source.slice(start,end).replaceAll('store.limits','limits');source=source.slice(0,start)+'  assertEvidenceCapacity(state,store.limits,content);\n'+source.slice(end);source+=`\nfunction assertEvidenceCapacity(state:DurableAttemptStoreSnapshot,limits:DurableAttemptStoreLimits,content:Uint8Array):void {\n${capacity}}\n`;source=source.replace('  DurableEvidenceInput,','  DurableAttemptStoreLimits,\n  DurableEvidenceInput,');fs.writeFileSync(file,source);
