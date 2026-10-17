import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { authDeleteReceiverContracts, receiverContracts } from '../docs-kubernetes-auth-delete-receiver-contracts.mjs';

test('exact receiving selection keeps authority and fails closed after added or renamed input', () => {
 const paths=['$.apiVersion','$.kind','$.spec','$.spec.token','$.spec.audiences','$.spec.audiences[0]'];
 const rows=authDeleteReceiverContracts('authentication.k8s.io/v1','TokenReview',paths.map(fieldPath=>({fieldPath})));
 assert.deepEqual(rows.map(row=>row.fieldPath),paths);
 for(const row of rows) assert.deepEqual(row.authoritySelector,{apiVersion:'authentication.k8s.io/v1',kind:'TokenReview',fieldPath:row.fieldPath});
 for(const fieldPath of ['$.spec.newAudience','$.spec.tokenRenamed','$.status.authenticated','$.metadata.name']) assert.throws(()=>authDeleteReceiverContracts('authentication.k8s.io/v1','TokenReview',[fieldPath]),/AUTH_DELETE_RECEIVER_GAP/);
 assert.deepEqual(authDeleteReceiverContracts('v1','TokenReview',paths),[]);
 assert.deepEqual(authDeleteReceiverContracts('authentication.k8s.io/v1','TokenReview',paths.filter(path=>path!=='$.spec.token')).map(row=>row.fieldPath),paths.filter(path=>path!=='$.spec.token'));
});

test('DELETE selected field mutations cannot inherit unrelated stored-object authority', () => {
 const paths=['$.apiVersion','$.kind','$.preconditions','$.preconditions.uid','$.preconditions.resourceVersion','$.gracePeriodSeconds'];
 const rows=authDeleteReceiverContracts('v1','DeleteOptions',paths);
 assert.equal(rows.length,paths.length);
 for(const path of ['$.metadata.resourceVersion','$.preconditions.revision','$.unsupported']) assert.throws(()=>authDeleteReceiverContracts('v1','DeleteOptions',[path]),/AUTH_DELETE_RECEIVER_GAP/);
 assert.equal(new Set(receiverContracts.map(row=>`${row.kind}:${row.fieldPath}`)).size,receiverContracts.length);
});

test('original controller HTTP branches exercise producer authentication and fenced deletion', {timeout:120000}, t => {
 const result=spawnSync(process.env.GO_BINARY || 'go',['test','./cmd/buster-namespace-controller','-run','^(TestDemoReadyAuthenticatedCASAndRecovery|TestExposureAcknowledgesOwnerAndGenerationThroughActualHTTP|TestStaleExposureReconcileCannotOverwriteOrDeleteReplacement)$','-count=1'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8',timeout:110000});
 if(result.error?.code==='ENOENT') { t.skip('Go toolchain unavailable: original controller HTTP branches were not executed.'); return; }
 assert.equal(result.status,0,`${result.error??''}\n${result.stdout}\n${result.stderr}`);
 // These run production controller functions against HTTP fixtures. They do not
 // execute Kubernetes authentication/storage/GC or establish live acceptance.
});
