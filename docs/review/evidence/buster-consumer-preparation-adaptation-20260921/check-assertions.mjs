import fs from 'node:fs';
import ts from 'typescript';
const root='docs/review/evidence/buster-consumer-preparation-adaptation-20260921';
const original=JSON.parse(fs.readFileSync(`${root}/original-assertion-inventory.json`));
const result=original.map(row=>{
 const source=fs.readFileSync(row.path,'utf8'),parsed=ts.createSourceFile(row.path,source,ts.ScriptTarget.Latest,true),assertions=[],cases=[];
 function visit(node){if(ts.isCallExpression(node)){const name=node.expression.getText(parsed);if(name==='assert'||name.startsWith('assert.')) assertions.push(node.getText(parsed));if(name==='test'||name==='t.test')cases.push(node.arguments[0]?.getText(parsed));}ts.forEachChild(node,visit);}visit(parsed);
 const remaining=[...assertions];const changed=[];for(const assertion of row.assertions){const index=remaining.indexOf(assertion);if(index<0)changed.push(assertion);else remaining.splice(index,1);}
 return {path:row.path,originalAssertions:row.assertions.length,currentAssertions:assertions.length,originalCases:row.cases,currentCases:cases,changedOriginalAssertions:changed,addedOrMappedAssertions:remaining};
});fs.writeFileSync(`${root}/assertion-comparison.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.filter(x=>x.changedOriginalAssertions.length),null,2));
