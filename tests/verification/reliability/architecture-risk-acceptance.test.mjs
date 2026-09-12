import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runPipelineV2, resumePipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { sourceApprovalFixture } from './approval-source-fixture.mjs';

// The existing HTTP fixture supplies declared review protocol vectors, not a
// model verdict claim. Core, plugins, Git, wait authority and artifact storage
// are original. Stop after actual Blueprint sync; no Forge provider is needed.
for (const [severity, reason] of [['warn', 'Accept this reviewed ownership risk.'],
  ['error', 'Accept this reviewed integration tradeoff.'], ['error', undefined], ['blocking', undefined]]) {
  test(`original risk gate ${severity}, reason=${reason !== undefined}`, { timeout: 60000 }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-risk-'));
    let f;
    try {
      f = await sourceApprovalFixture(root, false, severity);
      f.definition.stages = f.definition.stages.filter(stage => ['architecture', 'approval', 'sync'].includes(stage.id));
      delete f.platform.grants['kubeclaw.implementation-agent:implementation'];
      const runId = `run:risk:${severity}:${reason === undefined ? 'missing' : 'reason'}`;
      const first = await runPipelineV2(f.platform, f.definition, runId);
      assert.equal(first.status, severity === 'blocking' ? 'blocked' : 'waiting');
      assert.equal(f.dispatches.length, 1);
      if (severity === 'blocking') {
        assert.equal(first.stages.get('architecture').status, 'blocked');
        assert.equal(f.messages.length, 0);
        assert.equal(f.git('rev-parse', 'HEAD'), f.sourceRevision);
        return;
      }
      const wait = first.stages.get('approval').wait;
      assert.equal(wait.authorizedIssuer.id, 'operator:test');
      const result = await resumePipelineV2(f.platform, f.definition, runId, {
        schemaVersion: 'resume-signal.v2', signalId: `signal:${wait.waitId}`, idempotencyKey: `key:${wait.waitId}`,
        waitId: wait.waitId, signalType: wait.signalType, issuer: wait.authorizedIssuer, issuedAt: new Date().toISOString(),
        payload: { decision: 'approved', issuer: wait.authorizedIssuer, ...(reason ? { reason } : {}) },
      });
      assert.equal(result.status, reason ? 'succeeded' : 'blocked');
      const records = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/records/store.json'), 'utf8')).records;
      const refs = records.map(record => record.payload);
      const approval = refs.find(ref => ref.namespace === 'kubeclaw.human-approval');
      if (!reason) {
        assert.equal(approval, undefined);
        assert.equal(f.git('rev-parse', 'HEAD'), f.sourceRevision);
        return;
      }
      assert.equal(result.stages.get('sync').status, 'succeeded');
      const read = ref => JSON.parse(fs.readFileSync(path.join(root, 'artifacts/blobs/sha256', ref.digest.slice(7, 9), ref.digest.slice(9)), 'utf8'));
      const stored = read(approval);
      const report = refs.find(ref => ref.namespace === 'kubeclaw.architecture-validator');
      assert.equal(stored.reportDigest, report.digest);
      assert.equal(stored.subject.digest, read(report).subject.digest);
      assert.equal(stored.guidance.reason, reason);
      assert.equal(stored.guidance.issuer.id, 'operator:test');
      assert.equal(stored.clean, false);
    } finally {
      if (f) await f.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
