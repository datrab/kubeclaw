import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
export function loadOpsDeploymentPolicy(file){
 const canonical=fs.realpathSync(file),p=JSON.parse(fs.readFileSync(canonical,'utf8'));
 const keys=['schemaVersion','namespace','release','valuesFile','kubectlRequestTimeoutSeconds','readNamespaces','copyPullSecret','pullSecretSourceNamespace','bearerTokenEntropyBytes','helmHistoryMax'];
 const name=v=>typeof v==='string'&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v);
 const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join(',')!==keys.sort().join(',')||p.schemaVersion!=='ops-deployment-policy.v1'||!name(p.namespace)||!name(p.release)||!name(p.pullSecretSourceNamespace)||typeof p.copyPullSecret!=='boolean'||!Array.isArray(p.readNamespaces)||!p.readNamespaces.every(name)||new Set(p.readNamespaces).size!==p.readNamespaces.length||!integer(p.kubectlRequestTimeoutSeconds,1,2147483647)||!integer(p.helmHistoryMax,1,2147483647)||!integer(p.bearerTokenEntropyBytes,32,384)||(p.valuesFile!==null&&(typeof p.valuesFile!=='string'||!p.valuesFile||/[\0\r\n]/.test(p.valuesFile))))throw new Error('OPS_DEPLOYMENT_POLICY_INVALID');
 return Object.freeze({...p,readNamespaces:Object.freeze([...p.readNamespaces]),valuesFile:p.valuesFile===null?null:path.resolve(path.dirname(canonical),p.valuesFile)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const p=loadOpsDeploymentPolicy(process.argv[2]);if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(p),{flag:'wx',mode:0o400});process.stdout.write([p.namespace,p.release,p.helmHistoryMax,p.valuesFile??''].join('\n')+'\n');}
