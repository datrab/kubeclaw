import fs from 'node:fs';
import ts from 'typescript';
const inventory=JSON.parse(fs.readFileSync(new URL('./inventory-before.json',import.meta.url),'utf8'));
const changes=[];
for(const {path:file} of inventory.rows){
 if(!file.includes('/historical-branch-acceptance/'))continue;
 const text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),edits=[];
 function walk(node){
  if(ts.isNewExpression(node)&&/(?:^|\.)EffectCoordinator$/.test(node.expression.getText(ast))&&node.arguments?.length===4){
   const last=node.arguments[3]; edits.push({at:last.end,text:', 300_000',kind:'explicit-constructor-ttl'});
  }
  if(ts.isObjectLiteralExpression(node)&&node.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast).replace(/['"]/g,'')==='schemaVersion'&&p.initializer.getText(ast).includes('pipeline-platform.v2'))&&!node.properties.some(p=>p.name?.getText(ast).replace(/['"]/g,'')==='effectLockTtlMs')){
   const prop=node.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast).replace(/['"]/g,'')==='schemaVersion'); edits.push({at:prop.end,text:', effectLockTtlMs: 300_000',kind:'explicit-platform-ttl'});
  }
  ts.forEachChild(node,walk);
 }walk(ast);
 if(edits.length){let next=text; for(const edit of edits.sort((a,b)=>b.at-a.at))next=next.slice(0,edit.at)+edit.text+next.slice(edit.at); fs.writeFileSync(file,next);changes.push({file,edits});}
}
console.log(JSON.stringify(changes,null,2));
