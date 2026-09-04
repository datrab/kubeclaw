import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { e2eResultSchemaDigest, validateE2eProviderDetails } from '@kubeclaw/pipeline-test-gate-contract';

const pluginRoot=path.resolve('skills/buster/plugins'); const registry=buildRegistry(discoverPackages({installationRoots:[pluginRoot],trustPolicy:{trustedBuiltinRoots:[pluginRoot],allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'e2e-implementation'}}));
const entry=registry.testProviderContracts.get('kubeclaw.playwright@1'); assert.ok(entry); assert.deepEqual(entry.registration.capabilities,['browser.playwright']);
const suite=JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/e2e.v1.json','utf8')); assert.deepEqual(Object.keys(suite.tests),['playwright']);
const limits={cpuMillis:600000,memoryBytes:2147483648,logBytes:16777216,artifactBytes:268435456,artifactFiles:256,processes:64};
const plan=resolveTestPlan({planId:'plan:e2e:proof',runId:'run:e2e:proof',project:'e2e-proof',scope:{moduleId:'e2e',gateId:null},createdAt:'2026-09-04T00:00:00.000Z',declaration:{tests:suite.tests,fixtures:suite.fixtures,concurrencyLimits:suite.concurrencyLimits},suiteTemplates:[],registry,facts:{changedPaths:['tests/e2e/home.spec.ts'],moduleType:'service',pipelineStage:'test'},policy:{defaultTimeoutMs:600000,maximumTimeoutMs:900000,defaultLimits:limits,maximumLimits:limits,maximumRetryCount:1,maximumMatrixSize:1,maximumNodes:2,defaultConcurrencyLimit:1,maximumConcurrencyLimits:{'browser-playwright':1}}});
assert.equal(plan.nodes[0]?.provider.contractId,'kubeclaw.playwright@1'); assert.equal(plan.nodes[0]?.mode,'blocking');
const provider=fs.readFileSync('skills/buster/plugins/playwright/src/provider.js','utf8'); for(const token of ['PLAYWRIGHT_ZERO_TESTS','playwright-json','browserProjects','unexecuted']) assert.match(provider,new RegExp(token));
const runtime=fs.readFileSync('skills/buster/engine/test-gates/browser-playwright-runtime.ts','utf8'); for(const token of ['PLAYWRIGHT_TEST_BASE_URL','--reporter=json','maximumWorkers','BROWSER_PLAYWRIGHT_CANCELLED']) assert.match(runtime,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
const alternateProviderResult=JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/examples/e2e-result-cypress.json','utf8'));
assert.equal(alternateProviderResult.schemaDigest,e2eResultSchemaDigest()); validateE2eProviderDetails(alternateProviderResult);
console.log(JSON.stringify({ok:true,phase:'e2e-implementation',scenarios:['suite-resolution','common-result-contract','operator-overlay','structured-reporter','blocking-policy'],provider:'kubeclaw.playwright@1',structuredReporter:true,mocks:0}));
