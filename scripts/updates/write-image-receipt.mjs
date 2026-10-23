import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateBusterImageDelivery} from './buster-image-delivery.mjs';
const {IMAGE_NAME:name,IMAGE:image,GITHUB_SHA:commit}=process.env;
if(!/^[a-z0-9-]+$/u.test(name??'')||!/^ghcr\.io\/[a-z0-9_-]+\/kubeclaw-[a-z0-9-]+@sha256:[a-f0-9]{64}$/u.test(image??'')||!/^[a-f0-9]{40}$/u.test(commit??''))throw new Error('IMAGE_RECEIPT_IDENTITY_REQUIRED');
const receipt={name,image,commit};
if(name==='buster-runtime'){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'buster-delivery-receipt-'));let container;
 try{
  container=execFileSync('docker',['create',image],{encoding:'utf8'}).trim();
  const file=path.join(directory,'delivery.json');execFileSync('docker',['cp',`${container}:/opt/buster-image-tools/buster-delivery.json`,file]);
  receipt.busterDelivery=validateBusterImageDelivery(JSON.parse(fs.readFileSync(file,'utf8')),commit);
 }finally{if(container)execFileSync('docker',['rm',container],{stdio:'pipe'});fs.rmSync(directory,{recursive:true,force:true});}
}
fs.mkdirSync('dist/image-receipts',{recursive:true});fs.writeFileSync(`dist/image-receipts/${name}.json`,JSON.stringify(receipt)+'\n');
