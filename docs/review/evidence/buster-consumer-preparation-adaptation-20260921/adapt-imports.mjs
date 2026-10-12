import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const rows=JSON.parse(fs.readFileSync('docs/review/evidence/buster-consumer-preparation-adaptation-20260921/original-assertion-inventory.json','utf8'));
for(const row of rows){
 if(row.path.endsWith('buster-job-compaction.test.mts'))continue;
 let source=fs.readFileSync(row.path,'utf8');const parsed=ts.createSourceFile(row.path,source,ts.ScriptTarget.Latest,true);const edits=[];const model=[];
 for(const node of parsed.statements){
  if(!ts.isImportDeclaration(node)||!node.importClause?.namedBindings||!ts.isNamedImports(node.importClause.namedBindings))continue;
  const members=node.importClause.namedBindings.elements;
  const selected=members.filter(item=>['BusterRemotePlanService','FileBusterPlanJobStore'].includes(item.name.text));if(!selected.length)continue;
  for(const item of selected)model.push(`${node.importClause.isTypeOnly||item.isTypeOnly?'type ':''}${item.name.text==='BusterRemotePlanService'?'ModeledBusterRemotePlanService':'ModeledPreparedPlanJobStore'} as ${item.name.text}`);
  const kept=members.filter(item=>!selected.includes(item));
  edits.push({start:node.getStart(parsed),end:node.end,text:kept.length?`import ${node.importClause.isTypeOnly?'type ':''}{ ${kept.map(x=>x.getText(parsed)).join(', ')} } from ${node.moduleSpecifier.getText(parsed)};`:''});
 }
 for(const edit of edits.reverse())source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
 if(model.length){let relative=path.relative(path.dirname(row.path),'tests/fixtures/test-gate/modeled-preparation.mts');if(!relative.startsWith('.'))relative='./'+relative;source=`// Preparation authority is modeled here; parser, extraction and durable service/store remain real.\nimport { ${model.join(', ')} } from '${relative}';\n`+source;}
 fs.writeFileSync(row.path,source);
}
