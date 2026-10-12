import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256Text, canonicalJson, PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';
import {coverageReviewRequirements, gateCoverageDigest} from '@kubeclaw/pipeline-test-gate-contract';
import {FileDurableBlobStore, FileDurableRecordStore} from '@kubeclaw/plugin-foundation/observability/durable-records';
import * as core from '../../../skills/nova/core/src/index.ts';
import {isReviewReport} from '../../../skills/nova/plugins/review/src/review-report-contract.ts';
import {snapshotReviewBundle} from '../../../skills/nova/plugins/review/src/review-bundle-snapshot.ts';
import {reviewEvidenceJson} from '../../../skills/nova/plugins/review/src/review-evidence-encoding.ts';

// Genuine original registered Review stage and local contract endpoint, NOT a
// successful model/Gateway claim. Core produces the lifecycle/lease/attempt;
// no manually constructed PluginContext or governor baseline is supplied.
const [root, profile, mode = 'legacy'] = process.argv.slice(2);
const checkout = fileURLToPath(new URL('../../../', import.meta.url));
const source = JSON.parse(fs.readFileSync(path.join(root, 'source.json'), 'utf8'));
const coverageUnsigned = {schemaVersion: 'gate-coverage.v1', kind: 'cumulative', projectId: 'app', baseRevision: source.base,
  modules: [{moduleId: 'app', ownedPaths: ['src'], requirements: [{id: 'works', statement: 'The tests pass.'}]}],
  integrationRequirements: [], requiredChecks: [{checkId: 'source-test', requirementRefs: [{moduleId: 'app', requirementId: 'works'}], nodeIds: ['source-test']}]};
const coverage = {...coverageUnsigned, policyDigest: gateCoverageDigest(coverageUnsigned)};
const state = path.join(root, `${Intl.DateTimeFormat().resolvedOptions().locale}-${profile}-${mode}`);
fs.mkdirSync(state, {recursive: true});
const artifactRoot = path.join(state, 'artifacts'), received = [];
const server = http.createServer((request, response) => {
  void (async () => {
    const chunks = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const bundle = payload.review?.bundle;
    assert.ok(bundle, 'original Review dispatch must contain its actual prepared bundle');
    received.push({bundle, requestHeaders: request.headers});
    const evidence = bundle.evidence.find(item => item.kind === 'test'); assert.ok(evidence);
    const reference = {kind: evidence.kind, digest: evidence.digest};
    // Exact accepted no-finding response shape from original live-function.test.ts.
    const result = {schemaVersion: 'echo-review-output.v1', summary: 'All acceptance evidence is present.',
      inspectedEvidence: [reference], requirementAssessments: Object.fromEntries(bundle.requirements.map(({id}) => [id, {
        assessment: 'satisfied', explanation: 'The supplied test evidence passed.', evidence: [reference],
      }])), proposedFindings: []};
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({result}));
  })().catch(error => {response.statusCode = 500; response.end(JSON.stringify({error: error.message}));});
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
process.env.KUBECLAW_SEMANTIC_PRODUCER_TOKEN = 'local-contract-fixture-token';
const roots = ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins'].map(p => path.join(checkout, p));
const registry = core.buildRegistry(core.discoverPackages({installationRoots: roots,
  trustPolicy: {trustedBuiltinRoots: roots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'test:semantic-producer'},
  now: () => new Date('2026-07-26T00:00:00Z')}));
const granted = core.resolveCapabilityGrants(registry, {
  enabledRegistrations: new Set(['kubeclaw.review:review', 'kubeclaw.repository-adapter:repository']),
  providers: new Map([['runtime.dispatch', 'kubeclaw.runtime-dispatch:runtime'], ['network.http', 'kubeclaw.network-http:http'],
    ['secrets.read', 'kubeclaw.secret-resolver:secrets'], ['git.repository.read', 'kubeclaw.repository-adapter:repository'],
    ['artifacts.read', 'kubeclaw.artifact-store:artifact-store'], ['artifacts.write', 'kubeclaw.artifact-store:artifact-store']]),
  grants: new Map([['kubeclaw.review:review', new Map([['runtime.dispatch', {allowedAgents: ['reviewer']}],
    ['git.repository.read', {allowedPrefixes: ['src']}], ['artifacts.read', {allowedNamespaces: ['kubeclaw.review']}],
    ['artifacts.write', {allowedNamespaces: ['kubeclaw.review']} ]])],
  ['kubeclaw.runtime-dispatch:runtime', new Map([['network.http', {allowedOrigins: [origin]}], ['secrets.read', {allowedNames: ['review-token']}]])]]),
});
const activated = await core.activateRegistry(granted.snapshot, new Set([...granted.grants.keys(), 'kubeclaw.repository-adapter:repository']));
const effects = new core.FileEffectJournal(path.join(state, 'effects.jsonl'));
const adapters = new core.AdapterRuntime({granted, activated, configs: new Map([
  ['kubeclaw.runtime-dispatch:runtime', {targets: {reviewer: {endpoint: `${origin}/dispatch`, tokenSecret: 'review-token'}}}],
  ['kubeclaw.network-http:http', {allowedOrigins: [origin], allowedMethods: ['POST'], allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature']}],
  ['kubeclaw.secret-resolver:secrets', {environment: {'review-token': 'KUBECLAW_SEMANTIC_PRODUCER_TOKEN'}}],
  ['kubeclaw.repository-adapter:repository', {repositoryRoot: source.repository, expectedHead: source.head}],
  ['kubeclaw.artifact-store:artifact-store', {artifactRoot}],
]), effects: new core.EffectCoordinator(effects, undefined, undefined, new core.MemoryResourceLockManager()),
  shutdownTimeoutMs: 1000, async emitDomainEvent() {}});
try {
  await adapters.start();
  const journal = new core.FileJournal(path.join(state, 'events.jsonl'));
  const definition = {schemaVersion: 'pipeline-definition.v2', id: `pipeline:semantic-${profile}`, maxConcurrency: 1,
    stages: [{id: 'review', type: 'kubeclaw.decision.review', dependsOn: [],
      config: {agent: 'reviewer', profile, reportArtifactEncoding: PORTABLE_JSON_ENCODING,
        ...(mode === 'portable' ? {reviewSemanticEncoding: 'review-semantics.utf16-v1'} : {})},
      input: {task: {id: 'TASK-1', statement: 'Review the implementation.'}, revisions: {base: source.base},
        scope: {allowedPrefixes: ['src']}, requirements: coverageReviewRequirements(coverage),
        evidence: [{kind: 'test', content: source.testOutput, digest: sha256Text(reviewEvidenceJson(source.testOutput))},
          {kind: 'gate-coverage', content: coverage, digest: sha256Text(canonicalJson(coverage))}], contextCandidates: []},
      execution: {maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5000}}]};
  const result = await new core.PipelineRunner({definition, registry: granted, activated, adapters, journal}).run(`run:semantic-${profile}`);
  const records = new FileDurableRecordStore(artifactRoot, {maximumRecords: 100000, maximumBytes: 256 * 1024 * 1024, maximumRecordBytes: 64 * 1024});
  const blobs = new FileDurableBlobStore(artifactRoot, 16 * 1024 * 1024);
  const stored = [];
  for (const {payload: ref} of await records.read('artifacts/kubeclaw.review')) {
    const bytes = await blobs.get(ref.digest), value = JSON.parse(bytes.toString('utf8'));
    assert.equal(sha256Text(bytes.toString('utf8')), ref.digest);
    stored.push({ref, value});
  }
  const bundle = stored.find(x => /^review-bundle\.v/u.test(x.value.schemaVersion));
  const report = stored.find(x => /^review-report\.v/u.test(x.value.schemaVersion));
  const lifecycle = journal.records();
  let bundleDigest = null, validReport = null;
  if (bundle) bundleDigest = snapshotReviewBundle(bundle.value).digest;
  if (report) validReport = isReviewReport(report.value);
  process.stdout.write(JSON.stringify({locale: Intl.DateTimeFormat().resolvedOptions().locale, profile, mode,
    source, status: result.status, stages: [...result.stages], actualCore: true, nativeGatewayOrModelProof: false,
    lifecycle, postCount: received.length, dispatched: received.map(x => x.bundle), stored, bundleDigest, validReport}) + '\n');
} finally {await adapters.shutdown(); await new Promise(resolve => server.close(resolve));}
