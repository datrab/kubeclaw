import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan, HttpRemotePlanTransport } from '../../../skills/nova/core/src/index.ts';
const root = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [root], trustPolicy: {
 trustedBuiltinRoots: [root], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'review-examples' } }));
const limits = { cpuMillis: 30000, memoryBytes: 536870912, logBytes: 1048576, artifactBytes: 1048576, artifactFiles: 16, processes: 16 };
const suitesRoot = 'contracts/pipeline-test-gate/v1/suites';
const suiteTemplates = fs.readdirSync(suitesRoot).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(suitesRoot,n),'utf8')));
for (const name of ['api-suite','tailscale-exposure']) {
 const example = JSON.parse(fs.readFileSync(`contracts/pipeline-test-gate/v1/examples/${name}.json`, 'utf8'));
 const declaration = name === 'api-suite' ? example.modules.api : example;
 let message = '';
 try { resolveTestPlan({ planId: 'plan:review', runId: 'run:review', project: 'review', scope: { moduleId: 'api', gateId: null },
 createdAt: '2026-09-07T00:00:00Z', registry, declaration, suiteTemplates,
 facts: { changedPaths: [], moduleType: null, pipelineStage: null }, policy: {
 defaultTimeoutMs: 30000, maximumTimeoutMs: 60000, defaultLimits: limits, maximumLimits: limits,
 maximumRetryCount: 1, maximumMatrixSize: 16, maximumNodes: 100, defaultConcurrencyLimit: 4, maximumConcurrencyLimits: {} } }); }
 catch (error) { message = String(error); }
 assert.match(message, /schemaId/); console.log(JSON.stringify({ example: name, rejected: message }));
}
assert.equal(new URL('http://[::1]:8080').hostname, '[::1]');
assert.throws(()=>new HttpRemotePlanTransport({ endpoint: 'http://[::1]:8080', authentication: 'spiffe-proxy', maximumResponseBytes: 1024 }), /SPIFFE_PROXY_NOT_LOOPBACK/);
console.log(JSON.stringify({ ipv6Loopback: '[::1]', spiffeProxy: 'rejected by original constructor' }));
