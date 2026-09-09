import test from 'node:test';
import assert from 'node:assert/strict';
import {agentPrompt} from '../server/agent-prompt.mjs';

test('original agent prompt consumes the immutable preference snapshot and exact durable action fence',()=>{
 const preferences={generationId:'generation-one',snapshotDigest:'sha256:exact-evidence',request:{architecture:'immutable-round-source'},snapshot:{subjectId:'user-one',projectId:'project-two',events:[{eventId:'personal-from-project-one'}]}};
 const job={id:'generation-one',fence:'claim-fence',operation:'design-set',request:{projectId:'project-two',request:{architecture:'untrusted-top-level-source'},preferences}};
 const prompt=agentPrompt(job);
 assert.match(prompt,/immutable-round-source/);assert.doesNotMatch(prompt,/untrusted-top-level-source/);
 assert.match(prompt,/personal-from-project-one/);assert.match(prompt,/generation-one/);assert.match(prompt,/sha256:exact-evidence/);assert.match(prompt,/claim-fence/);
 assert.throws(()=>agentPrompt({...job,request:{projectId:'project-two'}}));
});
