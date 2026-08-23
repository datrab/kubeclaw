import assert from 'node:assert/strict';

import { buildRuntimeAgentTask, RUNTIME_RESULT_FILE_MAX_BYTES } from '@kubeclaw/plugin-sdk';

import { ReviewDispatchBudget, countReviewTextTokens, estimatedReviewCostUsd,
  measureReviewPayload, reserveReviewRuntimePrompt } from '../src/review-prompt-budget.ts';

assert.equal(countReviewTextTokens('review exact source') > 0, true);
assert.equal(measureReviewPayload({ task: 'review', source: 'const value = true;' }).bytes > 0, true);
assert.equal(estimatedReviewCostUsd({ inputTokens: 1_000_000, outputTokens: 100_000,
  inputUsdPerMillionTokens: 10, outputUsdPerMillionTokens: 30 }), 13);

const envelopePayload = { task: 'review exact source', source: 'const value = true;' };
const maximumResultPath = `/${'x'.repeat(RUNTIME_RESULT_FILE_MAX_BYTES - 1)}`;
const reservedEnvelope = reserveReviewRuntimePrompt(envelopePayload, 'o200k_base');
const actualEnvelope = buildRuntimeAgentTask(envelopePayload, maximumResultPath);
assert.equal(Buffer.byteLength(actualEnvelope, 'utf8') <= reservedEnvelope.bytes, true);
assert.equal(countReviewTextTokens(actualEnvelope) <= reservedEnvelope.tokens, true);
const nestedPayload = { review: { job: { source: Array.from({ length: 200 }, (_value, index) => ({
  path: `src/${index}.ts`, ranges: [{ startLine: 1, endLine: 10 }], content: 'const value = true;\n'.repeat(10),
})) } } };
const nestedReservation = reserveReviewRuntimePrompt(nestedPayload, 'o200k_base');
const nestedEnvelope = buildRuntimeAgentTask(nestedPayload, maximumResultPath);
assert.equal(Buffer.byteLength(nestedEnvelope, 'utf8') <= nestedReservation.bytes, true);
assert.equal(countReviewTextTokens(nestedEnvelope) <= nestedReservation.tokens, true);

const limits = { tokenizerEncoding: 'o200k_base', maxPromptBytesPerJob: 10_000, maxInputTokensPerJob: 10_000,
  maxContextTokensPerJob: 12_000, maxOutputTokensPerJob: 2_000, maxTotalInputTokens: 3_000,
  maxInitialInputTokens: 3_000, maxContextExpansionInputTokens: 2_500, maxVerificationInputTokens: 2_500,
  maxEstimatedCostUsd: 1, inputUsdPerMillionTokens: 10, outputUsdPerMillionTokens: 30 };
const budget = new ReviewDispatchBudget(limits, 123_456);
const prepared = budget.reserve({ task: 'one' });
assert.equal(budget.snapshot().calls, 1);
assert.equal(prepared.runtimePromptBudget.tokenizerEncoding, 'o200k_base');
assert.equal(prepared.runtimePromptBudget.deadlineEpochMs, 123_456);
assert.throws(() => budget.reserve({ task: 'This second request exhausts the shared total token budget.' }),
  /total token budget/u);
const phaseBudget = new ReviewDispatchBudget({ ...limits, maxTotalInputTokens: 20_000 }, 123_456);
phaseBudget.reserve({ task: 'one' }, 'context-expansion');
assert.throws(() => phaseBudget.reserve({ task: 'This retry exceeds its phase reserve.' }, 'context-expansion'),
  /context-expansion token budget/u);
assert.equal(phaseBudget.snapshot().contextExpansionInputTokens > 0, true);
const byteBudget = new ReviewDispatchBudget({ ...limits, maxPromptBytesPerJob: 5, maxTotalInputTokens: 20_000 });
assert.throws(() => byteBudget.reserve({ task: 'too large' }), /byte budget/u);

console.log(JSON.stringify({ ok: true, suite: 'review-prompt-budget' }));
