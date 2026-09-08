import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { executeRepositoryAudit } from '../../../skills/nova/plugins/review/src/repository-audit-stage.ts';
import { activate } from '../../../skills/nova/plugins/repository-adapter/src/adapter.ts';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const adapter=activate({config:{repositoryRoot:root}});
const attempt={runId:'scope-probe',stageId:'repository-audit',attemptId:'scope-probe-1',attemptNumber:0};
const context={contract:{config:{agent:'echo',reviewerModel:'gpt-5.6-terra',profile:'audit'},artifacts:[],lease:{attempt}},async invoke(capability,request){
 assert.equal(capability,'git.repository.read','scope should fail before artifacts or runtime');
 return adapter.invoke({request:{...request,capability,attempt},signal:new AbortController().signal,fence:{assertCurrent(){}},confidential:false});
}};
for(const scope of [{kind:'plugin',names:['review'],dependencyRadius:0},{kind:'path',prefixes:['skills/nova/plugins/review/']}]){
 await assert.rejects(executeRepositoryAudit({mode:'plan',scope},context),/REPOSITORY_PATH_FORBIDDEN/);
 console.log(JSON.stringify({probe:'actual-adapter-scope',scope,error:'REPOSITORY_PATH_FORBIDDEN'}));
}
