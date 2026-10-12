import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root=process.cwd(), out=path.dirname(new URL(import.meta.url).pathname);
const loadPath=path.join(root,'skills/common/plugin-runtime/foundation/config/swarm.ts');
const configPath=path.join(root,'skills/prism/config/native-worker.ts');
const tmp=fs.mkdtempSync(path.join(out,'mutants-'));
const config=JSON.parse(fs.readFileSync('charts/kubeclaw/files/config/swarm.config.json','utf8'));
try {
 let source=fs.readFileSync(loadPath,'utf8').replace("new URL('./swarm.schema.json', import.meta.url)",JSON.stringify(path.join(path.dirname(loadPath),'swarm.schema.json')));
 const needle='settings.shutdownTimeoutMs <= supervisor.closeTimeoutMs + supervisor.drainTimeoutMs';assert(source.includes(needle));
 source=source.replace(needle,'settings.shutdownTimeoutMs <= supervisor.closeTimeoutMs');
 const loader=path.join(tmp,'loader.ts');fs.writeFileSync(loader,source);
 config.operator.prism.native.supervisor.drainTimeoutMs=15000;
 const file=path.join(tmp,'swarm.json');fs.writeFileSync(file,JSON.stringify(config));
 const actual=await import(pathToFileURL(loadPath));assert.throws(()=>actual.loadPrismSettings({SWARM_CONFIG:file}),/SHUTDOWN_BUDGET_INVALID/);
 const mutant=await import(pathToFileURL(loader));assert.doesNotThrow(()=>mutant.loadPrismSettings({SWARM_CONFIG:file}));
 console.log('DETECTED: dropped drain budget admits a configuration rejected by the real startup loader');
 let numeric=fs.readFileSync(configPath,'utf8').replace("'./resource-policy.ts'",JSON.stringify(pathToFileURL(path.join(path.dirname(configPath),'resource-policy.ts')).href));
 assert(numeric.includes('maximumOutputBytes: supervisor.maximumOutputBytes'));
 numeric=numeric.replace('maximumOutputBytes: supervisor.maximumOutputBytes','maximumOutputBytes: 8');
 const mapping=path.join(tmp,'mapping.ts');fs.writeFileSync(mapping,numeric);
 const production=await import(pathToFileURL(configPath)), changed=await import(pathToFileURL(mapping));
 const worker={native:{...config.operator.prism.native,supervisor:{...config.operator.prism.native.supervisor,maximumOutputBytes:16}},ingress:{maximumInputBytes:100}};
 const {NativeWorkerOutputSpool}=await import(pathToFileURL(path.join(root,'skills/worker/core/worker/native-output-spool.ts')));
 for(const [name,module,accepted] of [['actual',production,true],['mutant',changed,false]]){
  const spool=await NativeWorkerOutputSpool.create(path.join(tmp,name),module.prismSupervisorSettings(worker).maximumOutputBytes);
  try {if(accepted)await spool.append('stdout',Buffer.alloc(9));else await assert.rejects(spool.append('stdout',Buffer.alloc(9)),/WORKER_OUTPUT_SPOOL_LIMIT/);}finally{await spool.close();}
 }
 console.log('DETECTED: competing hardcoded output default changes actual filesystem spool acceptance');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
