import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(), url=relative=>pathToFileURL(path.join(root,relative));
const {loadControlServerConfig}=await import(url('skills/prism/server/control-config.ts'));
const {loadWorkerConfig}=await import(url('skills/prism/server/worker-config.ts'));
const {prismNativeAttempt}=await import(url('skills/prism/engine/worker-envelope.ts'));
const {requirePrismResourcePoolCapacity}=await import(url('skills/prism/config/resource-policy.ts'));
const file=path.join(root,'charts/kubeclaw/files/config/swarm.config.json');
const env={SWARM_CONFIG:file,PRISM_SESSION_SECRET:'fixture',PRISM_INGRESS_SECRET:'fixture',PRISM_INGESTION_SECRET:'fixture',PRISM_DISPATCH_SECRET:'fixture',PRISM_WORKER_SECRET:'fixture',DATABASE_URL:'postgresql://not-opened'};
const policy=JSON.parse(fs.readFileSync(file)).operator.prism.native.resourcePolicy;
for(const [key,field] of [['PRISM_NATIVE_CPU_TIME_MS','cpuTimeMs'],['PRISM_NATIVE_MEMORY_BYTES','memoryBytes'],['PRISM_NATIVE_TASKS','tasks']]){
 for(const value of ['',String(policy[field])]) for(const load of [loadControlServerConfig,loadWorkerConfig]) assert.throws(()=>load({...env,[key]:value}),/SWARM_CONFIG_LEGACY_OVERRIDE/);
 console.log('both roles reject equal and empty legacy setting',key);
}
for(const snapshot of [loadControlServerConfig(env).nativeResourcePolicy,loadWorkerConfig(env).native.resourcePolicy]){
 assert.ok(Object.isFrozen(snapshot));assert.throws(()=>{snapshot.tasks=1},TypeError);assert.deepEqual(snapshot,policy);
}
const artifact={artifactId:'input:independent-resource',type:'prism-engine-input',mediaType:'application/json',contentDigest:'sha256:'+'a'.repeat(64),sizeBytes:2,storageUrl:'https://control.example/input'};
assert.throws(()=>prismNativeAttempt('render',artifact,'no-policy'),TypeError);
requirePrismResourcePoolCapacity({cpuTimeMs:Number.MAX_SAFE_INTEGER,memoryBytes:4096,tasks:7},{memoryBytes:4096,tasks:7,cpuQuotaMicroseconds:1});
console.log('nested snapshots frozen; omitted producer policy fails; cumulative CPU not compared with quota');
