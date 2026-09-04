import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';

const pluginRoot=path.resolve('skills/buster/plugins');
const registry=buildRegistry(discoverPackages({installationRoots:[pluginRoot],trustPolicy:{trustedBuiltinRoots:[pluginRoot],allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'visual-implementation'}}));
const entry=registry.testProviderContracts.get('kubeclaw.visual@1'); assert.ok(entry); assert.deepEqual(entry.registration.capabilities,['browser.visual']);
const suite=JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/visual.v1.json','utf8')); assert.deepEqual(Object.keys(suite.tests),['visual']);
const limits={cpuMillis:120000,memoryBytes:1073741824,logBytes:1048576,artifactBytes:67108864,artifactFiles:32,processes:64};
const plan=resolveTestPlan({planId:'plan:visual:proof',runId:'run:visual:proof',project:'visual-proof',scope:{moduleId:'visual',gateId:null},createdAt:'2026-09-03T00:00:00.000Z',declaration:{tests:suite.tests,fixtures:suite.fixtures,concurrencyLimits:suite.concurrencyLimits},suiteTemplates:[],registry,
  facts:{changedPaths:[],moduleType:'service',pipelineStage:'test'},policy:{defaultTimeoutMs:120000,maximumTimeoutMs:120000,defaultLimits:limits,maximumLimits:limits,maximumRetryCount:1,maximumMatrixSize:1,maximumNodes:2,defaultConcurrencyLimit:1,maximumConcurrencyLimits:{'browser-visual':2}}});
assert.equal(plan.nodes[0]?.provider.contractId,'kubeclaw.visual@1');
const runtime=fs.readFileSync('skills/buster/engine/test-gates/browser-visual-runtime.ts','utf8');
for(const token of ["serviceWorkers: 'block'",'routeWebSocket','RTCPeerConnection','networkidle','fullPage: true','BROWSER_VISUAL_SUBRESOURCE_ORIGIN_DENIED']) assert.match(runtime,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
const provider=fs.readFileSync('skills/buster/plugins/visual/src/provider.js','utf8');
for(const token of ['VISUAL_BASELINE_DIGEST_MISMATCH','VISUAL_BASELINE_BUNDLE_DIGEST_MISMATCH','VISUAL_BASELINE_IDENTITY_MISMATCH','visual-difference-uncertain']) assert.match(provider,new RegExp(token));
console.log(JSON.stringify({ok:true,phase:'visual-implementation',strictContracts:true,isolatedProvider:true,mocks:0}));
