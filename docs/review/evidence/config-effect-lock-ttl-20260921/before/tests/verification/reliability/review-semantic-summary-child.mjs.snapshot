import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DELIVERY_MANIFEST_ENCODING } from '@kubeclaw/delivery-manifest-contract';
import { portableJson, PORTABLE_JSON_ENCODING, sha256Text } from '@kubeclaw/plugin-sdk';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { EffectCoordinator } from '../../../skills/nova/core/effects/coordinator.ts';
import { FileEffectJournal } from '../../../skills/nova/core/effects/journal.ts';
import { FileResourceLockManager } from '../../../skills/nova/core/effects/locks.ts';
import { strictReportSummary } from './review-report-summary-fixture.mjs';
import { snapshotReviewBundle } from '../../../skills/nova/plugins/review/src/review-bundle-snapshot.ts';
import { storeReviewBundle, storeReviewReport } from '../../../skills/nova/plugins/review/src/review-report-storage.ts';
import { buildSummary } from '../../../skills/nova/plugins/project-summary/src/summary.ts';
import { REVIEW_SEMANTIC_ENCODING } from '../../../skills/nova/plugins/review/src/review-semantics.ts';

const [root, phase] = process.argv.slice(2);
const adapter = activate({ config: { artifactRoot: path.join(root, 'artifacts') } });
const coordinator = new EffectCoordinator(new FileEffectJournal(path.join(root, 'events.jsonl')), undefined, undefined,
  new FileResourceLockManager(path.join(root, 'locks')));
const adapterOwner = { pluginId: 'kubeclaw.artifact-store', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', contentDigest: `sha256:${'a'.repeat(64)}` };
let sequence = 0;
// Actual Core effect coordinator, disk journal and ArtifactStore. The other
// provider outputs remain the existing explicit artifact-contract fixtures;
// this is NOT full Review lifecycle or fresh policy/governor production proof.
// Select the same explicit delivery-v3 and outer-artifact modes as current CLI.
// Omitted buildSummary mode intentionally preserves historical v2 bytes; it
// cannot serve as a portable-v3 positive. Legacy compatibility has its own tests.
function context(identity, artifacts = []) {
  return { contract: { lease: { attempt: identity }, artifacts }, invoke: async (capability, request) => {
    const receipt = await coordinator.invoke(adapter, adapterOwner,
      { ...request, capability, attempt: identity, idempotencyKey: `summary:${phase}:${++sequence}` }, new AbortController().signal);
    assert.equal(receipt.status, 'completed'); return receipt.result;
  } };
}
const runId = 'run:report-hex';
const readerIdentity = { runId, stageId: 'summary', attemptId: `summary:${phase}`, attemptNumber: 1 };
try {
  await adapter.ready();
  if (phase === 'produce') {
    const saved = await strictReportSummary(context);
    const read = context(readerIdentity, saved.artifacts);
    async function value(prefix) {
      const ref = saved.artifacts.find(a => a.artifactId.startsWith(prefix)); assert(ref);
      return (await read.invoke('artifacts.read', { operation: 'get_json_bytes', resource: { type: 'artifact.object', canonicalId: ref.artifactId },
        payload: { namespace: ref.namespace, digest: ref.digest, reference: ref } })).value;
    }
    const oldBundle = await value('review-bundle:'), oldReport = await value('review-report:');
    const snapshot = snapshotReviewBundle({ ...oldBundle, schemaVersion: 'review-bundle.v2' });
    const governor = { ...oldReport.governor, schemaVersion: 'review-governor.v2',
      baselineId: sha256Text(portableJson({ schemaVersion: 'review-governor.v2', baseline: oldReport.governor.baseline })) };
    const report = { ...oldReport, schemaVersion: 'review-report.v3', bundleDigest: snapshot.digest, governor };
    const writer = context({ runId, stageId: 'review', attemptId: report.attemptId, attemptNumber: 1 });
    const artifacts = saved.artifacts.filter(a => a.namespace !== 'kubeclaw.review');
    artifacts.push(await storeReviewBundle(snapshot, writer), await storeReviewReport(report, writer, PORTABLE_JSON_ENCODING));
    const input = { ...saved.input, final: { ...saved.input.final, reviewSemanticEncoding: REVIEW_SEMANTIC_ENCODING, reviewArtifactEncoding: PORTABLE_JSON_ENCODING } };
    const summary = await buildSummary(input, context(readerIdentity, artifacts), DELIVERY_MANIFEST_ENCODING);
    assert.equal(summary.schemaVersion, 'delivery-manifest.v3');
    fs.writeFileSync(path.join(root, 'saved.json'), JSON.stringify({ input, artifacts, digest: summary.digest, bundleDigest: snapshot.digest }));
    console.log(JSON.stringify({ phase, locale: Intl.DateTimeFormat().resolvedOptions().locale, summaryDigest: summary.digest, bundleDigest: snapshot.digest,
      actualCore: true, actualArtifactStore: true, artifactContractFixture: true, freshPolicyProduction: false }));
  } else {
    const saved = JSON.parse(fs.readFileSync(path.join(root, 'saved.json'), 'utf8'));
    const summary = await buildSummary(saved.input, context(readerIdentity, saved.artifacts), DELIVERY_MANIFEST_ENCODING);
    assert.equal(summary.digest, saved.digest);
    const oldMode = structuredClone(saved.input); delete oldMode.final.reviewSemanticEncoding;
    await assert.rejects(() => buildSummary(oldMode, context(readerIdentity, saved.artifacts), DELIVERY_MANIFEST_ENCODING), /SEMANTIC_PAIR_INVALID/);
    const wrongMode = structuredClone(saved.input); wrongMode.final.reviewSemanticEncoding = 'future';
    const before = sequence;
    await assert.rejects(() => buildSummary(wrongMode, context(readerIdentity, saved.artifacts), DELIVERY_MANIFEST_ENCODING), /SEMANTIC_MODE_INVALID/);
    assert.equal(sequence, before, 'unsupported owner rejected before any effect');
    const wrongEncoding = saved.artifacts.map(a => a.namespace === 'kubeclaw.review' ? (({ encoding, ...ref }) => ref)(a) : a);
    await assert.rejects(() => buildSummary(saved.input, context(readerIdentity, wrongEncoding), DELIVERY_MANIFEST_ENCODING), /ARTIFACT_ENCODING_REQUIRED/);
    console.log(JSON.stringify({ phase, locale: Intl.DateTimeFormat().resolvedOptions().locale, summaryDigest: summary.digest, samePersistedDigest: true,
      actualCore: true, actualArtifactStore: true, wrongModeAndEncodingRejected: true, providerExecution: false }));
  }
} finally { await adapter.shutdown(); }
