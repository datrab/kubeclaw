import fs from "node:fs";
import path from "node:path";
import type { ObservabilityCompletenessV1 } from "@kubeclaw/pipeline-observability-contract";
import type { WorkerAttemptResultV1 } from "@kubeclaw/pipeline-worker-core-contract";
import {
  FileDurableAttemptStore,
  type RequiredProducerClosure,
} from "@kubeclaw/plugin-foundation/observability/durable-attempts";
import { FileObservabilityAdmissionStore } from "@kubeclaw/plugin-foundation/observability/durable-delivery";
import { writeDurableState } from "@kubeclaw/plugin-foundation/observability/durable-delivery";
import { FileJournal } from "../state/journal.ts";

export type ObservabilityGateClass =
  "development" | "safety-critical" | "authoritative-final";
export interface ReconciliationAttempt {
  pipelineRunId: string;
  planId: string;
  nodeId: string;
  attemptId: string;
  claimId: string;
  claimGeneration: number;
  workerId: string;
  claimExpiresAt: string;
  gateClass: ObservabilityGateClass;
  requiredClosures: RequiredProducerClosure[];
}
export type ReconciliationAction =
  | "imported"
  | "already-imported"
  | "reconnect"
  | "requeue"
  | "stale-result-rejected"
  | "identity-mismatch-rejected"
  | "continue-degraded"
  | "blocked-incomplete";
export interface ReconciliationDecision {
  pipelineRunId: string;
  planId: string;
  nodeId: string;
  attemptId: string;
  claimGeneration: number;
  action: ReconciliationAction;
  nextClaimGeneration: number | null;
  result: WorkerAttemptResultV1 | null;
  completeness: ObservabilityCompletenessV1 | null;
  decidedAt: string;
}
export interface ReconciliationJournalEntry {
  schemaVersion: "nova-observability-reconciliation.v1";
  decision: ReconciliationDecision;
  decisionKey: string;
}

function key(
  attempt: ReconciliationAttempt,
  resultDigest: string | null,
  action: ReconciliationAction,
): string {
  return [
    attempt.pipelineRunId,
    attempt.planId,
    attempt.nodeId,
    attempt.attemptId,
    String(attempt.claimGeneration),
    resultDigest ?? "-",
    action,
  ].join("|");
}
function validTime(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed))
    throw new Error("NOVA_RECONCILIATION_TIME_INVALID");
  return parsed;
}
function missingIntent(
  pipelineRunId: string,
  workerId: string,
  evaluatedAt: string,
): ObservabilityCompletenessV1 {
  return {
    schemaVersion: "observability-completeness.v1",
    pipelineRunId,
    state: "partial",
    requiredClosureIds: ["closure:completion-intent"],
    admittedClosureIds: [],
    missingClosureIds: ["closure:completion-intent"],
    missingRanges: [],
    unresolvedItems: [
      {
        itemId: "gap:completion-intent",
        kind: "missing-closure",
        producer: {
          producerId: workerId,
          bootId: "boot:unknown",
          producerType: "buster",
        },
        subjectId: "closure:completion-intent",
        reasonCode: "completion-intent-missing",
      },
    ],
    evaluatedAt,
  };
}

export class NovaObservabilityReconciler {
  readonly #attempts: FileDurableAttemptStore;
  readonly #admission: FileObservabilityAdmissionStore;
  readonly #journal: FileJournal<ReconciliationJournalEntry>;
  readonly #now: () => Date;
  constructor(options: {
    attemptStore: FileDurableAttemptStore;
    admissionStore: FileObservabilityAdmissionStore;
    journalFile: string;
    now?: () => Date;
  }) {
    this.#attempts = options.attemptStore;
    this.#admission = options.admissionStore;
    this.#journal = new FileJournal(options.journalFile);
    this.#now = options.now ?? (() => new Date());
  }
  async reconcile(
    attempts: ReadonlyArray<ReconciliationAttempt>,
  ): Promise<ReconciliationDecision[]> {
    const desiredSnapshot = [...structuredClone(attempts)];
    if (
      desiredSnapshot.some(
        (item) =>
          typeof item.planId !== "string" ||
          item.planId.length === 0 ||
          typeof item.nodeId !== "string" ||
          item.nodeId.length === 0,
      )
    )
      throw new Error("NOVA_RECONCILIATION_OWNER_INVALID");
    const identities = desiredSnapshot.map(
      (item) =>
        `${item.pipelineRunId}\0${item.planId}\0${item.attemptId}\0${item.claimGeneration}`,
    );
    if (new Set(identities).size !== identities.length)
      throw new Error("NOVA_RECONCILIATION_ATTEMPT_DUPLICATE");
    if (
      desiredSnapshot.some(
        (item) =>
          item.gateClass === "authoritative-final" &&
          item.requiredClosures.length === 0,
      )
    )
      throw new Error("NOVA_FINAL_OBSERVABILITY_REQUIREMENTS_MISSING");
    const previous = this.#journal.refresh();
    for (const desired of desiredSnapshot) {
      const mapped = previous.find(
        (record) =>
          record.entry.decision.pipelineRunId === desired.pipelineRunId &&
          record.entry.decision.planId === desired.planId &&
          record.entry.decision.attemptId === desired.attemptId &&
          record.entry.decision.claimGeneration === desired.claimGeneration,
      );
      if (mapped && mapped.entry.decision.nodeId !== desired.nodeId)
        throw new Error("NOVA_RECONCILIATION_NODE_MAPPING_CONFLICT");
    }
    const snapshot = await this.#attempts.snapshot();
    const decisions: ReconciliationDecision[] = [];
    for (const desired of desiredSnapshot.sort((left, right) =>
      left.attemptId.localeCompare(right.attemptId),
    )) {
      const claimExpiresAt = validTime(desired.claimExpiresAt);
      const matching = snapshot.results
        .filter(
          (item) =>
            item.pipelineRunId === desired.pipelineRunId &&
            item.attemptId === desired.attemptId,
        )
        .sort((left, right) => right.claimGeneration - left.claimGeneration);
      let newest = matching[0];
      let action: ReconciliationAction;
      let result: WorkerAttemptResultV1 | null = null;
      let completeness: ObservabilityCompletenessV1 | null = null;
      let nextClaimGeneration: number | null = null;
      const identityMatches =
        newest?.claimGeneration === desired.claimGeneration &&
        newest.planId === desired.planId &&
        newest.nodeId === desired.nodeId &&
        newest.result.claimId === desired.claimId &&
        newest.workerId === desired.workerId;
      if (newest && identityMatches && newest.storedAt === null) {
        try {
          newest = await this.#attempts.storeResult(
            desired.pipelineRunId,
            newest.result,
            newest.completionIntent,
            { planId: desired.planId, nodeId: desired.nodeId },
          );
        } catch {
          // The result remains pending. The normal expiry branch below keeps
          // it out of the import path and issues a new claim generation.
        }
      }
      if (newest && newest.claimGeneration > desired.claimGeneration)
        action = "stale-result-rejected";
      else if (
        newest &&
        newest.claimGeneration === desired.claimGeneration &&
        (newest.planId !== desired.planId ||
          newest.nodeId !== desired.nodeId ||
          newest.result.claimId !== desired.claimId ||
          newest.workerId !== desired.workerId)
      )
        action = "identity-mismatch-rejected";
      else if (
        newest &&
        newest.claimGeneration === desired.claimGeneration &&
        (typeof newest.storedAt !== "string" ||
          validTime(newest.storedAt) >= claimExpiresAt)
      ) {
        action = "requeue";
        nextClaimGeneration = desired.claimGeneration + 1;
      } else if (newest && newest.claimGeneration === desired.claimGeneration) {
        result = structuredClone(newest.result);
        const requiredIntent = newest.completionIntent?.closure;
        const intentDeclared =
          !!requiredIntent &&
          desired.requiredClosures.some(
            (item) =>
              item.closureId === requiredIntent.closureId &&
              item.producer.producerId === requiredIntent.producer.producerId &&
              item.producer.bootId === requiredIntent.producer.bootId &&
              item.producer.producerType ===
                requiredIntent.producer.producerType,
          );
        if (!intentDeclared) {
          completeness = missingIntent(
            desired.pipelineRunId,
            desired.workerId,
            this.#now().toISOString(),
          );
          action =
            desired.gateClass === "development"
              ? "continue-degraded"
              : "blocked-incomplete";
        } else {
          try {
            await this.#attempts.resumeCompletion(
              desired.pipelineRunId,
              desired.attemptId,
              desired.claimGeneration,
              this.#admission,
            );
          } catch {
            // Completeness below records the unavailable closure. The durable
            // completion intent remains available for the next reconciliation.
          }
          completeness = await this.#attempts.evaluateCompleteness(
            desired.pipelineRunId,
            desired.requiredClosures,
            this.#admission,
          );
          if (completeness.state === "complete") action = "imported";
          else
            action =
              desired.gateClass === "development"
                ? "continue-degraded"
                : "blocked-incomplete";
        }
      } else if (claimExpiresAt > this.#now().getTime()) action = "reconnect";
      else {
        action = "requeue";
        nextClaimGeneration = desired.claimGeneration + 1;
      }
      const decidedAt = this.#now().toISOString();
      let decision: ReconciliationDecision = {
        pipelineRunId: desired.pipelineRunId,
        planId: desired.planId,
        nodeId: desired.nodeId,
        attemptId: desired.attemptId,
        claimGeneration: desired.claimGeneration,
        action,
        nextClaimGeneration,
        result,
        completeness,
        decidedAt,
      };
      const decisionKey = key(desired, result?.resultDigest ?? null, action);
      decision = this.#journal.transact((records, append) => {
        const existing = records.find(
          (record) => record.entry.decisionKey === decisionKey,
        );
        if (existing)
          return {
            ...structuredClone(existing.entry.decision),
            action:
              action === "imported"
                ? "already-imported"
                : existing.entry.decision.action,
          };
        append({
          schemaVersion: "nova-observability-reconciliation.v1",
          decision,
          decisionKey,
        });
        return decision;
      });
      decisions.push(decision);
    }
    return decisions;
  }
  records(): readonly ReconciliationJournalEntry[] {
    return this.#journal.refresh().map((item) => item.entry);
  }
}

interface PersistedReconciliationPlan {
  schemaVersion: "nova-observability-plan.v1";
  pipelineRunId: string;
  attempts: ReconciliationAttempt[];
}

const EMBEDDED_ATTEMPT_LIMITS = {
  maximumEvidenceObjects: 100_000,
  maximumEvidenceBytes: 10 * 1024 * 1024 * 1024,
  maximumEvidenceObjectBytes: 1024 * 1024 * 1024,
  maximumResults: 100_000,
  maximumClosures: 100_000,
  maximumMetadataBytes: 1024 * 1024 * 1024,
  maximumPendingEvidenceAgeMs: 60 * 60 * 1000,
} as const;
const EMBEDDED_ADMISSION_LIMITS = {
  maximumIngressBytes: 16 * 1024 * 1024,
  maximumRecords: 1_000_000,
  maximumBytes: 4 * 1024 * 1024 * 1024,
  maximumQuarantineRecords: 10_000,
  maximumQuarantineBytes: 1024 * 1024 * 1024,
} as const;

function observabilityRoot(runRoot: string): string {
  return path.join(runRoot, "observability");
}

export async function persistNovaObservabilityPlan(
  runRoot: string,
  pipelineRunId: string,
  attempts: ReadonlyArray<ReconciliationAttempt>,
): Promise<void> {
  const snapshot: PersistedReconciliationPlan = {
    schemaVersion: "nova-observability-plan.v1",
    pipelineRunId,
    attempts: [...structuredClone(attempts)],
  };
  if (snapshot.attempts.some((item) => item.pipelineRunId !== pipelineRunId))
    throw new Error("NOVA_OBSERVABILITY_PLAN_RUN_MISMATCH");
  await writeDurableState(
    path.join(observabilityRoot(runRoot), "reconciliation-plan.json"),
    snapshot,
  );
}

export async function reconcileNovaObservabilityOnRecovery(
  runRoot: string,
  pipelineRunId: string,
  now?: () => Date,
): Promise<ReconciliationDecision[]> {
  const root = observabilityRoot(runRoot);
  const planFile = path.join(root, "reconciliation-plan.json");
  if (!fs.existsSync(planFile)) return [];
  const parsed = JSON.parse(
    fs.readFileSync(planFile, "utf8"),
  ) as Partial<PersistedReconciliationPlan>;
  if (
    parsed.schemaVersion !== "nova-observability-plan.v1" ||
    parsed.pipelineRunId !== pipelineRunId ||
    !Array.isArray(parsed.attempts) ||
    parsed.attempts.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        item.pipelineRunId !== pipelineRunId ||
        typeof item.planId !== "string" ||
        item.planId.length === 0 ||
        typeof item.nodeId !== "string" ||
        item.nodeId.length === 0,
    )
  )
    throw new Error("NOVA_OBSERVABILITY_PLAN_INVALID");
  const reconciler = new NovaObservabilityReconciler({
    attemptStore: new FileDurableAttemptStore(
      path.join(root, "attempts"),
      EMBEDDED_ATTEMPT_LIMITS,
    ),
    admissionStore: new FileObservabilityAdmissionStore(
      path.join(root, "admission"),
      EMBEDDED_ADMISSION_LIMITS,
    ),
    journalFile: path.join(root, "reconciliation.jsonl"),
    ...(now ? { now } : {}),
  });
  return reconciler.reconcile(parsed.attempts);
}
