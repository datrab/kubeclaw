import assert from 'node:assert/strict';

import { resolveRepositoryReviewProfile } from '../src/repository-review-profile.ts';

const standard = resolveRepositoryReviewProfile({ grade: 'standard' });
assert.equal(standard.mode, 'execute');
assert.equal(standard.scope.kind, 'repository');
assert.deepEqual(standard.allowedPrefixes, ['.']);
assert.equal(standard.maxPrimaryJobs, 500);
assert.equal(standard.maxContextExpansionJobs, 100);
assert.equal(standard.maxVerificationJobs, 100);
assert.deepEqual(standard.componentBudget, { maxFiles: 60, maxBytes: 400_000, maxTokens: 86_000 });
assert.deepEqual(standard.boundaryBudget,
  { maxFiles: 400, maxBytes: 900_000, maxTokens: 80_000, maxRelations: 600, maxSlices: 200 });
assert.equal(standard.maxInputTokensPerJob, 120_000);
assert.equal(standard.maxContextTokensPerJob, 128_000);
assert.equal(standard.maxInitialInputTokens, 25_000_000);
assert.equal(standard.maxContextExpansionInputTokens, 50_000_000);
assert.equal(standard.maxVerificationInputTokens, 50_000_000);
assert.equal(standard.maxTotalInputTokens, 50_000_000);
assert.equal(standard.maxRetryAttemptsPerPhase, 20);
assert.equal(standard.maxEstimatedCostUsd, 650);
assert.equal(standard.maxPromptBytesPerJob, 900_000);
assert.equal(standard.tokenizerEncoding, 'o200k_base');

const plugin = resolveRepositoryReviewProfile({ grade: 'deep', mode: 'plan',
  scope: { kind: 'plugin', names: ['review', 'pipeline', 'review'] },
  overrides: { concurrency: 2, maxPrimaryJobs: 240, boundaryBudget: { maxRelations: 25 },
    enabledLenses: ['security', 'lifecycle'] } });
assert.equal(plugin.mode, 'plan');
assert.deepEqual(plugin.allowedPrefixes, ['contracts/', 'skills/common/plugin-runtime/',
  'skills/common/plugins/runtime-dispatch/', 'skills/nova/plugins/pipeline/', 'skills/nova/plugins/review/']);
assert.equal(plugin.concurrency, 2);
assert.equal(plugin.boundaryBudget.maxRelations, 25);
assert.deepEqual(plugin.enabledLenses, ['security', 'lifecycle']);
assert.notEqual(plugin.digest, standard.digest);
const fast = resolveRepositoryReviewProfile({ grade: 'fast' });
assert.equal(fast.maxPrimaryJobs, 75);
assert.equal(fast.maxInitialInputTokens, 6_500_000);
assert.equal(fast.maxContextExpansionInputTokens, 750_000);
assert.equal(fast.maxVerificationInputTokens, 750_000);
assert.equal(fast.maxTotalInputTokens, 8_000_000);
assert.equal(fast.maxEstimatedCostUsd, 100);
const deep = resolveRepositoryReviewProfile({ grade: 'deep' });
assert.equal(deep.maxPrimaryJobs, 2_000);
assert.equal(deep.maxTotalInputTokens, 100_000_000);
assert.equal(deep.maxEstimatedCostUsd, 1_300);

assert.throws(() => resolveRepositoryReviewProfile({ grade: 'invalid' }), /grade is invalid/u);
assert.throws(() => resolveRepositoryReviewProfile({ scope: { kind: 'path', prefixes: ['../escape'] } }), /scope is invalid/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { concurrency: 0 } }), /concurrency is invalid/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { maxEstimatedCostUsd: 0 } }), /cost limit is invalid/u);
assert.throws(() => resolveRepositoryReviewProfile({ scope: { kind: 'plugin', names: ['bad/name'] } }), /plugin name/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { maxContextExpansionJobs: 0 } }),
  /context expansion job limit is invalid/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { tokenizerEncoding: 'invalid' } }), /tokenizer encoding is invalid/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { tokenizerEncoding: 'cl100k_base' } }),
  /conflicts with the review runtime target/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { maxOutputTokensPerJob: 3_000 } }),
  /conflicts with the review runtime target/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { maxInputTokensPerJob: 120_001 } }),
  /exceeds the review runtime target/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { maxContextTokensPerJob: 128_001 } }),
  /exceeds the review runtime target/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { maxPromptBytesPerJob: 900_001 } }),
  /exceeds the review runtime target/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: {
  maxInputTokensPerJob: 120_000, maxContextTokensPerJob: 6_000,
} }), /token limits exceed the context limit/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { maxTotalInputTokens: 7_000_000 } }),
  /phase token limit exceeds the combined input limit/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { maxRetryAttemptsPerPhase: -1 } }),
  /shared retry-attempt limit is invalid/u);
assert.throws(() => resolveRepositoryReviewProfile({ overrides: { enabledLenses: ['security', 'security'] } }), /lenses are invalid/u);

console.log(JSON.stringify({ ok: true, suite: 'repository-review-profile' }));
