import assert from 'node:assert/strict';

import { buildRuntimeAgentTask, RUNTIME_RESULT_FILE_MAX_BYTES } from '@kubeclaw/plugin-sdk';

import { ReviewDispatchBudget, countReviewTextTokens, estimatedReviewCostUsd, reserveReviewAttempts,
  measureReviewPayload, reserveReviewRuntimePrompt, selectFittingCandidates } from '../src/review-prompt-budget.ts';

// Golden counts captured from js-tiktoken 1.0.21 before replacing it.
const tokenVectors = [
  {
    "text": "",
    "o200k_base": 0,
    "cl100k_base": 0
  },
  {
    "text": "hello world",
    "o200k_base": 2,
    "cl100k_base": 2
  },
  {
    "text": "hello 👋 世界 مرحبا café\n",
    "o200k_base": 8,
    "cl100k_base": 14
  },
  {
    "text": "\ud800",
    "o200k_base": 1,
    "cl100k_base": 1
  },
  {
    "text": "  \t\n",
    "o200k_base": 2,
    "cl100k_base": 1
  },
  {
    "text": "export const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\nexport const ready = true;\n",
    "o200k_base": 300,
    "cl100k_base": 300
  },
  {
    "text": "{\"task\":\"review\",\"source\":\"const x = \\\"🧪\\\";\\n\",\"paths\":[\"src/你好.ts\",\"a\\\\b\"]}",
    "o200k_base": 30,
    "cl100k_base": 30
  }
];
for (const vector of tokenVectors) for (const encoding of ['o200k_base', 'cl100k_base']) {
  assert.equal(countReviewTextTokens(vector.text, encoding), vector[encoding], 'token budgets must retain exact counts');
}
for (const encoding of ['o200k_base', 'cl100k_base']) assert.throws(() => countReviewTextTokens('<|endoftext|>', encoding));

assert.equal(measureReviewPayload({ task: 'review', source: 'const value = true;' }).bytes > 0, true);
assert.equal(estimatedReviewCostUsd({ inputTokens: 1_000_000, outputTokens: 100_000,
  inputUsdPerMillionTokens: 10, outputUsdPerMillionTokens: 30 }), 13);

const envelopePayload = { task: 'review exact source', source: 'const value = true;' };
const maximumResultPath = `/${'x'.repeat(RUNTIME_RESULT_FILE_MAX_BYTES - 1)}`;
const reservedEnvelope = reserveReviewRuntimePrompt(envelopePayload, 'o200k_base');
const actualEnvelope = buildRuntimeAgentTask(envelopePayload, maximumResultPath);
assert.equal(Buffer.byteLength(actualEnvelope, 'utf8') <= reservedEnvelope.bytes, true);
assert.equal(countReviewTextTokens(actualEnvelope) <= reservedEnvelope.tokens, true);
const retryReservation = reserveReviewAttempts([envelopePayload, envelopePayload], 'o200k_base', 2);
assert.equal(retryReservation.attempts, 6);
assert.equal(retryReservation.inputTokens, reservedEnvelope.tokens * 6);
assert.equal(retryReservation.maximumBytes, reservedEnvelope.bytes);
assert.equal(retryReservation.maximumTokens, reservedEnvelope.tokens);
const sharedRetryReservation = reserveReviewAttempts([envelopePayload, envelopePayload], 'o200k_base', 2, 1);
assert.equal(sharedRetryReservation.attempts, 3);
assert.equal(sharedRetryReservation.inputTokens, reservedEnvelope.tokens * 3);
assert.deepEqual(selectFittingCandidates([4, 2, 1], 2,
  (selected) => selected.reduce((total, value) => total + value, 0) <= 3), [2, 1],
'a rejected candidate does not prevent later candidates from using the remaining budget');
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
assert.equal(budget.snapshot().initialCalls, 1);
assert.equal(budget.snapshot().contextExpansionCalls, 0);
assert.equal(budget.snapshot().reservedPromptBytes, budget.snapshot().initialPromptBytes);
assert.equal(budget.snapshot().reservedPromptBytes, prepared.runtimePromptBudget.reservedPromptBytes);
assert.equal(budget.snapshot().modelPayloadBytes, measureReviewPayload({ task: 'one' }).bytes);
assert.equal(budget.snapshot().initialPayloadBytes, measureReviewPayload({ task: 'one' }).bytes);
assert.equal(prepared.runtimePromptBudget.tokenizerEncoding, 'o200k_base');
assert.equal(prepared.runtimePromptBudget.deadlineEpochMs, 123_456);
assert.throws(() => budget.reserve({ task: 'This second request exhausts the shared total token budget.' }),
  /total token budget/u);
const phaseBudget = new ReviewDispatchBudget({ ...limits, maxTotalInputTokens: 20_000 }, 123_456);
phaseBudget.reserve({ task: 'one' }, 'context-expansion');
assert.throws(() => phaseBudget.reserve({ task: 'This retry exceeds its phase reserve.' }, 'context-expansion'),
  /context-expansion token budget/u);
assert.equal(phaseBudget.snapshot().contextExpansionInputTokens > 0, true);
assert.equal(phaseBudget.snapshot().contextExpansionCalls, 1);
assert.equal(phaseBudget.snapshot().contextExpansionPromptBytes > 0, true);
const byteBudget = new ReviewDispatchBudget({ ...limits, maxPromptBytesPerJob: 5, maxTotalInputTokens: 20_000 });
assert.throws(() => byteBudget.reserve({ task: 'too large' }), /byte budget/u);

console.log(JSON.stringify({ ok: true, suite: 'review-prompt-budget' }));
