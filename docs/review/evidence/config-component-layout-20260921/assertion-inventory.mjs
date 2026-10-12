import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
const root=process.cwd(), out=path.dirname(import.meta.filename);
const files=JSON.parse(fs.readFileSync(path.join(out,'integration1/identities.json'),'utf8'));
function calls(file,text){const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),tests=[],assertions=[];function visit(node){if(ts.isCallExpression(node)){const callee=node.expression.getText(ast);if(callee==='test'||callee.endsWith('.test'))tests.push(node.arguments[0]?.getText(ast));if(callee==='assert'||callee.startsWith('assert.'))assertions.push(node.getText(ast));}ts.forEachChild(node,visit);}visit(ast);return {tests,assertions};}
const result=[];
for(const row of files){if(!/\.(?:[cm]?ts|[cm]?js)$/.test(row.path)||!/(?:tests|fixtures|verification)\//.test(row.path))continue;const before=path.join(out,'integration1/before',row.path),after=path.join(root,row.path);if(!fs.existsSync(before))continue;const b=fs.readFileSync(before,'utf8'),a=fs.readFileSync(after,'utf8');result.push({path:row.path,beforeSha256:createHash('sha256').update(b).digest('hex'),afterSha256:createHash('sha256').update(a).digest('hex'),before:calls(row.path,b),after:calls(row.path,a)});}
fs.writeFileSync(path.join(out,'original-assertion-inventory.json'),JSON.stringify({scope:'Actual saved pre-component files. Static syntactic call inventory; loops are not runtime case counts and changed assertions require semantic review.',files:result},null,2));
console.log('inventoried files',result.length);
