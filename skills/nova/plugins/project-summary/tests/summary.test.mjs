import assert from 'node:assert/strict';
import {buildSummary} from '../dist/summary.js';
const summary=buildSummary({projectId:'api',runId:'run-1',status:'succeeded',metrics:{modulesTotal:4,modulesPassed:3,testsPassed:9,testsFailed:1,agentInvocations:2},diagnostics:['one']});
assert.equal(summary.deliveryPercent,75); assert.equal(summary.testPassPercent,90); assert.match(summary.markdown,/3\/4 \(75%\)/);
assert.throws(()=>buildSummary({projectId:'api',runId:'run',status:'failed',metrics:{modulesTotal:1,modulesPassed:2,testsPassed:0,testsFailed:0,agentInvocations:0}}));
console.log(JSON.stringify({ok:true,plugin:'kubeclaw.project-summary',suite:'summary'}));
