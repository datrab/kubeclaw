import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {verifiedArchitectureValue, assertArchitectureReferenceEncoding} from '../../../skills/nova/plugins/prism-design/src/architecture.ts';

// Positive subject/ref/receipt come from the actual registered Core/ArtifactStore
// raw, not a constructed stage context. Deliberately invalid mutations are negative.
const raw=fs.readFileSync(new URL('../../../docs/review/evidence/run12-prism-reader-first.txt',import.meta.url),'utf8');
const sample=JSON.parse(raw.split('\n').find(line=>line.startsWith('{"mixed":')));
const expected=sample.artifactReference, response=sample.artifactReadReceipt.receipt.result;
test('owning verifier accepts the actual portable original completed receipt',()=>{
  assert.deepEqual(verifiedArchitectureValue(response,expected),response.value);
});
test('expected codec rejects missing-value/unknown tags without executing getters',()=>{
  for(const encoding of [undefined,null,'unknown.v1',false,1]) {
    const ref={...expected,encoding};assert.throws(()=>verifiedArchitectureValue(response,ref));
  }
  let calls=0;
  const ref={...expected,get encoding(){calls++;return expected.encoding;}};
  assert.throws(()=>assertArchitectureReferenceEncoding(ref));assert.equal(calls,0);
  const nested={...expected,producer:{...expected.producer,get runId(){calls++;return expected.producer.runId;}}};
  assert.throws(()=>assertArchitectureReferenceEncoding(nested));assert.equal(calls,0);
  const proxy=new Proxy(expected,{ownKeys(){calls++;return Reflect.ownKeys(expected);}});
  assert.throws(()=>assertArchitectureReferenceEncoding(proxy));assert.equal(calls,0);
});
test('complete returned ref binding rejects all original ownership/codec mismatches',()=>{
  for(const [field,value] of [['artifactId','foreign'],['namespace','foreign'],['mediaType','text/plain'],['digest',`sha256:${'0'.repeat(64)}`],['sizeBytes',expected.sizeBytes+1],['encoding','unknown.v1']]) {
    assert.throws(()=>verifiedArchitectureValue({...response,artifact:{...expected,[field]:value}},expected),/PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID/,field);
  }
  for(const [field,value] of [['runId','run:foreign'],['stageId','foreign'],['attemptId','attempt:foreign'],['attemptNumber',2]]) {
    assert.throws(()=>verifiedArchitectureValue({...response,artifact:{...expected,producer:{...expected.producer,[field]:value}}},expected),/PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID/,field);
  }
  const {encoding,...untagged}=expected;
  assert.throws(()=>verifiedArchitectureValue({...response,artifact:untagged},expected),/PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID/);
  assert.throws(()=>verifiedArchitectureValue({...response,artifact:{...expected,extra:true}},expected),/PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID/);
});
test('real receipt digest/length/value corruption fails, JSON-domain rejection precedes getters',()=>{
  assert.throws(()=>verifiedArchitectureValue({...response,digest:`sha256:${'0'.repeat(64)}`},expected),/PRISM_DESIGN_ARCHITECTURE_PROOF_INVALID/);
  assert.throws(()=>verifiedArchitectureValue({...response,sizeBytes:expected.sizeBytes+1},expected),/PRISM_DESIGN_ARCHITECTURE_PROOF_INVALID/);
  assert.throws(()=>verifiedArchitectureValue({...response,value:{...response.value,foreign:true}},expected),/PRISM_DESIGN_ARCHITECTURE_PROOF_INVALID/);
  for(const value of [undefined,Array(2),[Infinity],new Date(),new Map(),Object.create({inherited:1})])assert.throws(()=>verifiedArchitectureValue({...response,value},expected));
  let calls=0;
  assert.throws(()=>verifiedArchitectureValue({...response,get value(){calls++;return response.value;}},expected));
  assert.equal(calls,0);
  assert.throws(()=>verifiedArchitectureValue({...response,artifact:{...expected,get encoding(){calls++;return expected.encoding;}}},expected));
  assert.equal(calls,0);
  const cyclic={};cyclic.self=cyclic;assert.throws(()=>verifiedArchitectureValue({...response,value:cyclic},expected));
});
test('only own expected encoding selects a codec; inherited accessors are never consulted',()=>{
  const matrix=fs.readFileSync(new URL('../../../docs/review/evidence/run12-prism-reader-first-matrix.txt',import.meta.url),'utf8');
  const legacy=matrix.split('\n').filter(line=>line.startsWith('{"mixed":')).map(line=>JSON.parse(line)).find(item=>item.legacy&&!item.mixed&&item.locale==='en-US');
  assert(legacy);assert.equal(Object.hasOwn(legacy.artifactReference,'encoding'),false);
  let calls=0;const prior=Object.getOwnPropertyDescriptor(Object.prototype,'encoding');
  try {
    Object.defineProperty(Object.prototype,'encoding',{configurable:true,get(){calls++;return 'kubeclaw-json.utf16.v1';}});
    assert.deepEqual(verifiedArchitectureValue(legacy.artifactReadReceipt.receipt.result,legacy.artifactReference),legacy.artifactReadReceipt.receipt.result.value);
    assert.equal(calls,0);
  } finally {if(prior)Object.defineProperty(Object.prototype,'encoding',prior);else delete Object.prototype.encoding;}
  for(const field of ['artifact','digest','sizeBytes','value']) {
    const candidate={...response};delete candidate[field];const saved=Object.getOwnPropertyDescriptor(Object.prototype,field);
    try {
      Object.defineProperty(Object.prototype,field,{configurable:true,get(){calls++;return response[field];}});
      assert.throws(()=>verifiedArchitectureValue(candidate,expected));assert.equal(calls,0);
    } finally {if(saved)Object.defineProperty(Object.prototype,field,saved);else delete Object.prototype[field];}
  }
});
