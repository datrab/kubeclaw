import assert from 'node:assert/strict';
import test from 'node:test';
import { apiResourceFieldBoundaries } from '../docs-api-schema-authorities.mjs';
import { renderApiResourceReference } from '../docs-api-reference.mjs';

// Renderer fixtures are synthetic content, never runtime or acceptance proof.
function fixture() {
  const rows = apiResourceFieldBoundaries('v1', 'ConfigMap').map(row => ({ ...row,
    receiverContract: {
      kind: 'ConfigMap', fieldPath: row.fieldPath,
      purpose: 'Literal <script>alert(1)</script> [link](bad) and `code` | value',
      receiver: 'Synthetic renderer fixture', operationScope: 'Fixture only',
      omitted: 'Omitted fixture', nullValue: 'Null fixture', emptyValue: 'Empty fixture',
      invalidValue: 'Invalid fixture', changeImpact: 'Change fixture',
      crossFieldConditions: ['Related fixture'], qualificationLimits: ['No runtime evidence'],
      cases: [{ name: 'Example fixture', condition: 'Fixture condition', sourceOutcome: 'Fixture outcome' }],
      evidence: [{ url: 'https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/api/core/v1/types.go#L1-L2', claim: 'Fixture link only' }],
    },
  }));
  return [{apiVersion:'v1',kind:'ConfigMap',rows,extra:[],missing:[],sourceContexts:[{path:'fixture.yaml',document:0}]}];
}
const link = path => `[${path}](https://example.invalid/fixture)`;

test('maintenance inventory cannot publish missing receivers even when its summary says complete', () => {
  const resources=fixture();
  resources[0].rows.find(row=>row.fieldPath==='$.metadata').receiverContract=null;
  assert.throws(()=>renderApiResourceReference(resources,link), /API_REFERENCE_RECEIVER_MISSING: v1\/ConfigMap \$\.metadata/);
  assert.throws(()=>renderApiResourceReference(undefined,link), /API_REFERENCE_INVENTORY_MISSING/);
});

test('removed unselected paths, changed schema facts and duplicate rows reject publication', () => {
  const removed=fixture();removed[0].rows.pop();
  assert.throws(()=>renderApiResourceReference(removed,link), /API_REFERENCE_BOUNDARY_COUNT/);
  const changed=fixture();changed[0].rows[0].contract.type='incorrect';
  assert.throws(()=>renderApiResourceReference(changed,link), /API_REFERENCE_SCHEMA_DRIFT/);
  const duplicate=fixture();duplicate[0].rows.push(duplicate[0].rows[0]);
  assert.throws(()=>renderApiResourceReference(duplicate,link), /API_REFERENCE_PATH_DUPLICATE/);
});

test('full reference includes every path and behavior dimension, retains schema facts and escapes literal prose', () => {
  const resources=fixture();const output=renderApiResourceReference(resources,link);
  assert.equal((output.match(/<a id="api-field-/gu)??[]).length,resources[0].rows.length);
  for(const label of ['Receiver:','Operation:','Omitted:','JSON null:','Explicit empty value:',
    'Invalid value:','Change effect:','Related conditions:','Examples and expected outcomes:',
    'Scope and limits:','Implementation sources:','Pinned API schema constraints'])assert(output.includes(label));
  assert(!output.includes('<script>'));assert(!output.includes('[link](bad)'));
  assert(output.includes('&#60;script&#62;'));assert(output.includes('&#91;link&#93;(bad)'));
  assert(output.includes(resources[0].rows[0].authoritySha256));
  assert(output.includes('Expected from the cited source: Fixture outcome'));
});

test('unpinned implementation links and empty cases cannot become publication evidence', () => {
  const unpinned=fixture();unpinned[0].rows[0].receiverContract.evidence[0].url='https://github.com/kubernetes/kubernetes/blob/master/path#L1';
  assert.throws(()=>renderApiResourceReference(unpinned,link),/(?:API_REFERENCE_EVIDENCE|API_RECEIVER_EVIDENCE)_INCOMPLETE/);
  const empty=fixture();empty[0].rows[0].receiverContract.cases[0].sourceOutcome='';
  assert.throws(()=>renderApiResourceReference(empty,link),/(?:API_REFERENCE_CASE|API_RECEIVER_CASE)_INCOMPLETE/);
});


test('internal open-proof notes cannot be published as product limitations', () => {
  for (const note of ['OPEN DOCUMENTATION PROOF: inspect source',
    'Available-source documentation gap: missing consumer proof',
    'An unclosed source-proof obligation remains']) {
    const resources=fixture();resources[0].rows[0].receiverContract.qualificationLimits.push(note);
    assert.throws(()=>renderApiResourceReference(resources,link),/API_REFERENCE_UNRESOLVED_PROOF/);
  }
  const product=fixture();product[0].rows[0].receiverContract.qualificationLimits.push('A configured driver must support this feature.');
  assert(renderApiResourceReference(product,link).includes('A configured driver must support this feature.'));
});
