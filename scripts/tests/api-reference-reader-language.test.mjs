import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {receiverContracts as pvReceiverContracts} from '../docs-kubernetes-pv-selected-receiver-contracts.mjs';
import {apiResourceFieldBoundaries} from '../docs-api-schema-authorities.mjs';
import {renderApiResourceReference} from '../docs-api-reference.mjs';

// Synthetic prose exercises publication policy; it is no product behavior proof.
function render(note, readerReferences = [], kind = 'ConfigMap', actual = []) {
 const rows=apiResourceFieldBoundaries('v1',kind).map(row=>({...row,
  receiverContract:actual.find(receiver=>receiver.fieldPath===row.fieldPath) ?? {kind,fieldPath:row.fieldPath,readerReferences,
   purpose:'Synthetic content',receiver:'Synthetic receiver',operationScope:'Synthetic operation',
   omitted:'Synthetic omission',nullValue:'Synthetic null',emptyValue:'Synthetic empty',
   invalidValue:'Synthetic invalid',changeImpact:'Synthetic change',crossFieldConditions:[],
   qualificationLimits:[note],cases:[{name:'Synthetic case',condition:'Synthetic condition',sourceOutcome:'Synthetic outcome'}],
   evidence:[{url:'https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/api/core/v1/types.go#L1-L2',claim:'Synthetic source link'}]
  }}));
 return renderApiResourceReference([{apiVersion:'v1',kind,rows,extra:[],sourceContexts:[]}],
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

// Resolve emitted Markdown from its real publication location. The test reads
// authored destinations, not stale generated output or an invented route map.
const emittedPage = fileURLToPath(new URL('../../docs/site/reference/helm-values.md', import.meta.url));
function resolveReaderLink(target) {
 const [relative, fragment] = target.split('#');
 const destination = path.resolve(path.dirname(emittedPage), relative);
 assert.ok(fs.existsSync(destination), `Reader destination does not exist: ${destination}`);
 const markdown = fs.readFileSync(destination, 'utf8').replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[ \t]*$/gmu, '');
 const headings = [...markdown.matchAll(/^#{1,6}\s+(.+)$/gmu)].map(match=>
  match[1].toLowerCase().replace(/[^\p{L}\p{N} -]/gu,'').trim().replace(/ +/gu,'-'));
 assert.ok(headings.includes(fragment), `Reader anchor does not exist: ${fragment}`);
 return destination;
}

test('all seven actual PV reader links resolve from the Helm values reference to the canonical task',()=>{
 const output=render('Synthetic remaining upstream fields.', [], 'PersistentVolume', pvReceiverContracts);
 const links=[...output.matchAll(/\[Retire the former Qdrant installation and check storage ownership and deletion\]\(([^)]+)\)/gu)];
 assert.equal(links.length,7);
 const intended=fileURLToPath(new URL('../../docs/site/use/maintenance.md',import.meta.url));
 for(const [,target] of links) assert.equal(resolveReaderLink(target),intended);
 assert.throws(()=>resolveReaderLink('maintenance.md#retire-the-former-qdrant-installation'),/destination does not exist/);
 assert.throws(()=>resolveReaderLink('../use/maintenance.md#missing-retirement-task'),/anchor does not exist/);
});

test('reader links permit the finite canonical task and retain safe same-directory syntax',()=>{
 for(const target of ['../use/maintenance.md#retire-the-former-qdrant-installation','glossary.md#purpose']) {
  const output=render('Synthetic limit.',[{label:'Reader task',target}]);
  assert.ok(output.includes(`[Reader task](${target})`));
 }
 for(const target of [
  '../../use/maintenance.md#retire-the-former-qdrant-installation',
  '../use/../use/maintenance.md#retire-the-former-qdrant-installation',
  '../use/unknown.md#retire-the-former-qdrant-installation',
  '../use/maintenance.md#missing-retirement-task',
  '../understand/maintenance.md#retire-the-former-qdrant-installation',
  '/docs/site/use/maintenance.md#retire-the-former-qdrant-installation',
  'https://example.invalid/maintenance.md#retire-the-former-qdrant-installation',
  'javascript:alert(1)', '//example.invalid/task.md#purpose',
  '%2e%2e/use/maintenance.md#retire-the-former-qdrant-installation',
  '..\\use\\maintenance.md#retire-the-former-qdrant-installation',
  '../use/maintenance.md#retire-the-former-qdrant-installation)\n<img src=x>',
  'glossary.md#purpose?redirect=outside', 'glossary.md#purpose\nunsafe',
 ]) assert.throws(()=>render('Synthetic limit.',[{label:'Reader task',target}]),/API_REFERENCE_READER_LINK_INVALID/);
 const escaped=render('Synthetic limit.',[{label:'<img src=x>[unsafe]',target:'../use/maintenance.md#retire-the-former-qdrant-installation'}]);
 assert.ok(!escaped.includes('<img src=x>'));
 assert.throws(()=>render('Synthetic limit.',[{label:' ',target:'glossary.md#purpose'}]),/API_REFERENCE_READER_LINK_INVALID/);
});
