import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {generateKeyPairSync,randomBytes,X509Certificate} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {serveNamespaceReceiver,loadNamespaceReceiver} from '../src/secret-input/namespace-server.mjs';
import {deliverEncrypted} from '../src/secret-input/delivery.mjs';
import {createBroker} from '../src/secret-input/broker.mjs';
import {openStore} from '../src/secret-input/store.mjs';
import {seal} from '../src/secret-input/browser.mjs';

test('real namespace mTLS validates hostname, client identity and encrypted key custody before accepting ciphertext',async()=>{
 const root=mkdtempSync(join(tmpdir(),'namespace-secret-tls-'));let server,bs;
 try{
  const p=n=>join(root,n);execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',p('tls.key'),'-out',p('tls.crt'),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-addext','extendedKeyUsage=serverAuth,clientAuth'],{stdio:'ignore'});
  const pair=generateKeyPairSync('rsa',{modulusLength:3072}),passphrase=randomBytes(32);writeFileSync(p('passphrase'),passphrase);
  const encrypted=pair.privateKey.export({type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase});writeFileSync(p('private.pem'),encrypted);writeFileSync(p('public.pem'),pair.publicKey.export({type:'spki',format:'pem'}));passphrase.fill(0);
  const config={tenant:'family',namespace:'familyclaw',target:'hetzner-storage',names:['HETZNER_STORAGE_TOKEN'],encryptedPrivateKeyFile:p('private.pem'),publicKeyFile:p('public.pem'),passphraseFile:p('passphrase'),storeFile:p('values.sqlite'),brokerCertificateFingerprint:new X509Certificate(readFileSync(p('tls.crt'))).fingerprint256.replaceAll(':','').toLowerCase(),tls:{caFile:p('tls.crt'),certFile:p('tls.crt'),keyFile:p('tls.key')}};
  writeFileSync(p('plaintext-key.pem'),pair.privateKey.export({type:'pkcs8',format:'pem'}));assert.throws(()=>loadNamespaceReceiver({...config,encryptedPrivateKeyFile:p('plaintext-key.pem')}),/ENCRYPTED_RECIPIENT_KEY_REQUIRED/);
  server=serveNamespaceReceiver(config);server.listen(0,'127.0.0.1');await once(server,'listening');
  const endpoint=`https://localhost:${server.address().port}/v1/secret-input`,tls={ca:readFileSync(p('tls.crt')),cert:readFileSync(p('tls.crt')),key:readFileSync(p('tls.key'))};
  bs=openStore(p('broker.sqlite'));const target={id:config.target,tenant:config.tenant,namespace:config.namespace,clients:['nova'],names:config.names,publicKey:readFileSync(p('public.pem'),'utf8'),endpoint};
  let body;const broker=createBroker({store:bs,targets:[target],publicOrigin:'https://secrets.example.ts.net',deliver:async(t,input)=>{body=input;return deliverEncrypted(t,input,tls);},deliverRevocation:(t,input)=>deliverEncrypted({...t,endpoint:t.endpoint+'/revoke'},input,tls)});
  const requested=broker.create('nova',target.id,target.names[0]),[id,token]=new URL(requested.url).hash.slice(1).split('.'),metadata=broker.describe(id,token);
  const result=await broker.submit(id,token,await seal('synthetic-TLS-input',metadata,metadata.spki));assert.equal(result.state,'stored');
  await assert.rejects(deliverEncrypted({...target,endpoint:endpoint.replace('localhost','127.0.0.1')},body,tls),/UNCONFIRMED/);
  await assert.rejects(deliverEncrypted(target,body,{ca:tls.ca}),/UNCONFIRMED/);
  assert.equal((await broker.revokeStored('nova',id)).state,'revoked');assert.equal(broker.status('nova',id).reference,null);
  assert(!readFileSync(p('broker.sqlite')).includes(Buffer.from('synthetic-TLS-input')));assert(!readFileSync(p('values.sqlite')).includes(Buffer.from('synthetic-TLS-input')));
 }finally{if(server)await new Promise(resolve=>server.close(resolve));bs?.close();rmSync(root,{recursive:true,force:true});}
});
