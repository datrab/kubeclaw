import {mkdirSync,readFileSync,writeFileSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {generateKeyPairSync,createPrivateKey,createPublicKey} from 'node:crypto';
import {publicRecipient} from './crypto.mjs';
import {pathToFileURL} from 'node:url';
/** Runs in the namespace init container, not in the agent. No plaintext key file. */
export function provisionRecipient(directory,passphraseFile){
 const passphrase=readFileSync(passphraseFile);if(passphrase.length<32){passphrase.fill(0);throw Error('MASTER_KEY_TOO_SHORT');}
 try{
  mkdirSync(directory,{recursive:true,mode:0o700});const privateFile=join(directory,'private.pem'),publicFile=join(directory,'public.pem');let privateKey;
  if(existsSync(privateFile)){const pem=readFileSync(privateFile,'utf8');if(!pem.startsWith('-----BEGIN ENCRYPTED PRIVATE KEY-----'))throw Error('ENCRYPTED_RECIPIENT_KEY_REQUIRED');privateKey=createPrivateKey({key:pem,passphrase});}
  else{privateKey=generateKeyPairSync('rsa',{modulusLength:3072}).privateKey;const encrypted=privateKey.export({type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase});const fd=openSync(privateFile,'wx',0o600);try{writeFileSync(fd,encrypted);fsyncSync(fd);}finally{closeSync(fd);}}
  const publicKey=createPublicKey(privateKey).export({type:'spki',format:'pem'}),recipient=publicRecipient(publicKey);
  if(existsSync(publicFile)){if(readFileSync(publicFile,'utf8')!==publicKey)throw Error('RECIPIENT_PUBLIC_KEY_CHANGED');}
  else{const fd=openSync(publicFile,'wx',0o600);try{writeFileSync(fd,publicKey);fsyncSync(fd);}finally{closeSync(fd);}}
  const dir=openSync(directory,'r');try{fsyncSync(dir);}finally{closeSync(dir);}
  return {keyId:recipient.keyId,publicKey};
 }finally{passphrase.fill(0);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(provisionRecipient(process.argv[2],process.argv[3])));}catch{process.stderr.write('Recipient provisioning failed; existing identity was not rotated\n');process.exitCode=1;}}
