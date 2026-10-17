import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root='skills/worker/core/worker';
const interfaces=[], defaults=[], callers=[], candidates=[];
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.ts')).sort()){
 const file=path.join(root,name),text=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 function visit(n){
  const line=sf.getLineAndCharacterOfPosition(n.getStart()).line+1;
  if(ts.isInterfaceDeclaration(n))for(const m of n.members)interfaces.push({file,interface:n.name.text,field:m.name?.getText(sf),line:sf.getLineAndCharacterOfPosition(m.getStart()).line+1,type:m.type?.getText(sf),optional:!!m.questionToken});
  if(ts.isParameter(n)&&n.initializer)defaults.push({file,line,parameter:n.name.getText(sf),initializer:n.initializer.getText(sf)});
  if(ts.isNumericLiteral(n)||ts.isStringLiteral(n))candidates.push({file,line,literal:n.getText(sf),context:n.parent.getText(sf).slice(0,350)});
  if(ts.isCallExpression(n)&&/validate|Limits|Policy|Capacity|reserve|launch|withAttempt/.test(n.expression.getText(sf)))callers.push({file,line,text:n.getText(sf).slice(0,900)});
  ts.forEachChild(n,visit);
 }visit(sf);
}
const residual=JSON.parse(fs.readFileSync('docs/review/evidence/config-acceptance/components/residual-fragment.json'));
const key=x=>x.file+'#'+x.interface+'.'+x.field;
const author=new Set(residual.apiFieldDispositions.map(x=>x.path+'#'+x.sourceField));
const report={interfaces,defaults,callers,candidates,missingAPI:interfaces.filter(x=>!author.has(key(x))),extraAuthorAPI:residual.apiFieldDispositions.filter(x=>!interfaces.some(y=>key(y)===x.path+'#'+x.sourceField))};
fs.writeFileSync('docs/review/evidence/config-acceptance/independent-core-domain/expected-api-obligations.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({interfaces:new Set(interfaces.map(x=>x.interface)).size,members:interfaces.length,defaults:defaults.length,literalCandidates:candidates.length,missingAPI:report.missingAPI.length,extraAPI:report.extraAuthorAPI.length}));
