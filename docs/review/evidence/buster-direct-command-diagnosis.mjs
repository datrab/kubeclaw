import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DirectCommandCapabilityInvoker} from '../../../skills/buster/engine/test-gates/direct-command-runtime.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'buster-review-command-'));
const limits={maxOutputBytes:1048576,maxExecutionMs:5000,maximumProcesses:8,memoryBytes:536870912,cpuMillis:5000,openFiles:64};
const invoker=new DirectCommandCapabilityInvoker({workspaceRoot:root,executableCatalog:new Map([['node',process.execPath]]),executableSearchPath:[path.dirname(process.execPath)],runtimeReadRoots:[path.dirname(process.execPath),'/lib/x86_64-linux-gnu','/lib64','/etc/ssl'],maximumOutputBytes:limits.maxOutputBytes,maximumExecutionMs:5000,maximumProcesses:8,maximumMemoryBytes:limits.memoryBytes,maximumCpuMillis:5000,terminationGraceMs:50,allowSampledProcessLimit:true});
try {const r=await invoker.invoke('command.execute',{operation:'run',resource:{type:'command.executable',canonicalId:'catalog:node'},payload:{args:['-e','process.stdout.write("original-command-probe")'],workingDirectory:root,writableRoot:root,environment:{CI:'true'},limits}},new AbortController().signal);console.log(JSON.stringify(r));} finally {await invoker.shutdown();fs.rmSync(root,{recursive:true,force:true});}
