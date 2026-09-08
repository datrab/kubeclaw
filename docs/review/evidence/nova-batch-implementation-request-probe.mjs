import assert from 'node:assert/strict';
import {buildRequest} from '../../../skills/nova/plugins/implementation-agent/src/protocol.ts';
const workspace={repositoryRoot:'/repo',workspacePath:'/worktrees/per-run/module-a',branch:'nova/module-a',baseRef:'HEAD',mergeTarget:'/repo',commitMessage:'module'};
const request=buildRequest('forge',{runId:'run:1',moduleId:'a',attempt:1,task:'Implement a',headBefore:'a'.repeat(40),workspace});
assert.equal(Object.hasOwn(request,'workspace'),false);assert.equal(JSON.stringify(request).includes(workspace.workspacePath),false);
console.log(JSON.stringify({worktreeCreatedFor:workspace.workspacePath,requestContainsWorktree:false}));
