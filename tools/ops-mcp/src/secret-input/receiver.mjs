import {binding,digest,decrypt,envelope,publicRecipient} from './crypto.mjs';
/** Instantiate only inside the destination namespace. Consumers are internal code, never MCP tools. */
export function createReceiver({store,tenant,namespace,target,names,privateKey,publicKey,clock=()=>Date.now()}){
 const recipient=publicRecipient(publicKey);
 function validate(body){
  const m=body?.metadata;
  if(!m||Object.keys(m).sort().join(',')!=='expiresAt,keyId,name,namespace,requestId,target,tenant'||m.tenant!==tenant||m.namespace!==namespace||m.target!==target||!names.includes(m.name)||m.keyId!==recipient.keyId||!Number.isSafeInteger(m.expiresAt)||!/^[a-f0-9-]{36}$/.test(m.requestId))throw Error('SECRET_TARGET_FORBIDDEN');
  const sealed=envelope(body.sealed);if(digest(JSON.stringify(sealed))!==body.envelopeHash)throw Error('SECRET_ENVELOPE_CHANGED');return {m,sealed};
 }
 return {
  accept(body){const {m,sealed}=validate(body);const hash=body.envelopeHash;let existing=store.get(m.requestId);
   if(existing){if(existing.envelopeHash!==hash||binding(existing.metadata)!==binding(m)||existing.state!=='stored')throw Error('SECRET_REQUEST_CONFLICT');return existing.receipt;}
   if(clock()>=m.expiresAt)throw Error('SECRET_REQUEST_EXPIRED');
   store.prune(clock());if(store.count()>=10000)throw Error('SECRET_STORE_LIMIT');
   const plain=decrypt(sealed,m,privateKey);plain.fill(0);
   // Commit ciphertext and its receipt together; a crash cannot leave a
   // partially applied credential that would need plaintext recovery.
   const receipt=digest(binding(m)+':'+hash);
   store.receive({id:m.requestId,owner:target,metadata:m},sealed,hash,receipt);
   existing=store.get(m.requestId);
   if(existing.envelopeHash!==hash||binding(existing.metadata)!==binding(m)||existing.receipt!==receipt)throw Error('SECRET_REQUEST_CONFLICT');
   return receipt;
  },
  revoke(body){
   const m=body?.metadata,r=m&&store.get(m.requestId);
   if(!m||Object.keys(m).sort().join(',')!=='expiresAt,keyId,name,namespace,requestId,target,tenant'||m.tenant!==tenant||m.namespace!==namespace||m.target!==target||!names.includes(m.name)||m.keyId!==recipient.keyId||!Number.isSafeInteger(m.expiresAt)||!/^[a-f0-9-]{36}$/.test(m.requestId)||!/^[a-f0-9]{64}$/.test(body.envelopeHash))throw Error('SECRET_REVOCATION_FORBIDDEN');
   if(r&&(binding(r.metadata)!==binding(m)||r.envelopeHash!==body.envelopeHash||!['stored','revoked'].includes(r.state)))throw Error('SECRET_REVOCATION_FORBIDDEN');
   const receipt=digest('revoke:'+binding(m)+':'+body.envelopeHash);
   if(!r){store.prune(clock());if(m.expiresAt<clock()-86400000)return receipt;if(store.count()>=10000)throw Error('SECRET_STORE_LIMIT');store.tombstone({id:m.requestId,owner:target,metadata:m},body.envelopeHash,receipt);}
   const current=store.get(m.requestId);if(!current||binding(current.metadata)!==binding(m)||current.envelopeHash!==body.envelopeHash||!store.revoked(m.requestId,body.envelopeHash,receipt))throw Error('SECRET_REVOCATION_FORBIDDEN');return receipt;
  },
  async use(reference,consume){
   const prefix=`secretref:${tenant}:${namespace}:`;if(typeof reference!=='string'||!reference.startsWith(prefix))throw Error('SECRET_REFERENCE_FORBIDDEN');
   const split=reference.slice(prefix.length).split(':');if(split.length!==2||!names.includes(split[0]))throw Error('SECRET_REFERENCE_FORBIDDEN');
   const r=store.get(split[1]);if(!r||r.state!=='stored'||r.metadata.name!==split[0])throw Error('SECRET_REFERENCE_UNAVAILABLE');
   const plain=decrypt(r.sealed,r.metadata,privateKey);try {return await consume(plain);}catch{throw Error('SECRET_CONSUMER_FAILED');}finally{plain.fill(0);}
  }
 };
}
