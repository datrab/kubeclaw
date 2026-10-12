import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createHash} from 'node:crypto';
const directory = 'docs/review/evidence/config-studio-20260921';
const before = fs.readFileSync(`${directory}/before/skills__prism__tests__studio-service.test.mts.snapshot`,'utf8');
const after = fs.readFileSync('skills/prism/tests/studio-service.test.mts','utf8');
const marker = "test('actual Studio survives";
const original = before.slice(before.indexOf(marker)).trim();
assert(after.includes(original),'all seven original case bodies must remain byte-identical');
const ast = text => ts.createSourceFile('cases.mts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const oldStatements = ast(original).statements;
const currentStatements = ast(after.slice(after.indexOf(marker))).statements.slice(0,oldStatements.length);
const printer = ts.createPrinter();
const print = statements => statements.map(node => printer.printNode(ts.EmitHint.Unspecified,node,node.getSourceFile()));
assert.deepEqual(print(currentStatements),print(oldStatements));
const hash = text => createHash('sha256').update(text).digest('hex');
fs.writeFileSync(`${directory}/original-cases.json`,JSON.stringify({originalCases:7,topLevelStatements:oldStatements.length,
 exactCaseBodyBytesPreserved:true,typescriptAstIdentical:true,originalCaseBytesSha256:hash(original),
 beforeSha256:hash(before),afterSha256:hash(after)},null,2)+'\n');
