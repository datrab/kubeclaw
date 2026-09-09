import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setup,sessionHeaders} from './control-product-composition.test.mts';
import {createControlServer} from '../server/control-server.ts';
import {storedProductDecision} from '../storage/product-decisions.ts';

test('independent composed startup rejects a genuine wrong key type and disabled authority does not read its missing key',async()=>{
  const context=await setup();
  try {
    const rsa=generateKeyPairSync('rsa',{modulusLength:2048});
    const keyFile=join(context.root,'incorrect-authority.pem');
    await writeFile(keyFile,rsa.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
    await assert.rejects(createControlServer(context.db(),{...context.environment,PRISM_PRODUCT_PRIVATE_KEY_FILE:keyFile}),/dedicated Ed25519 key/);
    const disabled=await createControlServer(context.db(),{...context.environment,PRISM_PRODUCT_DECISIONS_ENABLED:'false',PRISM_PRODUCT_PRIVATE_KEY_FILE:join(context.root,'not-present')});
    assert.equal(disabled.listening,false);
    disabled.close();
    assert.equal((await context.request('/health')).status,200);
  } finally {await context.close();}
});

test('independent original composed restart rejects prior session authority before recording and preserves fresh authorized intent',async()=>{
  const context=await setup();
  const intent={decisionId:'00000000-0000-4000-8000-000000000061',action:'accept',reason:'Independent restart authorization',
    subject:{leaseName:'demo-independent',leaseUID:'lease-independent',sourceRevision:'source-independent',
      candidateDigest:`sha256:${'a'.repeat(64)}`,resultDigest:`sha256:${'b'.repeat(64)}`,readyDigest:`sha256:${'c'.repeat(64)}`,
      generation:1,expectedExpiry:'2026-09-10T01:00:00Z',expectedRevision:'61',url:'https://demo.example.test',runId:'independent-control'}};
  try {
    const previous=await context.session();assert.equal(previous.status,201);
    context.environment.PRISM_SESSION_SECRET='rotated-original-session-authority';
    await context.restart();
    assert.equal((await context.request('/v1/product-decisions',intent,sessionHeaders(previous))).status,403);
    assert.equal(await storedProductDecision(context.db(),intent.decisionId),undefined);
    const current=await context.session();assert.equal(current.status,201);
    const recorded=await context.request('/v1/product-decisions',intent,sessionHeaders(current));
    assert.equal(recorded.status,202);assert.equal(recorded.value.state,'pending');
    const stored=await storedProductDecision(context.db(),intent.decisionId);assert(stored);
    assert.equal(stored.receipt,null);
    const bytes=JSON.parse(Buffer.from(stored.envelope.payload,'base64').toString('utf8')) as {actorId:string};
    assert.equal(bytes.actorId,'operator@example.test');
    assert.equal((await context.request(`/v1/product-decisions/${intent.decisionId}/recover`,{},sessionHeaders(previous))).status,403);
    assert.deepEqual((await storedProductDecision(context.db(),intent.decisionId))?.envelope,stored.envelope);
  } finally {await context.close();}
});
