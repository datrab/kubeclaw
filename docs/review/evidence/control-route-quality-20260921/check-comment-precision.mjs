import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const before=fs.readFileSync(new URL('./control-server.before-comment-precision.ts',import.meta.url),'utf8');
const after=fs.readFileSync('skills/prism/server/control-server.ts','utf8');
function tokens(source) {
  const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,source),result=[];
  while(scanner.scan()!==ts.SyntaxKind.EndOfFileToken)result.push([scanner.getToken(),scanner.getTokenText()]);
  return result;
}
assert.deepEqual(tokens(after),tokens(before));
console.log(JSON.stringify({before:createHash('sha256').update(before).digest('hex'),after:createHash('sha256').update(after).digest('hex'),nonTriviaTokensEqual:true}));
