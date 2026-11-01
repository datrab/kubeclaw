import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,webcrypto} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {openStore} from '../src/secret-input/store.mjs';
import {createBroker} from '../src/secret-input/broker.mjs';
import {createReceiver} from '../src/secret-input/receiver.mjs';
import {seal} from '../src/secret-input/browser.mjs';
import {decrypt} from '../src/secret-input/crypto.mjs';
import {handleSecretInput} from '../src/secret-input/http.mjs';
import {keys,publicKey,secret,fixture} from './fixtures/secret-input.mjs';
test('browser encrypts; authenticated receiver persists ciphertext and consumer alone can use the secret',async()=>{const f=fixture();try{
 const r=f.create(),sealed=await seal(secret,r.metadata,r.metadata.spki,webcrypto);
 assert(!JSON.stringify(sealed).includes(secret));assert.deepEqual(Object.keys(sealed).sort(),['ciphertext','iv','wrappedKey']);
 const result=await f.broker.submit(r.id,r.token,sealed);assert.equal(result.state,'stored');assert(result.reference);
 let borrowed;assert.equal(await f.receiver.use(result.reference,plain=>{borrowed=plain;assert.equal(plain.toString(),secret);return 'configured';}),'configured');assert(borrowed.every(x=>x===0));
 await assert.rejects(f.receiver.use(result.reference,()=>{throw Error(secret);}),error=>error.message==='SECRET_CONSUMER_FAILED');
 assert(!JSON.stringify(f.broker.status('nova',r.id)).includes(secret));
 for(const file of readdirSync(f.root))assert(!readFileSync(join(f.root,file)).includes(Buffer.from(secret)));
 assert.throws(()=>f.broker.describe(r.id,r.token),/UNAVAILABLE/);
 await assert.rejects(f.broker.submit(r.id,r.token,await seal('replacement',r.metadata,r.metadata.spki,webcrypto)),/ALREADY_USED/);
 assert.equal((await f.broker.submit(r.id,r.token,sealed)).reference,result.reference);assert.equal(f.calls(),1);
 }finally{f.close();}});
test('ciphertext is bound to tenant, namespace, target, name, recipient and request; tampering fails',async()=>{const f=fixture();try{
 const r=f.create(),sealed=await seal(secret,r.metadata,r.metadata.spki,webcrypto);
 for(const field of ['tenant','namespace','target','name','requestId','keyId','expiresAt'])assert.throws(()=>decrypt(sealed,{...r.metadata,[field]:field==='expiresAt'?r.metadata.expiresAt+1:'changed'},keys.privateKey),/DECRYPTION_FAILED/);
 const bad={...sealed,ciphertext:Buffer.from('wrong cipher bytes and tag').toString('base64')};assert.throws(()=>decrypt(bad,r.metadata,keys.privateKey),/DECRYPTION_FAILED/);
 await assert.rejects(f.broker.submit(r.id,r.token,{...sealed,password:secret}),/INVALID_ENVELOPE/);
 await assert.rejects(f.broker.submit(r.id,r.token,{...sealed,iv:'not base64!'}),/INVALID_ENVELOPE/);
 }finally{f.close();}});
test('owner, target allowlist, expiry, cancellation and concurrent single-value CAS fail closed',async()=>{const f=fixture();try{
 assert.throws(()=>f.broker.create('other','hetzner-storage','HETZNER_STORAGE_TOKEN'),/FORBIDDEN/);
 assert.throws(()=>f.broker.create('nova','hetzner-storage','ARBITRARY_PASSWORD'),/FORBIDDEN/);
 const r=f.create();assert.throws(()=>f.broker.status('other',r.id),/UNAVAILABLE/);assert.throws(()=>f.broker.describe(r.id,'wrong'),/UNAVAILABLE/);
 const sealed=await seal(secret,r.metadata,r.metadata.spki,webcrypto),other=await seal('other',r.metadata,r.metadata.spki,webcrypto);
 const outcomes=await Promise.allSettled([f.broker.submit(r.id,r.token,sealed),f.broker.submit(r.id,r.token,other)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 const cancelled=f.create();f.broker.revoke('nova',cancelled.id);assert.throws(()=>f.broker.describe(cancelled.id,cancelled.token),/UNAVAILABLE/);
 const expired=f.create();f.advance();assert.equal(f.broker.status('nova',expired.id).state,'expired');assert.throws(()=>f.broker.describe(expired.id,expired.token),/UNAVAILABLE/);
 }finally{f.close();}});
test('lost receiver acknowledgement and broker/receiver restart preserve the same receipt without a new secret write',async()=>{const f=fixture();try{
 const r=f.create(),sealed=await seal(secret,r.metadata,r.metadata.spki,webcrypto);f.setLost();assert.equal((await f.broker.submit(r.id,r.token,sealed)).state,'sealed');
 const before=f.rs.get(r.id);f.bs.close();f.rs.close();
 const bs=openStore(join(f.root,'broker.sqlite')),rs=openStore(join(f.root,'receiver.sqlite'));
 try{const receiver=createReceiver({tenant:'family',namespace:'familyclaw',target:'hetzner-storage',names:['HETZNER_STORAGE_TOKEN'],privateKey:keys.privateKey,publicKey,store:rs});
 const broker=createBroker({store:bs,targets:[{id:'hetzner-storage',tenant:'family',namespace:'familyclaw',clients:['nova'],names:['HETZNER_STORAGE_TOKEN'],publicKey}],publicOrigin:'https://secrets.example.ts.net',deliver:async(_,body)=>receiver.accept(body)});
 assert.equal((await broker.submit(r.id,r.token,sealed)).state,'stored');assert.equal(rs.get(r.id).receipt,before.receipt);assert.equal(rs.get(r.id).envelopeHash,before.envelopeHash);
 }finally{bs.close();rs.close();}
 }finally{rmSync(f.root,{recursive:true,force:true});}});
test('rotated credential versions are distinct; namespace revocation is idempotent and stops further use',async()=>{const f=fixture();try{
 const first=f.create(),second=f.create();const a=await f.broker.submit(first.id,first.token,await seal('old-secret',first.metadata,first.metadata.spki,webcrypto));const b=await f.broker.submit(second.id,second.token,await seal('new-secret',second.metadata,second.metadata.spki,webcrypto));assert.notEqual(a.reference,b.reference);
 const row=f.rs.get(first.id),receipt=f.receiver.revoke({metadata:row.metadata,envelopeHash:row.envelopeHash});assert.equal(f.receiver.revoke({metadata:row.metadata,envelopeHash:row.envelopeHash}),receipt);
 await assert.rejects(f.receiver.use(a.reference,()=>assert.fail()),/UNAVAILABLE/);assert.equal(await f.receiver.use(b.reference,p=>p.toString()),'new-secret');
 assert.throws(()=>f.receiver.accept({metadata:row.metadata,sealed:row.sealed,envelopeHash:row.envelopeHash}),/CONFLICT/);
 }finally{f.close();}});

test('Hetzner probe uses the fixed HTTPS destination inside the consumer and never returns provider data/errors',async()=>{const {probeHetznerStorage}=await import('../src/secret-input/hetzner.mjs');const f=fixture();try{
 const r=f.create(),result=await f.broker.submit(r.id,r.token,await seal('synthetic-hetzner-token',r.metadata,r.metadata.spki,webcrypto));
 const probe=await probeHetznerStorage(f.receiver,result.reference,async(url,request)=>{assert.equal(url,'https://api.hetzner.com/v1/storage_boxes?per_page=1');assert.equal(request.headers.authorization,'Bearer synthetic-hetzner-token');assert.equal(request.redirect,'error');return new Response(JSON.stringify({storage_boxes:[],unexpectedSecret:secret}));});assert.deepEqual(probe,{verified:true,kind:'hetzner-storage'});
 const denied=await probeHetznerStorage(f.receiver,result.reference,async()=>new Response(secret,{status:401}));assert.deepEqual(denied,{verified:false,kind:'hetzner-storage'});
 const failed=await probeHetznerStorage(f.receiver,result.reference,async()=>{throw Error(secret);});assert(!JSON.stringify(failed).includes(secret));
 }finally{f.close();}});

test('namespace key bootstrap persists only encrypted PKCS8, recovers its public identity and refuses silent root rotation',async()=>{
 const {provisionRecipient}=await import('../src/secret-input/provision-key.mjs');const {randomBytes}=await import('node:crypto');const {writeFileSync,unlinkSync}=await import('node:fs');
 const root=mkdtempSync(join(tmpdir(),'recipient-key-'));try{const pass=join(root,'master'),dir=join(root,'keys');writeFileSync(pass,randomBytes(32));
 const first=provisionRecipient(dir,pass);assert.match(readFileSync(join(dir,'private.pem'),'utf8'),/^-----BEGIN ENCRYPTED PRIVATE KEY-----/);assert.equal(provisionRecipient(dir,pass).keyId,first.keyId);
 unlinkSync(join(dir,'public.pem'));assert.deepEqual(provisionRecipient(dir,pass),first,'lost public metadata is reconstructed, not rotated');
 writeFileSync(pass,randomBytes(32));assert.throws(()=>provisionRecipient(dir,pass));assert.equal(readFileSync(join(dir,'public.pem'),'utf8'),first.publicKey);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('owner can reconcile or revoke an unconfirmed delivery without the browser; revocation fences a delayed write',async()=>{const f=fixture();try{
 const r=f.create(),sealed=await seal(secret,r.metadata,r.metadata.spki,webcrypto);f.setLost();assert.equal((await f.broker.submit(r.id,r.token,sealed)).state,'sealed');
 assert.equal((await f.broker.reconcile('nova',r.id)).state,'stored');
 const second=f.create();f.setLost();assert.equal((await f.broker.submit(second.id,second.token,await seal(secret,second.metadata,second.metadata.spki,webcrypto))).state,'sealed');
 assert.equal((await f.broker.revokeStored('nova',second.id)).state,'revoked');
 const delayed=f.create(),value=await seal(secret,delayed.metadata,delayed.metadata.spki,webcrypto),{digest}=await import('../src/secret-input/crypto.mjs');
 const body={metadata:f.bs.get(delayed.id).metadata,sealed:value,envelopeHash:digest(JSON.stringify(value))};
 f.receiver.revoke({metadata:body.metadata,envelopeHash:body.envelopeHash});assert.throws(()=>f.receiver.accept(body),/CONFLICT/);
 }finally{f.close();}});

test('retention frees expired/cancelled requests and revoked tombstones, preserving live references and expired replay refusal',async()=>{const f=fixture();try{
 const pending=f.create(),cancelled=f.create(),active=f.create(),retired=f.create();f.broker.revoke('nova',cancelled.id);
 const a=await f.broker.submit(active.id,active.token,await seal('active',active.metadata,active.metadata.spki,webcrypto));
 await f.broker.submit(retired.id,retired.token,await seal('retired',retired.metadata,retired.metadata.spki,webcrypto));const replay=f.rs.get(retired.id);await f.broker.revokeStored('nova',retired.id);
 f.advance(2*86400000);f.create();f.rs.prune(Date.now()+3*86400000);
 assert.equal(f.bs.get(pending.id),undefined);assert.equal(f.bs.get(cancelled.id),undefined);assert.equal(f.rs.get(retired.id),undefined);
 assert.equal(await f.receiver.use(a.reference,p=>p.toString()),'active');assert.equal(f.broker.status('nova',active.id).state,'stored');
 assert.throws(()=>f.receiver.accept({metadata:replay.metadata,sealed:replay.sealed,envelopeHash:replay.envelopeHash}),/EXPIRED/);
 }finally{f.close();}});
