import https from 'node:https';
/** Fixed deployment-owned endpoint; caller cannot choose a host or credentials. */
export function deliverEncrypted(target,body,tls,mode='receipt'){
 const url=new URL(target.endpoint);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('INVALID_RECEIVER_ENDPOINT');
 const encoded=Buffer.from(JSON.stringify(body));if(encoded.length>32768)throw Error('ENVELOPE_TOO_LARGE');
 return new Promise((resolve,reject)=>{
  const fail=()=>reject(Error('SECRET_DELIVERY_UNCONFIRMED'));
  const req=https.request(url,{method:'POST',ca:tls.ca,cert:tls.cert,key:tls.key,rejectUnauthorized:true,timeout:10000,headers:{'content-type':'application/json','content-length':encoded.length}},res=>{
   let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>1024){res.destroy();fail();}else chunks.push(chunk);});res.on('error',fail);res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks));if(res.statusCode!==200)return fail();if(mode==='probe'){if(Object.keys(value).sort().join(',')!=='kind,verified'||value.kind!=='hetzner-storage'||typeof value.verified!=='boolean')return fail();resolve(value);return;}if(Object.keys(value).join(',')!=='receipt'||!/^[a-f0-9]{64}$/.test(value.receipt))return fail();resolve(value.receipt);}catch{fail();}});
  });const timer=setTimeout(()=>req.destroy(),10000);timer.unref();req.once('close',()=>clearTimeout(timer));req.on('timeout',()=>req.destroy());req.on('error',fail);req.end(encoded);
 });
}
