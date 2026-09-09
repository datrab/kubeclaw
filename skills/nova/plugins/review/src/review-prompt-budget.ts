import { getEncoding } from 'js-tiktoken';
import { buildRuntimeAgentTask, RUNTIME_RESULT_FILE_MAX_BYTES } from '@kubeclaw/plugin-sdk';

export interface ReviewPromptMetrics {
  readonly bytes: number;
  readonly tokens: number;
}

export type ReviewTokenizerEncoding = 'o200k_base' | 'cl100k_base';
export type ReviewDispatchPhase = 'initial' | 'context-expansion' | 'verification';

export interface ReviewPromptReservation extends ReviewPromptMetrics {
  readonly payloadBytes: number;
  readonly payloadTokens: number;
}

export interface ReviewAttemptReservation {
  readonly attempts: number;
  readonly inputTokens: number;
  readonly maximumBytes: number;
  readonly maximumTokens: number;
}

export interface ReviewDispatchLimits {
  readonly tokenizerEncoding: ReviewTokenizerEncoding;
  readonly maxPromptBytesPerJob: number;
  readonly maxInputTokensPerJob: number;
  readonly maxContextTokensPerJob: number;
  readonly maxOutputTokensPerJob: number;
  readonly maxInitialInputTokens: number;
  readonly maxContextExpansionInputTokens: number;
  readonly maxVerificationInputTokens: number;
  readonly maxTotalInputTokens: number;
  readonly maxEstimatedCostUsd: number;
  readonly inputUsdPerMillionTokens: number;
  readonly outputUsdPerMillionTokens: number;
}

const ENCODERS = new Map<ReviewTokenizerEncoding, ReturnType<typeof getEncoding>>();
const PROMPT_TOKEN_BOUNDARY_RESERVE = 64;

export function countReviewTextTokens(text: string, encoding: ReviewTokenizerEncoding = 'o200k_base'): number {
  let encoder = ENCODERS.get(encoding);
  if (!encoder) { encoder = getEncoding(encoding); ENCODERS.set(encoding, encoder); }
  return encoder.encode(text).length;
}

export function measureReviewPayload(
  payload: Readonly<Record<string, unknown>>, encoding: ReviewTokenizerEncoding = 'o200k_base',
): ReviewPromptMetrics {
  const text = JSON.stringify(payload, null, 2);
  return Object.freeze({
    bytes: Buffer.byteLength(text, 'utf8'),
    tokens: countReviewTextTokens(text, encoding),
  });
}

export function reserveReviewRuntimePrompt(
  payload: Readonly<Record<string, unknown>>, encoding: ReviewTokenizerEncoding,
): ReviewPromptReservation {
  const measured = measureReviewPayload(payload, encoding);
  const emptyPayload = JSON.stringify({}, null, 2), fixedEnvelope = buildRuntimeAgentTask({}, '');
  const fixedBytes = Buffer.byteLength(fixedEnvelope, 'utf8') - Buffer.byteLength(emptyPayload, 'utf8');
  const fixedTokens = countReviewTextTokens(fixedEnvelope, encoding) - countReviewTextTokens(emptyPayload, encoding);
  return Object.freeze({ payloadBytes: measured.bytes, payloadTokens: measured.tokens,
    bytes: measured.bytes + fixedBytes + RUNTIME_RESULT_FILE_MAX_BYTES,
    tokens: measured.tokens + fixedTokens + RUNTIME_RESULT_FILE_MAX_BYTES + PROMPT_TOKEN_BOUNDARY_RESERVE });
}

export function reserveReviewAttempts(
  payloads: readonly Readonly<Record<string, unknown>>[], encoding: ReviewTokenizerEncoding, maxRetries: number,
  maxRetryAttempts = payloads.length * maxRetries,
): ReviewAttemptReservation {
  const metrics = payloads.map((payload) => reserveReviewRuntimePrompt(payload, encoding));
  const retryTokens = metrics.flatMap(({ tokens }) => Array.from({ length: maxRetries }, () => tokens))
    .sort((left, right) => right - left).slice(0, maxRetryAttempts);
  return Object.freeze({ attempts: payloads.length + retryTokens.length,
    inputTokens: metrics.reduce((total, value) => total + value.tokens, 0)
      + retryTokens.reduce((total, value) => total + value, 0),
    maximumBytes: Math.max(0, ...metrics.map(({ bytes }) => bytes)),
    maximumTokens: Math.max(0, ...metrics.map(({ tokens }) => tokens)) });
}

export function selectFittingCandidates<T>(
  candidates: readonly T[], maximum: number, fits: (selected: readonly T[]) => boolean,
): readonly T[] {
  const selected: T[] = [];
  for (const candidate of candidates) {
    if (selected.length >= maximum) break;
    const proposed = [...selected, candidate];
    if (fits(proposed)) selected.push(candidate);
  }
  return Object.freeze(selected);
}

export function estimatedReviewCostUsd(values: {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly inputUsdPerMillionTokens: number;
  readonly outputUsdPerMillionTokens: number;
}): number {
  const input = values.inputTokens * values.inputUsdPerMillionTokens / 1_000_000;
  const output = values.outputTokens * values.outputUsdPerMillionTokens / 1_000_000;
  return Math.ceil((input + output) * 100) / 100;
}

export class ReviewDispatchBudget {
  readonly #limits: ReviewDispatchLimits;
  readonly #deadlineEpochMs: number | undefined;
  #reservedInputTokens = 0;
  #reservedOutputTokens = 0;
  #reservedPromptBytes = 0;
  #modelPayloadBytes = 0;
  readonly #phaseInputTokens = new Map<ReviewDispatchPhase, number>();
  readonly #phasePromptBytes = new Map<ReviewDispatchPhase, number>();
  readonly #phasePayloadBytes = new Map<ReviewDispatchPhase, number>();
  readonly #phaseCalls = new Map<ReviewDispatchPhase, number>();
  #calls = 0;

  constructor(limits: ReviewDispatchLimits, deadlineEpochMs?: number) {
    this.#limits = limits; this.#deadlineEpochMs = deadlineEpochMs;
  }

  // eslint-disable-next-line max-lines-per-function, complexity -- Reservation validates one atomic multi-limit budget transaction.
  reserve(
    payload: Readonly<Record<string, unknown>>, phase: ReviewDispatchPhase = 'initial',
  ): Readonly<Record<string, unknown>> {
    // runtimePromptBudget is adapter-only control data. The OpenClaw adapter strips it before it builds the model prompt.
    const measured = reserveReviewRuntimePrompt(payload, this.#limits.tokenizerEncoding);
    if (measured.bytes > this.#limits.maxPromptBytesPerJob) {
      throw new Error(`review dispatch byte budget exceeded: ${measured.bytes}:${this.#limits.maxPromptBytesPerJob}`);
    }
    if (measured.tokens > this.#limits.maxInputTokensPerJob
      || measured.tokens + this.#limits.maxOutputTokensPerJob > this.#limits.maxContextTokensPerJob) {
      throw new Error(`review dispatch context budget exceeded: ${measured.tokens}:${this.#limits.maxInputTokensPerJob}`);
    }
    const inputTokens = this.#reservedInputTokens + measured.tokens;
    const phaseInputTokens = (this.#phaseInputTokens.get(phase) ?? 0) + measured.tokens;
    const phaseMaximum = phase === 'initial' ? this.#limits.maxInitialInputTokens
      : phase === 'context-expansion' ? this.#limits.maxContextExpansionInputTokens
        : this.#limits.maxVerificationInputTokens;
    const outputTokens = this.#reservedOutputTokens + this.#limits.maxOutputTokensPerJob;
    const cost = estimatedReviewCostUsd({ inputTokens, outputTokens,
      inputUsdPerMillionTokens: this.#limits.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: this.#limits.outputUsdPerMillionTokens });
    if (inputTokens > this.#limits.maxTotalInputTokens) {
      throw new Error(`review dispatch total token budget exceeded: ${inputTokens}:${this.#limits.maxTotalInputTokens}`);
    }
    if (phaseInputTokens > phaseMaximum) {
      throw new Error(`review dispatch ${phase} token budget exceeded: ${phaseInputTokens}:${phaseMaximum}`);
    }
    if (cost > this.#limits.maxEstimatedCostUsd) {
      throw new Error(`review dispatch cost budget exceeded: ${cost}:${this.#limits.maxEstimatedCostUsd}`);
    }
    this.#reservedInputTokens = inputTokens; this.#reservedOutputTokens = outputTokens;
    this.#reservedPromptBytes += measured.bytes;
    this.#modelPayloadBytes += measured.payloadBytes;
    this.#phaseInputTokens.set(phase, phaseInputTokens); this.#calls += 1;
    this.#phasePromptBytes.set(phase, (this.#phasePromptBytes.get(phase) ?? 0) + measured.bytes);
    this.#phasePayloadBytes.set(phase, (this.#phasePayloadBytes.get(phase) ?? 0) + measured.payloadBytes);
    this.#phaseCalls.set(phase, (this.#phaseCalls.get(phase) ?? 0) + 1);
    return Object.freeze({ ...payload, runtimePromptBudget: Object.freeze({
      schemaVersion: 'runtime-prompt-budget.v1', tokenizerEncoding: this.#limits.tokenizerEncoding,
      reservedPromptBytes: measured.bytes, reservedInputTokens: measured.tokens,
      maxPromptBytes: this.#limits.maxPromptBytesPerJob,
      maxInputTokens: this.#limits.maxInputTokensPerJob,
      maxOutputTokens: this.#limits.maxOutputTokensPerJob,
      maxContextTokens: this.#limits.maxContextTokensPerJob,
      ...(this.#deadlineEpochMs === undefined ? {} : { deadlineEpochMs: this.#deadlineEpochMs }),
    }) });
  }

  snapshot(): Readonly<{ calls: number; reservedPromptBytes: number; modelPayloadBytes: number;
    initialCalls: number; contextExpansionCalls: number; verificationCalls: number;
    initialPromptBytes: number; contextExpansionPromptBytes: number; verificationPromptBytes: number;
    initialPayloadBytes: number; contextExpansionPayloadBytes: number; verificationPayloadBytes: number;
    reservedInputTokens: number; reservedOutputTokens: number;
    initialInputTokens: number; contextExpansionInputTokens: number; verificationInputTokens: number;
    reservedEstimatedCostUsd: number }> {
    return Object.freeze({ calls: this.#calls, reservedPromptBytes: this.#reservedPromptBytes,
      modelPayloadBytes: this.#modelPayloadBytes,
      initialCalls: this.#phaseCalls.get('initial') ?? 0,
      contextExpansionCalls: this.#phaseCalls.get('context-expansion') ?? 0,
      verificationCalls: this.#phaseCalls.get('verification') ?? 0,
      initialPromptBytes: this.#phasePromptBytes.get('initial') ?? 0,
      contextExpansionPromptBytes: this.#phasePromptBytes.get('context-expansion') ?? 0,
      verificationPromptBytes: this.#phasePromptBytes.get('verification') ?? 0,
      initialPayloadBytes: this.#phasePayloadBytes.get('initial') ?? 0,
      contextExpansionPayloadBytes: this.#phasePayloadBytes.get('context-expansion') ?? 0,
      verificationPayloadBytes: this.#phasePayloadBytes.get('verification') ?? 0,
      reservedInputTokens: this.#reservedInputTokens,
      reservedOutputTokens: this.#reservedOutputTokens,
      initialInputTokens: this.#phaseInputTokens.get('initial') ?? 0,
      contextExpansionInputTokens: this.#phaseInputTokens.get('context-expansion') ?? 0,
      verificationInputTokens: this.#phaseInputTokens.get('verification') ?? 0,
      reservedEstimatedCostUsd: estimatedReviewCostUsd({ inputTokens: this.#reservedInputTokens,
        outputTokens: this.#reservedOutputTokens,
        inputUsdPerMillionTokens: this.#limits.inputUsdPerMillionTokens,
        outputUsdPerMillionTokens: this.#limits.outputUsdPerMillionTokens }) });
  }
}
