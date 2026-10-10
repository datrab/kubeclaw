import test from 'node:test';
import assert from 'node:assert/strict';
import {apiResourceFieldBoundaries} from '../docs-api-schema-authorities.mjs';
import {renderApiResourceReference} from '../docs-api-reference.mjs';

// Synthetic prose exercises publication policy; it is no product behavior proof.
function render(note) {
 const rows=apiResourceFieldBoundaries('v1','ConfigMap').map(row=>({...row,
  receiverContract:{kind:'ConfigMap',fieldPath:row.fieldPath,
   purpose:'Synthetic content',receiver:'Synthetic receiver',operationScope:'Synthetic operation',
   omitted:'Synthetic omission',nullValue:'Synthetic null',emptyValue:'Synthetic empty',
   invalidValue:'Synthetic invalid',changeImpact:'Synthetic change',crossFieldConditions:[],
   qualificationLimits:[note],cases:[{name:'Synthetic case',condition:'Synthetic condition',sourceOutcome:'Synthetic outcome'}],
   evidence:[{url:'https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/api/core/v1/types.go#L1-L2',claim:'Synthetic source link'}]
  }}));
 return renderApiResourceReference([{apiVersion:'v1',kind:'ConfigMap',rows,extra:[],sourceContexts:[]}],
  path=>`[${path}](https://example.invalid/source)`);
}

test('internal documentation acceptance statements block publication',()=>{
 for(const note of [
  'No independent source, reader or quality acceptance is claimed.',
  'No semantic acceptance is established.',
  'No global documentation acceptance is established.',
  'No reader exercise or quality review is established.'
 ])assert.throws(()=>render(note),/API_REFERENCE_INTERNAL_REVIEW_LANGUAGE/);
});

test('product review stages and honest execution limits remain publishable',()=>{
 for(const note of ['A review stage can reject this product request.',
  'No live API request or deployment success is reported.',
  'API acceptance does not prove successful container execution.']) {
  assert.ok(render(note).includes(note));
 }
 assert.throws(()=>render('OPEN DOCUMENTATION PROOF: an actual receiver is not yet explained.'),
  /API_REFERENCE_UNRESOLVED_PROOF/);
});
