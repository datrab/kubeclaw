import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../src/secret-input/store.mjs';
import {createBroker} from '../../src/secret-input/broker.mjs';
import {createReceiver} from '../../src/secret-input/receiver.mjs';
export const keys=generateKeyPairSync('rsa',{modulusLength:3072});export const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
export const secret='SYNTHETIC-private-credential-ß-\n-20261101';
export function fixture(){const root=mkdtempSync(join(tmpdir(),'secure-input-'));let now=Date.now();
 const bs=openStore(join(root,'broker.sqlite')),rs=openStore(join(root,'receiver.sqlite'));
 const target={id:'hetzner-storage',tenant:'family',namespace:'familyclaw',clients:['nova'],names:['HETZNER_STORAGE_TOKEN'],publicKey};
 const receiver=createReceiver({...target,target:target.id,privateKey:keys.privateKey,store:rs,clock:()=>now});let calls=0,lost=false;
 const broker=createBroker({store:bs,targets:[target],publicOrigin:'https://secrets.example.ts.net',clock:()=>now,deliver:async(_,body)=>{calls++;const receipt=receiver.accept(body);if(lost){lost=false;throw Error('lost');}return receipt;},deliverRevocation:async(_,body)=>receiver.revoke(body)});
 const create=()=>{const request=broker.create('nova',target.id,target.names[0]);const [id,token]=new URL(request.url).hash.slice(1).split('.');const metadata=broker.describe(id,token);return {request,id,token,metadata};};
 return {root,bs,rs,broker,receiver,create,setLost:()=>{lost=true;},calls:()=>calls,advance:(ms=600001)=>{now+=ms;},close:()=>{bs.close();rs.close();rmSync(root,{recursive:true,force:true});}};
}
