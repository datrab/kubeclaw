import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {sha256Text} from '@kubeclaw/plugin-sdk';
import {verifiedArchitectureValue} from '../../../skills/nova/plugins/prism-design/src/architecture.ts';

const before=fs.readFileSync(new URL('../../../tests/verification/reliability/fixtures/prism-reader-stage-original.ts.txt',import.meta.url),'utf8');
const after=fs.readFileSync(new URL('../../../skills/nova/plugins/prism-design/src/stage.ts',import.meta.url),'utf8');
assert.equal(sha256Text(before),'sha256:8720b7e3d5e1a7726d76fe9b37a3f58f71566b193b35d6a5f017fbae0b243483');
function invocations(text){
  const source=ts.createSourceFile('stage.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const found=[];
  function visit(node){
    if(ts.isCallExpression(node)&&node.expression.getText(source)==='context.invoke'){
      found.push({capability:node.arguments[0].text,arguments:node.arguments.map(argument=>argument.getText(source))});
    }
    ts.forEachChild(node,visit);
  }
  visit(source);return found;
}
const oldCalls=invocations(before),newCalls=invocations(after);
assert.deepEqual(newCalls,oldCalls);
assert.equal(oldCalls[0].capability,'artifacts.read');
assert.equal(oldCalls[1].capability,'runtime.dispatch');
process.stdout.write(JSON.stringify({allCapabilityArgumentBytesUnchanged:true,invocationOrder:oldCalls.map(item=>item.capability),originalStageDigest:sha256Text(before),newStageDigest:sha256Text(after),historicalGitObjectsRequired:false})+'\n');
function checkProxyAdmission(){
const matrix=fs.readFileSync(new URL('./run13-prism-reader-independent-matrix.txt',import.meta.url),'utf8');
const sample=matrix.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).find(value=>value.registeredStages&&!value.legacy);
assert(sample);
const expected=sample.artifactReference,result=sample.artifactReadReceipt.receipt.result;
assert.deepEqual(verifiedArchitectureValue(result,expected),result.value);
let traps=0;
const proxy=value=>new Proxy(value,{get(){traps++;throw new Error('PROXY_TRAP');},ownKeys(){traps++;throw new Error('PROXY_TRAP');},getPrototypeOf(){traps++;throw new Error('PROXY_TRAP');}});
for(const response of [proxy(result),{...result,value:proxy(result.value)},{...result,artifact:proxy(expected)}]){
  assert.throws(()=>verifiedArchitectureValue(response,expected));assert.equal(traps,0);
}
assert.throws(()=>verifiedArchitectureValue(result,{...expected,producer:proxy(expected.producer)}));assert.equal(traps,0);
process.stdout.write(JSON.stringify({actualIndependentCompletedReceiptAccepted:true,responseValueArtifactAndNestedProducerProxyRejected:true,proxyTrapsExecuted:traps})+'\n');
}
checkProxyAdmission();
