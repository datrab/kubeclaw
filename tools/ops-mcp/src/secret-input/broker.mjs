import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {binding,digest,envelope,publicRecipient} from './crypto.mjs';
const label=/^[a-z0-9][a-z0-9-]{0,62}$/;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createBroker({store,targets,publicOrigin,clock=()=>Date.now(),deliver,deliverRevocation,deliverProbe}) {
 const origin=new URL(publicOrigin);if(origin.protocol!=='https:'||origin.origin!==publicOrigin)throw Error('HTTPS_ORIGIN_REQUIRED');
 const registry=new Map();
 for(const t of targets){
  if(![t.id,t.tenant,t.namespace].every(x=>label.test(x))||registry.has(t.id)||!Array.isArray(t.clients)||!t.clients.length||!Array.isArray(t.names)||!t.names.length||!t.names.every(x=>/^[A-Z][A-Z0-9_]{0,127}$/.test(x)))throw Error('INVALID_SECRET_TARGET');
  registry.set(t.id,Object.freeze({...t,...publicRecipient(t.publicKey)}));
 }
 function target(client,id){const t=registry.get(id);if(!t?.clients.includes(client))throw Error('SECRET_TARGET_FORBIDDEN');return t;}
 function owned(client,id){const r=store.get(id);if(!r||r.owner!==client)throw Error('SECRET_REQUEST_UNAVAILABLE');target(client,r.metadata.target);return r;}
 function publicStatus(r){return {requestId:r.id,tenant:r.metadata.tenant,namespace:r.metadata.namespace,target:r.metadata.target,name:r.metadata.name,state:r.state==='pending'&&clock()>=r.metadata.expiresAt?'expired':r.state,reference:r.state==='stored'?`secretref:${r.metadata.tenant}:${r.metadata.namespace}:${r.metadata.name}:${r.id}`:null,expiresAt:r.metadata.expiresAt};}
 function authorized(id,token){const r=store.get(id);if(!r||!same(r.tokenHash,digest(token??'')))throw Error('SECRET_REQUEST_UNAVAILABLE');return r;}
 async function reconcileRow(r){
  const t=target(r.owner,r.metadata.target);if(t.keyId!==r.metadata.keyId)throw Error('RECIPIENT_CHANGED');
  if(r.state==='sealed'){
   let receipt;try{receipt=await deliver(t,{metadata:r.metadata,sealed:r.sealed,envelopeHash:r.envelopeHash});}catch{return publicStatus(store.get(r.id));}
   if(receipt!==digest(binding(r.metadata)+':'+r.envelopeHash))throw Error('INVALID_RECEIVER_RECEIPT');
   store.finish(r.id,r.envelopeHash,receipt);
  }
  return publicStatus(store.get(r.id));
 }
 return {
  targets(client){return [...registry.values()].filter(t=>t.clients.includes(client)).map(t=>({id:t.id,tenant:t.tenant,namespace:t.namespace,names:t.names}));},
  create(client,id,name){store.prune(clock());const t=target(client,id);if(!t.names.includes(name))throw Error('SECRET_NAME_FORBIDDEN');if(store.countPending(client,clock())>=16||store.count()>=10000)throw Error('SECRET_REQUEST_LIMIT');
   const requestId=randomUUID(),token=randomBytes(32).toString('base64url');const metadata={requestId,tenant:t.tenant,namespace:t.namespace,target:t.id,name,keyId:t.keyId,expiresAt:clock()+600000};
   store.insert({id:requestId,owner:client,tokenHash:digest(token),metadata});
   return {...publicStatus(store.get(requestId)),url:publicOrigin+'/secret-input/#'+requestId+'.'+token};
  },
  status(client,id){return publicStatus(owned(client,id));},
  revoke(client,id){owned(client,id);store.revoke(id,client);return publicStatus(store.get(id));},
  async reconcile(client,id){return reconcileRow(owned(client,id));},
  async probe(client,id){const r=owned(client,id),t=target(client,r.metadata.target);if(r.state!=='stored'||t.probe!=='hetzner-storage'||!deliverProbe)throw Error('SECRET_PROBE_UNAVAILABLE');
   let result;try{result=await deliverProbe(t,{reference:publicStatus(r).reference});}catch{return {verified:false,kind:'hetzner-storage'};}
   if(result?.kind!=='hetzner-storage'||typeof result.verified!=='boolean')throw Error('INVALID_PROBE_RESULT');return {verified:result.verified,kind:'hetzner-storage'};
  },
  async revokeStored(client,id){let r=owned(client,id);if(r.state==='revoked')return publicStatus(r);if(!['stored','sealed','revoking'].includes(r.state)||!deliverRevocation)throw Error('SECRET_REVOCATION_UNAVAILABLE');
   const t=target(client,r.metadata.target);store.beginRevoke(id);r=store.get(id);
   try{const receipt=await deliverRevocation(t,{metadata:r.metadata,envelopeHash:r.envelopeHash});if(receipt!==digest('revoke:'+binding(r.metadata)+':'+r.envelopeHash))throw Error();store.revoked(id,r.envelopeHash,receipt);}catch{return publicStatus(store.get(id));}
   return publicStatus(store.get(id));
  },
  describe(id,token){const r=authorized(id,token);if(r.state!=='pending'||clock()>=r.metadata.expiresAt)throw Error('SECRET_REQUEST_UNAVAILABLE');const t=target(r.owner,r.metadata.target);if(t.keyId!==r.metadata.keyId)throw Error('RECIPIENT_CHANGED');return {...r.metadata,spki:t.spki};},
  async submit(id,token,input){let r=authorized(id,token);const t=target(r.owner,r.metadata.target);if(t.keyId!==r.metadata.keyId)throw Error('RECIPIENT_CHANGED');
   const sealed=envelope(input),hash=digest(JSON.stringify(sealed));
   if(r.state==='revoked'||(r.state==='pending'&&clock()>=r.metadata.expiresAt))throw Error('SECRET_REQUEST_UNAVAILABLE');
   if(r.state==='pending'){store.accept(id,r.tokenHash,sealed,hash);r=store.get(id);}
   if(r.envelopeHash!==hash)throw Error('SECRET_REQUEST_ALREADY_USED');
   return reconcileRow(r);
  }
 };
}
