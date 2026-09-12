import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { EffectCoordinator } from '../../../skills/nova/core/effects/coordinator.ts';
import { FileEffectJournal } from '../../../skills/nova/core/effects/journal.ts';
import { FileResourceLockManager } from '../../../skills/nova/core/effects/locks.ts';
import { readReviewGovernorBaseline } from '../../../skills/nova/plugins/review/src/review-governor-history.ts';
import { REVIEW_SEMANTIC_ENCODING } from '../../../skills/nova/plugins/review/src/review-semantics.ts';

const [root, phase] = process.argv.slice(2);
const saved = JSON.parse(fs.readFileSync(path.join(root, 'saved.json'), 'utf8'));
const adapter = activate({ config: { artifactRoot: path.join(root, 'artifacts') } });
const coordinator = new EffectCoordinator(
  new FileEffectJournal(path.join(root, `history-${phase}.jsonl`)),
  undefined,
  undefined,
  new FileResourceLockManager(path.join(root, `history-${phase}-locks`)),
);
const adapterOwner = {
  pluginId: 'kubeclaw.artifact-store',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  contentDigest: `sha256:${'b'.repeat(64)}`,
};
const identity = {
  runId: 'run:report-hex',
  stageId: 'review',
  attemptId: `history:${phase}`,
  attemptNumber: 2,
};
const requests = [];
const context = {
  contract: {
    lease: { attempt: identity },
    artifacts: saved.artifacts,
    stageLifecycle: { remediationCyclesUsed: 1 },
  },
  invoke: async (capability, request) => {
    requests.push(structuredClone({ capability, request }));
    const receipt = await coordinator.invoke(
      adapter,
      adapterOwner,
      {
        ...request,
        capability,
        attempt: identity,
        idempotencyKey: `history:${phase}:${requests.length}`,
      },
      new AbortController().signal,
    );
    assert.equal(receipt.status, 'completed');
    return receipt.result;
  },
};

try {
  await adapter.ready();
  const baseline = await readReviewGovernorBaseline(context, REVIEW_SEMANTIC_ENCODING);
  assert(baseline);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].capability, 'artifacts.read');
  assert.equal(requests[0].request.operation, 'get_json_bytes');
  assert.equal(requests[0].request.payload.reference.encoding, 'kubeclaw-json.utf16.v1');
  process.stdout.write(JSON.stringify({
    phase,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    baseline,
    operation: requests[0].request.operation,
    actualCore: true,
    actualArtifactStore: true,
    artifactContractFixture: true,
    freshReviewProducer: false,
  }) + '\n');
} finally {
  await adapter.shutdown();
}
