import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
const output='docs/review/evidence/buster-consumer-preparation-adaptation-20260921';
const rows=JSON.parse(fs.readFileSync('docs/review/evidence/buster-native-preparation-design-20260921/consumer-before-identities.json','utf8')).filter(row=>row.path.startsWith('tests/'));
const inventory=[];
for(const row of rows){
 const source=fs.readFileSync(row.path,'utf8'); const target=path.join(output,'before',row.path+'.snapshot');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
 const parsed=ts.createSourceFile(row.path,source,ts.ScriptTarget.Latest,true);const assertions=[];const cases=[];
 function visit(node){if(ts.isCallExpression(node)){const callee=node.expression.getText(parsed);if(callee==='assert'||callee.startsWith('assert.'))assertions.push(node.getText(parsed));if(callee==='test'||callee==='t.test')cases.push(node.arguments[0]?.getText(parsed));}ts.forEachChild(node,visit);}visit(parsed);
 inventory.push({path:row.path,sha256:crypto.createHash('sha256').update(source).digest('hex'),assertions,cases,snapshot:target});
}
fs.writeFileSync(path.join(output,'original-assertion-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
