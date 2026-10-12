import crypto from 'node:crypto';
import { canonical } from './canonical-value.ts';
import { validatePipelineTestGateContract, type AttemptResultV1, type ExecutionState, type NodeResultV1, type ReceiptRefV1, type ResolvedPlanNodeV1, type ResolvedTestPlanV1, type TerminalNodeState, type TestOutcome } from '@kubeclaw/pipeline-test-gate-contract';
export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}


export function digest(value: unknown): string {
  return `sha256:${crypto.createHash("sha256").update(canonical(value)).digest("hex")}`;
}

export function freeze<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value as Record<string, unknown>))
    freeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

export function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function terminalResult(result: NodeResultV1): string {
  if (result.state === "completed") return result.outcome ?? "errored";
  if (result.state === "skipped") return "skipped";
  return result.state;
}

export function selectedEvidenceTypes(
  node: ResolvedPlanNodeV1,
  state: ExecutionState,
  outcome: TestOutcome,
): Set<string> {
  if (state !== "completed") return new Set(node.evidence.onError);
  return new Set(
    outcome === "failed" ? node.evidence.onFail : node.evidence.onPass,
  );
}

export function receipt(
  authorityId: string,
  nonce: string,
  resultDigest: string,
): ReceiptRefV1 {
  const receiptId = `receipt:${crypto.createHash("sha256").update(`${authorityId}:${nonce}:${resultDigest}`).digest("hex")}`;
  return Object.freeze({
    receiptId,
    receiptDigest: digest({ authorityId, receiptId, resultDigest }),
  });
}

export function resultIdentity(plan: ResolvedTestPlanV1, node: ResolvedPlanNodeV1) {
  return {
    planId: plan.planId,
    runId: plan.runId,
    moduleId: plan.scope.moduleId,
    gateId: plan.scope.gateId,
    suiteInstanceId: node.suiteInstanceId,
    nodeId: node.id,
    executionId: node.executionId,
    testIdentity: node.testIdentity,
    nodeKind: node.kind,
  } as const;
}

export function finalNodeResult(
  plan: ResolvedTestPlanV1,
  node: ResolvedPlanNodeV1,
  attempts: readonly AttemptResultV1[],
  state: TerminalNodeState,
  outcome: TestOutcome,
  skipReason: string | null,
  { authorityId, nonce }: { readonly authorityId: string; readonly nonce: string },
): NodeResultV1 {
  const finalAttempt = attempts.at(-1) ?? null;
  const unstable =
    outcome === "passed" &&
    attempts
      .slice(0, -1)
      .some(
        (attempt) =>
          attempt.executionState !== "completed" ||
          attempt.outcome === "failed",
      );
  const unsigned = {
    schemaVersion: "node-result.v1" as const,
    ...resultIdentity(plan, node),
    mode: node.mode,
    state,
    outcome,
    attemptIds: attempts.map((attempt) => attempt.attemptId),
    finalAttemptId: finalAttempt?.attemptId ?? null,
    unstable,
    skipReason,
  };
  const resultDigest = digest(unsigned);
  const result: NodeResultV1 = {
    ...unsigned,
    resultDigest,
    receipt: receipt(authorityId, nonce, resultDigest),
  };
  validatePipelineTestGateContract("nodeResult", result);
  return freeze(result);
}

