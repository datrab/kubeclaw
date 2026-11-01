import {createHash, createPublicKey, privateDecrypt, constants, createDecipheriv} from 'node:crypto';
export const binding = value => JSON.stringify([1,value.requestId,value.tenant,value.namespace,value.target,value.name,value.keyId,value.expiresAt]);
export const digest = value => createHash('sha256').update(value).digest('hex');
export function publicRecipient(pem) {
  if(typeof pem==='string'&&!pem.startsWith('-----BEGIN PUBLIC KEY-----'))throw Error('PUBLIC_KEY_REQUIRED');
  const key=pem?.type==='public'?pem:createPublicKey(pem);
  if(key.asymmetricKeyType!=='rsa' || (key.asymmetricKeyDetails.modulusLength<3072||key.asymmetricKeyDetails.modulusLength>8192)) throw Error('INVALID_RECIPIENT_KEY');
  const spki=key.export({type:'spki',format:'der'});
  return {keyId:digest(spki),spki:spki.toString('base64')};
}
export function bytes(value,min,max) {
  if(typeof value!=='string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw Error('INVALID_ENVELOPE');
  const b=Buffer.from(value,'base64');if(b.length<min||b.length>max||b.toString('base64')!==value)throw Error('INVALID_ENVELOPE');return b;
}
export function envelope(value) {
  if(!value || Object.keys(value).sort().join(',')!=='ciphertext,iv,wrappedKey')throw Error('INVALID_ENVELOPE');
  bytes(value.iv,12,12);bytes(value.wrappedKey,384,1024);bytes(value.ciphertext,17,16400);
  return {iv:value.iv,wrappedKey:value.wrappedKey,ciphertext:value.ciphertext};
}
/** Namespace-consumer only. Never register this function as an MCP tool. */
export function decrypt(input, metadata, privateKey) {
  let key,plain;
  try {
    const e=envelope(input),label=Buffer.from(binding(metadata));
    key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256',oaepLabel:label},bytes(e.wrappedKey,384,1024));
    if(key.length!==32)throw Error();
    const ciphertext=bytes(e.ciphertext,17,16400),decipher=createDecipheriv('aes-256-gcm',key,bytes(e.iv,12,12));
    decipher.setAAD(label);decipher.setAuthTag(ciphertext.subarray(-16));
    plain=Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]);return plain;
  }catch {plain?.fill(0);throw Error('SECRET_DECRYPTION_FAILED');}
  finally {key?.fill(0);}
}
