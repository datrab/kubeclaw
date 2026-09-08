import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {activate as repository} from '../../../skills/nova/plugins/repository-adapter/src/adapter.ts';
import {activate as artifacts} from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import {execute} from '../../../skills/nova/plugins/delivery-lint/src/stage.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'delivery-review-'));
const attempt={runId:'delivery:review',stageId:'delivery',attemptId:'delivery:1',attemptNumber:1};
const repo=repository({config:{repositoryRoot:root}}),store=artifacts({config:{artifactRoot:path.join(root,'artifacts')}});
let sequence=0;
try{
 await repo.ready();await store.ready();
 const context={invoke:async(capability,request)=>(capability==='git.repository.read'?repo:store).invoke({confidential:true,signal:new AbortController().signal,request:{...request,capability,attempt,idempotencyKey:`delivery:${++sequence}`}})};
 fs.writeFileSync(path.join(root,'Dockerfile'),'FROM scratch\nCOPY ["dist", "public"]\n');
 const result=await execute({moduleId:'web',dockerfile:'Dockerfile',staticPath:'public'},context);
 assert.equal(result.outcome,'request_fix');console.log(JSON.stringify({validJsonCopyRejected:true,outcome:result.outcome,code:result.reason.code}));
}finally{await repo.shutdown();await store.shutdown();fs.rmSync(root,{recursive:true,force:true});}
