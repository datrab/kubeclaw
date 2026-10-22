import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {canonicalJson,sha256Text} from '@kubeclaw/plugin-sdk';
import {captureReviewPolicy} from '../../../skills/common/plugin-runtime/foundation/config/review-owned-policy.ts';
import {selectedRepositoryGrades,parseRepositoryReviewInput} from '../../../skills/nova/plugins/review/src/repository-review-profile.ts';
import {ReviewDispatchBudget,reserveReviewRuntimePrompt,reserveReviewAttempts} from '../../../skills/nova/plugins/review/src/review-prompt-budget.ts';
import {compileScalableReview} from '../../../skills/nova/plugins/review/src/scalable-review-compiler.ts';
import {parseReviewSnapshotInventory} from '../../../skills/nova/plugins/review/src/review-snapshot-inventory.ts';
import {getReviewPolicyProfile} from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';
const settings=JSON.parse(fs.readFileSync('config/plugins/kubeclaw.review/profiles/standard.config.json','utf8')).profiles.standard.settings;
delete settings.cacheReadConcurrency;settings.schemaVersion='review-owned-decision-profiles.v3';
const target={tokenizerEncoding:'o200k_base',maxInputTokens:120000,maxOutputTokens:6000,maxContextTokens:128000,maxPromptBytes:900000};
const capture=value=>captureReviewPolicy({schemaVersion:'review-policy-capture.v1',source:{file:'/original/review.json',profile:'standard'},settings:value});
const resolved=value=>parseRepositoryReviewInput({grade:'fast'},selectedRepositoryGrades({ownedPolicyProfiles:capture(value).settings,repositoryRuntimeTarget:target}));
test('v3 requires an explicit valid reserve; old captures reject the new author and preserve their exact shape',()=>{
 for(const bad of [undefined,null,-1,0.5,'64',1000001]) {
  const value=structuredClone(settings);if(bad===undefined)delete value.promptTokenBoundaryReserve;else value.promptTokenBoundaryReserve=bad;
  assert.throws(()=>capture(value),/CAPTURE_INVALID/);
  assert.throws(()=>selectedRepositoryGrades({ownedPolicyProfiles:value,repositoryRuntimeTarget:target}),/RESERVE_INVALID/);
 }
 assert.equal(resolved({...settings,promptTokenBoundaryReserve:0}).promptTokenBoundaryReserve,0);
 for(const version of ['v1','v2']) {
  const old={...settings,schemaVersion:'review-owned-decision-profiles.'+version};delete old.promptTokenBoundaryReserve;if(version==='v1')delete old.repositoryGrades;
  assert.deepEqual(capture(old).settings,old);assert(!Object.hasOwn(capture(old).settings,'promptTokenBoundaryReserve'));
  assert.throws(()=>capture({...old,promptTokenBoundaryReserve:64}),/CAPTURE_INVALID/);
  assert.throws(()=>getReviewPolicyProfile('gate',{...old,promptTokenBoundaryReserve:64}),/OWNED_POLICY_INVALID/);
  if(version==='v2'){assert.equal(resolved(old).schemaVersion,'repository-review-profile.v1');assert(!Object.hasOwn(resolved(old),'promptTokenBoundaryReserve'));}
 }
});
test('selected A/B reserve changes retry accounting and actual dispatch admission without changing bytes or payload',()=>{
 const a=resolved(settings),b=resolved({...settings,promptTokenBoundaryReserve:256});assert.notEqual(a.digest,b.digest);
 const payload={task:'review original source'};
 const ma=reserveReviewRuntimePrompt(payload,a.tokenizerEncoding,a.promptTokenBoundaryReserve),mb=reserveReviewRuntimePrompt(payload,b.tokenizerEncoding,b.promptTokenBoundaryReserve);
 assert.equal(mb.tokens-ma.tokens,192);assert.equal(ma.bytes,mb.bytes);assert.equal(ma.payloadTokens,mb.payloadTokens);
 const retry=reserveReviewAttempts([payload,payload],b.tokenizerEncoding,2,1,b.promptTokenBoundaryReserve);assert.equal(retry.attempts,3);assert.equal(retry.inputTokens,mb.tokens*3);
 const cap=profile=>({...profile,maxInputTokensPerJob:ma.tokens,maxContextTokensPerJob:ma.tokens+profile.maxOutputTokensPerJob});
 const ba=new ReviewDispatchBudget(cap(a));assert.equal(ba.reserve(payload).runtimePromptBudget.reservedInputTokens,ma.tokens);
 const bb=new ReviewDispatchBudget(cap(b));assert.throws(()=>bb.reserve(payload),/context budget/);assert.equal(bb.snapshot().calls,0);
 assert.equal(reserveReviewRuntimePrompt(payload,'o200k_base').tokens,ma.tokens,'retained historical codec stays at original64');
});
test('the real scalable compiler accounts the selected reserve for every unchanged job and rejects unfittable selection',()=>{
 const content='export const value = 1;\n',documents=[{path:'src/a.ts',content}];
 const files=[{path:'src/a.ts',objectId:createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex'),mode:'100644',sizeBytes:Buffer.byteLength(content)}];
 const snapshot=parseReviewSnapshotInventory({head:'a'.repeat(40),files,inventoryDigest:sha256Text(canonicalJson(files))});
 const values={snapshot,documents,sourceDigests:new Map([['src/a.ts',sha256Text(content)]])};
 const a=compileScalableReview({...values,profile:resolved(settings)}),b=compileScalableReview({...values,profile:resolved({...settings,promptTokenBoundaryReserve:256})});
 assert.deepEqual(a.jobs,b.jobs);assert(a.jobs.length>0);assert.equal(b.accounting.estimatedInputTokens-a.accounting.estimatedInputTokens,192*a.jobs.length);
 assert.equal(b.accounting.reservedPromptBytes,a.accounting.reservedPromptBytes);
 assert.throws(()=>compileScalableReview({...values,profile:resolved({...settings,promptTokenBoundaryReserve:1000000})}),/budget|exceeds/);
});
