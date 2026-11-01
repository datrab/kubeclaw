// Shared by the actual browser and synthetic WebCrypto acceptance tests.
export async function seal(value,metadata,spki,cryptoPort=globalThis.crypto) {
  const encode=s=>new TextEncoder().encode(s),b64=b=>{let s='';for(const n of new Uint8Array(b))s+=String.fromCharCode(n);return btoa(s);};
  const binding=JSON.stringify([1,metadata.requestId,metadata.tenant,metadata.namespace,metadata.target,metadata.name,metadata.keyId,metadata.expiresAt]);
  const label=encode(binding),plain=encode(value);if(!plain.length||plain.length>16384)throw Error('SECRET_SIZE');
  let raw;
  try {
    const publicKey=await cryptoPort.subtle.importKey('spki',Uint8Array.from(atob(spki),c=>c.charCodeAt(0)),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
    raw=cryptoPort.getRandomValues(new Uint8Array(32));const key=await cryptoPort.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
    const iv=cryptoPort.getRandomValues(new Uint8Array(12));
    const ciphertext=await cryptoPort.subtle.encrypt({name:'AES-GCM',iv,additionalData:label,tagLength:128},key,plain);
    const wrappedKey=await cryptoPort.subtle.encrypt({name:'RSA-OAEP',label},publicKey,raw);
    return {iv:b64(iv),wrappedKey:b64(wrappedKey),ciphertext:b64(ciphertext)};
  }finally {plain.fill(0);raw?.fill(0);}
}
