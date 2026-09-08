import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {activate} from '../../../skills/nova/plugins/repository-adapter/src/adapter.ts';
import {readOpenClawResult} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-result.ts';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'repository-symlink-review-'));
try {
 const root=path.join(temporary,'repo'),outside=path.join(temporary,'outside');fs.mkdirSync(root);fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(root,'results'));
 const adapter=activate({config:{repositoryRoot:root}});await adapter.ready();
 const context={invokeConfidential:async(capability,operation)=>adapter.invoke({confidential:true,signal:new AbortController().signal,request:{...operation,capability,attempt:{attemptId:'review-attempt'}}})};
 await assert.rejects(context.invokeConfidential('git.repository.read',{operation:'read_text',resource:{canonicalId:'results/result.json'},payload:{}}),/REPOSITORY_FILE_NOT_FOUND/);
 const result=await readOpenClawResult(context,{repositoryRoot:root},{payload:{},relative:'results/result.json',key:'session-review',startedAt:new Date().toISOString(),state:{state:'completed',structured:{ok:true}},token:''});
 assert.deepEqual(result.result,{ok:true});assert.equal(fs.readFileSync(path.join(outside,'result.json'),'utf8'),'{"ok":true}');
 console.log(JSON.stringify({missingSymlinkTargetReportedAsMissing:true,originalCollectorWroteOutsideRepository:true}));await adapter.shutdown();
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
