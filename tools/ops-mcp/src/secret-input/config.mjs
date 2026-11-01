import {readFileSync} from 'node:fs';
import {openStore} from './store.mjs';
import {createBroker} from './broker.mjs';
import {deliverEncrypted} from './delivery.mjs';
function load(file){
 if(!file)return undefined;
 const config=JSON.parse(readFileSync(file,'utf8'));
 if(Object.keys(config).sort().join(',')!=='publicOrigin,storeFile,targets,tls'||!Array.isArray(config.targets)||config.targets.length<1||config.targets.length>64)throw Error('INVALID_SECRET_INPUT_CONFIGURATION');
 for(const target of config.targets){const url=new URL(target.endpoint);if(url.protocol!=='https:'||url.pathname!=='/v1/secret-input'||url.search||url.hash||url.username||url.password)throw Error('INVALID_RECEIVER_ENDPOINT');}
 const load=p=>{if(typeof p!=='string'||!p.startsWith('/'))throw Error('INVALID_TLS_PATH');return readFileSync(p);};
 const tls={ca:load(config.tls.caFile),cert:load(config.tls.certFile),key:load(config.tls.keyFile)};
 const store=openStore(config.storeFile);
 const broker=createBroker({...config,store,deliver:(target,body)=>deliverEncrypted(target,body,tls),deliverRevocation:(target,body)=>deliverEncrypted({...target,endpoint:target.endpoint+'/revoke'},body,tls),deliverProbe:(target,body)=>deliverEncrypted({...target,endpoint:target.endpoint+'/probe'},body,tls,'probe')});
 return {broker,publicOrigin:config.publicOrigin,close:()=>store.close()};
}

export function loadSecretInput(file){
 try{return load(file);}catch{throw Error('SECRET_INPUT_CONFIGURATION_UNAVAILABLE');}
}
