import assert from'node:assert/strict';import{buildRequest,parseCaseStudy,requiredSections}from'../dist/protocol.js';
const input={projectId:'api',runId:'run-1',task:'Write.',facts:[{label:'Tests',value:'10 passed'}]};
assert.equal(buildRequest('writer',input).facts.length,1);
const markdown=requiredSections.map((section)=>`## ${section}\n\nEvidence.`).join('\n\n');
const valid={status:'generated',projectId:'api',runId:'run-1',markdown};assert.deepEqual(parseCaseStudy(valid,input),valid);
for(const bad of[{...valid,runId:'old'},{...valid,extra:true},{...valid,markdown:markdown.replace('## Challenge','## Context')}])assert.throws(()=>parseCaseStudy(bad,input));
console.log(JSON.stringify({ok:true,plugin:'kubeclaw.case-study',suite:'protocol'}));
