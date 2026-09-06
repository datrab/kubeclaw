import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveImplementationRevisions, resolveSourceRevision, canonicalJson, sha256Text,
  type AdapterActivationContext, type AdapterInvocation, type ArtifactRef, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';
import { activate as activateArtifacts } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { activate as activateRepository } from '../../../skills/nova/plugins/repository-adapter/src/adapter.ts';
import { execute as executeReview } from '../../../skills/nova/plugins/review/src/stage.ts';
import { prepareReview } from '../../../skills/nova/plugins/review/src/review-preparation.ts';
import { parseReviewInput } from '../../../skills/nova/plugins/review/src/review-stage-input.ts';
import { resolveReviewPolicy } from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import { getReviewPolicyProfile } from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';

// Integration scope: real Git, durable artifact storage and review preparation.
// No agent verdicts or provider results are supplied by this test.
test('module review binds real implementation artifacts, retains its repair baseline and rejects unrelated HEAD', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-candidate-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Integration'); git('config', 'user.email', 'integration@example.invalid');
  const commit = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), content);
    git('add', '.'); git('commit', '-qm', file); return git('rev-parse', 'HEAD');
  };
  const baseline = commit('README.md', 'Integration project\n');
  const moduleA = commit('alpha/value.ts', 'export const alpha = 1;\n');
  const moduleB = commit('beta/value.ts', 'export const beta = 2;\n');
  const artifacts = activateArtifacts({ config: { artifactRoot: path.join(root, 'artifacts') } } as AdapterActivationContext);
  const repository = activateRepository({ config: { repositoryRoot: repo } } as AdapterActivationContext);
  const refs: ArtifactRef[] = [];
  let sequence = 0;
  const attempt = (stageId: string, attemptNumber: number) => ({ runId: 'run:modules', stageId, attemptNumber, attemptId: `${stageId}:${attemptNumber}` });
  const invoke = async (capability: string, request: any, producer = attempt('review-beta', 1)) => {
    const adapter = capability.startsWith('artifacts.') ? artifacts : repository;
    return adapter.invoke({ confidential: true, signal: new AbortController().signal,
      request: { ...request, capability, attempt: producer, idempotencyKey: `operation:${++sequence}` },
    } as AdapterInvocation);
  };
  const record = async (stageId: string, attemptNumber: number, headBefore: string, sourceRevision: string) => {
    const response = await invoke('artifacts.write', { operation: 'put_json',
      resource: { type: 'artifact.object', canonicalId: `implementation:${stageId}:${attemptNumber}` },
      payload: { namespace: 'kubeclaw.implementation-agent', mediaType: 'application/json',
        value: { status: 'ready_for_testing', headBefore, sourceRevision } },
    }, attempt(stageId, attemptNumber));
    refs.push(response.artifact as ArtifactRef);
  };
  const context = { contract: { config: { agent: 'echo' }, artifacts: refs, lease: { attempt: attempt('review-beta', 1) } }, invoke } as unknown as PluginInvocationContext;
  try {
    await artifacts.ready(); await repository.ready();
    await record('implement-alpha', 1, baseline, moduleA);
    await record('implement-beta', 1, moduleA, moduleB);
    assert.deepEqual(await resolveImplementationRevisions('implement-alpha', context), { base: baseline, head: moduleA });
    assert.deepEqual(await resolveImplementationRevisions('implement-beta', context), { base: moduleA, head: moduleB });
    const policy = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('gate') });
    const inputFor = async () => {
      const content = { requirement: 'beta must export 2' };
      const parsed = parseReviewInput({ task: { id: 'beta', statement: 'Implement beta' },
        revisions: await resolveImplementationRevisions('implement-beta', context),
        scope: { allowedPrefixes: ['beta'], ownershipPrefixes: ['beta'] },
        requirements: [{ id: 'REQ-1', statement: 'Export beta' }],
        evidence: [{ kind: 'requirements', digest: sha256Text(canonicalJson(content)), content }], contextCandidates: [] });
      assert.equal(parsed.ok, true);
      if (!parsed.ok) throw new Error(parsed.error);
      return parsed.value;
    };
    const prepared = await prepareReview(await inputFor(), policy, context);
    assert.equal(prepared.snapshot.bundle.revisions.base, moduleA);
    assert.equal(prepared.snapshot.bundle.revisions.head, moduleB);
    assert.deepEqual(prepared.repository.scope.changedPaths.map(item => item.path), ['beta/value.ts']);
    assert.ok(JSON.stringify(prepared.snapshot.bundle.context).includes('export const beta = 2'));

    const repaired = commit('beta/value.ts', 'export const beta = 3;\n');
    await record('implement-beta', 2, moduleB, repaired);
    assert.deepEqual(await resolveImplementationRevisions('implement-beta', context), { base: moduleA, head: repaired });
    assert.equal(await resolveSourceRevision({ sourceStageId: 'implement-beta' }, context), repaired);
    const repairedInput = await inputFor();
    const repairedReview = await prepareReview(repairedInput, policy, context);
    assert.equal(repairedReview.snapshot.bundle.revisions.base, moduleA);
    assert.ok(JSON.stringify(repairedReview.snapshot.bundle.context).includes('export const beta = 3'));

    commit('alpha/value.ts', 'export const alpha = 99;\n');
    await assert.rejects(() => prepareReview(repairedInput, policy, context), /REVIEW_CANDIDATE_CHANGED/);
    const stopped = await executeReview({ ...repairedInput, evidence: repairedInput.evidence.map(item => ({ ...item, content: JSON.parse(item.content) })), revisions: { sourceStageId: 'implement-beta' } }, context);
    assert.equal(stopped.outcome, 'blocked');
    assert.match(JSON.stringify(stopped), /REVIEW_CANDIDATE_CHANGED/);
    assert.equal((await executeReview(null, context)).outcome, 'blocked');
    await assert.rejects(() => resolveImplementationRevisions('missing-stage', context), /MISSING_OR_AMBIGUOUS/);
    const originalSize = refs[1]!.sizeBytes;
    refs[1] = { ...refs[1]!, sizeBytes: originalSize + 1 };
    await assert.rejects(() => resolveImplementationRevisions('implement-beta', context), /ARTIFACT_CORRUPT/);
    refs[1] = { ...refs[1]!, sizeBytes: originalSize };
    refs.push(refs[2]!);
    await assert.rejects(() => resolveImplementationRevisions('implement-beta', context), /MISSING_OR_AMBIGUOUS/);
  } finally {
    await repository.shutdown(); await artifacts.shutdown();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
