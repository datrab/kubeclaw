import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';
const dir='skills/common/plugin-runtime/foundation/observability/';
const old=fs.readFileSync('docs/review/evidence/attempt-store-quality-20260921/durable-attempts.before.ts','utf8');
const files=['durable-attempts','attempt-state','attempt-evidence','attempt-results','attempt-completeness','attempt-retirement'];
const current=files.map(name=>fs.readFileSync(dir+name+'.ts','utf8')).join('\n');
const codes=source=>[...source.matchAll(/OBSERVABILITY_[A-Z_]+/gu)].map(match=>match[0]).sort();assert.deepEqual(codes(current),codes(old));
const parse=source=>ts.createSourceFile('source.ts',source,ts.ScriptTarget.Latest,true);
const oldTree=parse(old),oldClass=oldTree.statements.find(ts.isClassDeclaration);
const state=parse(fs.readFileSync(dir+'attempt-state.ts','utf8')).statements.find(ts.isClassDeclaration);
function tokens(body){let s=body.replaceAll(/this\.#(?!queue)(\w+)/gu,'this.$1');const file=parse('function f() '+s);const result=[];
 function visit(node){const children=node.getChildren(file);if(!children.length&&node.kind!==ts.SyntaxKind.EndOfFileToken)result.push(node.getText(file));else children.forEach(visit);}visit(file);return result.filter((token,index)=>!(token===","&&[")","}"].includes(result[index+1])));}
for(const name of ['serial','readState','writeState','checkSize','reclaimExpiredEvidence']){
 const before=oldClass.members.find(n=>n.name?.getText(oldTree)==='#'+name);
 const after=state.members.find(n=>n.name?.getText()==name);assert.deepEqual(tokens(after.body.getText()),tokens(before.body.getText()),name);
}
const beforeConstructor=oldClass.members.find(ts.isConstructorDeclaration),afterConstructor=state.members.find(ts.isConstructorDeclaration);
assert.deepEqual(tokens(afterConstructor.body.getText()),tokens(beforeConstructor.body.getText()));
console.log(JSON.stringify({errorCodeOccurrences:codes(old).length,unchangedStateMethodBodies:5,unchangedValidationConstructor:true}));
