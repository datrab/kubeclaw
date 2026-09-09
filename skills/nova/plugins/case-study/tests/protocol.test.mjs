import assert from'node:assert/strict';import{buildRequest,parseCaseStudy,requiredSections}from'../src/protocol.ts';
const execution={runId:'run:executor',stageId:'report',attemptId:'attempt:real-contract',attemptNumber:2};
const input={projectId:'api',runId:'run-1',task:'Write.',facts:[{label:'Tests',value:'10 passed'}]};
assert.equal(buildRequest('writer',input,execution).facts.length,1);
const markdown=requiredSections.map((section)=>`## ${section}\n\nEvidence.`).join('\n\n');
const valid={status:'generated',markdown};assert.deepEqual(parseCaseStudy(valid,input,execution),{...valid,projectId:'api',runId:execution.runId,execution,reportTarget:{projectId:'api',runId:'run-1'},evidenceStatus:'unverified-caller-input',facts:input.facts});
for(const bad of[{...valid,identity:{projectId:'api',runId:'run-1'}},{...valid,extra:true},{...valid,markdown:markdown.replace('## Challenge','## Context')}])assert.throws(()=>parseCaseStudy(bad,input,execution));
console.log(JSON.stringify({ok:true,plugin:'kubeclaw.case-study',suite:'protocol'}));
