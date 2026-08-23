import type { RemotePlanJobV1, ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { NovaRemoteTestGate } from './remote-result-import.ts';

export interface LegacySuiteMigrationEntry {
  readonly state: 'unmigrated' | 'migrated';
  readonly successor: string;
}

export type LegacySuiteMigrationLedger = Readonly<Record<string, LegacySuiteMigrationEntry>>;

export type ShadowComparisonOutcome<TShadow> =
  | Readonly<{ status: 'completed'; result: TShadow }>
  | Readonly<{ status: 'failed'; error: Readonly<{ name: string; message: string }> }>
  | Readonly<{ status: 'timed-out'; timeoutMs: number }>;

export interface LegacyAuthoritativeShadowComparison<TLegacy, TShadow> {
  readonly authority: 'legacy';
  readonly gateResult: TLegacy;
  readonly legacy: TLegacy;
  readonly shadow: Readonly<{ status: 'deferred' }>;
  readonly collectShadow: () => Promise<ShadowComparisonOutcome<TShadow>>;
}

/**
 * Phase-parity comparison only. The legacy result is returned as gateResult by
 * construction. The shadow result is evidence and cannot control the gate.
 */
export async function runLegacyAuthoritativeShadowComparison<TLegacy, TShadow>(input: {
  readonly runLegacy: () => Promise<TLegacy>;
  readonly runShadow: (signal: AbortSignal) => Promise<TShadow>;
  readonly shadowTimeoutMs: number;
}): Promise<LegacyAuthoritativeShadowComparison<TLegacy, TShadow>> {
  const maximumTimerMilliseconds = 2_147_483_647;
  if (!Number.isSafeInteger(input.shadowTimeoutMs)
      || input.shadowTimeoutMs < 1
      || input.shadowTimeoutMs > maximumTimerMilliseconds) {
    throw new Error('SHADOW_COMPARISON_TIMEOUT_INVALID');
  }
  const legacy = await Promise.resolve().then(input.runLegacy);
  let completion: Promise<ShadowComparisonOutcome<TShadow>> | undefined;
  const collectShadow = () => {
    if (completion) return completion;
    completion = (async () => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const shadowPromise = Promise.resolve().then(() => input.runShadow(controller.signal)).then(
        (result) => Object.freeze({ status: 'completed' as const, result }),
        (cause: unknown) => {
          const error = cause instanceof Error
            ? { name: cause.name, message: cause.message }
            : { name: 'Error', message: String(cause) };
          return Object.freeze({ status: 'failed' as const, error: Object.freeze(error) });
        },
      );
      const shadowDeadline = new Promise<Readonly<{ status: 'timed-out'; timeoutMs: number }>>((resolve) => {
        timer = setTimeout(() => {
          resolve(Object.freeze({ status: 'timed-out', timeoutMs: input.shadowTimeoutMs }));
          controller.abort();
        }, input.shadowTimeoutMs);
      });
      try {
        return await Promise.race([shadowPromise, shadowDeadline]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();
    return completion;
  };
  return Object.freeze({
    authority: 'legacy', gateResult: legacy, legacy,
    shadow: Object.freeze({ status: 'deferred' as const }), collectShadow,
  });
}

export function assertLegacyBridgeSelection(
  plan: ResolvedTestPlanV1,
  legacySuites: readonly string[],
  ledger: LegacySuiteMigrationLedger,
): void {
  if (new Set(legacySuites).size !== legacySuites.length) throw new Error('LEGACY_SUITE_SELECTION_DUPLICATE');
  const activeContracts = new Set(plan.nodes.map((node) => node.provider.contractId));
  for (const suite of legacySuites) {
    const entry = ledger[suite];
    if (!entry) throw new Error(`LEGACY_SUITE_UNKNOWN:${suite}`);
    if (entry.state !== 'unmigrated') throw new Error(`LEGACY_SUITE_ALREADY_MIGRATED:${suite}`);
    if (activeContracts.has(entry.successor)) throw new Error(`LEGACY_SUITE_DUAL_AUTHORITY:${suite}`);
  }
}

export class NovaTestGateAuthorityRouter {
  readonly #remote: NovaRemoteTestGate;
  readonly #ledger: LegacySuiteMigrationLedger;
  constructor(options: { remote: NovaRemoteTestGate; ledger: LegacySuiteMigrationLedger }) {
    this.#remote = options.remote;
    this.#ledger = options.ledger;
  }
  async execute<T>(input: {
    job: RemotePlanJobV1;
    timeoutMs: number;
    signal?: AbortSignal;
    legacySuites?: readonly string[];
    runLegacy?: () => Promise<T>;
  }) {
    const legacySuites = input.legacySuites ?? [];
    assertLegacyBridgeSelection(input.job.plan, legacySuites, this.#ledger);
    if (legacySuites.length > 0 && !input.runLegacy) throw new Error('LEGACY_SUITE_RUNNER_REQUIRED');
    const remote = await this.#remote.execute(input.job, { timeoutMs: input.timeoutMs, legacySuites,
      ...(input.signal ? { signal: input.signal } : {}) });
    const legacy = legacySuites.length > 0 && remote.stageResult.outcome === 'passed'
      ? await input.runLegacy!()
      : null;
    return { remote, legacy } as const;
  }
}
