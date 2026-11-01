import {probeHetznerStorage} from './hetzner.mjs';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {createPrivateKey,createPublicKey} from 'node:crypto';
import {openStore} from './store.mjs';
import {createReceiver} from './receiver.mjs';
import {publicRecipient} from './crypto.mjs';
export function loadNamespaceReceiver(config){
 const encrypted=readFileSync(config.encryptedPrivateKeyFile,'utf8');
 if(!encrypted.startsWith('-----BEGIN ENCRYPTED PRIVATE KEY-----'))throw Error('ENCRYPTED_RECIPIENT_KEY_REQUIRED');
 const passphrase=readFileSync(config.passphraseFile);
 let privateKey;try{if(passphrase.length<32)throw Error('MASTER_KEY_TOO_SHORT');privateKey=createPrivateKey({key:encrypted,passphrase});}finally{passphrase.fill(0);}
 const publicKey=readFileSync(config.publicKeyFile,'utf8');
 if(publicRecipient(publicKey).keyId!==publicRecipient(createPublicKey(privateKey)).keyId)throw Error('RECIPIENT_KEY_MISMATCH');
 const store=openStore(config.storeFile);return {receiver:createReceiver({...config,privateKey,publicKey,store}),close:()=>store.close()};
}
export function serveNamespaceReceiver(config){
 if(config.provider && (config.provider!=='hetzner-storage'||JSON.stringify(config.names)!=='[\"HETZNER_STORAGE_TOKEN\"]'))throw Error('INVALID_PROVIDER_BINDING');
 const {receiver,close}=loadNamespaceReceiver(config);
 if(!/^[a-f0-9]{64}$/.test(config.brokerCertificateFingerprint))throw Error('BROKER_CERTIFICATE_PIN_REQUIRED');
 const server=https.createServer({ca:readFileSync(config.tls.caFile),cert:readFileSync(config.tls.certFile),key:readFileSync(config.tls.keyFile),requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.3'},async(req,res)=>{
  const fingerprint=req.socket.getPeerCertificate().fingerprint256?.replaceAll(':','').toLowerCase();
  if(!req.socket.authorized||fingerprint!==config.brokerCertificateFingerprint){res.writeHead(403);res.end();return;}
  if(req.method!=='POST'||!['/v1/secret-input','/v1/secret-input/revoke','/v1/secret-input/probe'].includes(req.url)||req.headers['content-type']!=='application/json'){res.writeHead(404);res.end();return;}
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768)throw Error();chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(req.url.endsWith('/probe')){if(config.provider!=='hetzner-storage'||Object.keys(body).join(',')!=='reference')throw Error();const result=await probeHetznerStorage(receiver,body.reference);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));return;}const receipt=req.url.endsWith('/revoke')?receiver.revoke(body):receiver.accept(body);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({receipt}));
  }catch{res.writeHead(409,{'Cache-Control':'no-store'});res.end();}
 });server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=20;server.once('close',close);return server;
}
if(import.meta.url===new URL(process.argv[1]??'', 'file:').href){
 try{const config=JSON.parse(readFileSync(process.argv[2],'utf8')),server=serveNamespaceReceiver(config);server.listen(config.port??8443,'0.0.0.0');
 const stop=()=>server.close(()=>process.exit(0));process.once('SIGTERM',stop);process.once('SIGINT',stop);
 }catch{process.stderr.write('Secret receiver startup failed; check trusted configuration\n');process.exitCode=1;}
}
