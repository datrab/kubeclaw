import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { checkPipelineTestGateContract, validateE2eProviderDetails } from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
const root = new URL('../../../contracts/pipeline-test-gate/v1/', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8'));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const visual = ajv.compile(read('schemas/visual-baselines.v1.schema.json'));
for (const [route, expected] of [['/pricing', true], ['/home', true], ['/\n', false]]) {
 const doc = read('examples/visual-baselines.json'); doc.entries[0].route = route;
 assert.equal(visual(doc), expected); console.log(JSON.stringify({ route, schemaAccepted: expected, runtimeRouteAccepted: route.startsWith('/') && !route.startsWith('//') && !/[?#\r\n]/u.test(route) }));
}
for (const [schema, example] of [['browser-profiles','browser-profiles'], ['lighthouse-settings','lighthouse-settings'], ['visual-baselines','visual-baselines']]) {
 assert.equal(new Ajv2020({strict:true,allErrors:true}).compile(read(`schemas/${schema}.v1.schema.json`))(read(`examples/${example}.json`)), true); console.log(`${schema}: original example accepted`);
}
validateE2eProviderDetails(read('examples/e2e-result-cypress.json'));
console.log('Cypress conformance example accepted; no Cypress execution');
const manifest = {schemaVersion:'evidence-manifest.v1', planId:'plan:test',runId:'run:test',moduleId:'module:test',gateId:null,suiteInstanceId:null,nodeId:'node:test',executionId:'execution:test',attemptId:'attempt:test',files:[{evidenceId:'evidence:test',type:'log',file:'test.log',mediaType:'text/plain'}]};
assert.equal(checkPipelineTestGateContract('evidenceManifest',manifest).ok,true);
manifest.files[0].artifact = {artifactId:'artifact:test',type:'log',mediaType:'text/plain',contentDigest:'sha256:'+'a'.repeat(64),sizeBytes:1,storageUrl:'artifact://test'};
assert.equal(checkPipelineTestGateContract('evidenceManifest',manifest).ok,false);
console.log('DeclaredEvidenceV1 optional artifact rejected by original wire validator');
