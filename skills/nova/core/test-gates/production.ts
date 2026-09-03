import path from 'node:path';
import { assertSecureRemoteEndpoint } from './secure-endpoint.ts';
import type { ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { DurableRecordLimits } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { assertLegacyBridgeSelection, NovaTestGateAuthorityRouter,
  type LegacySuiteMigrationLedger } from './legacy-bridge.ts';
import {
  createRemotePlanJob,
  FileNovaRemotePlanStore,
  HttpRemotePlanTransport,
  NovaRemotePlanDispatcher,
} from './remote-dispatch.ts';
import {
  FileNovaGateImportStore,
  FileNovaTestExecutionGraphStore,
  NovaRemoteGateImporter,
  NovaRemoteTestGate,
} from './remote-result-import.ts';
import { buildCommittedSourceSnapshot } from './source-snapshot.ts';

export interface ProductionNovaTestGateOptions {
  readonly stateRoot: string;
  readonly endpoint: string;
  readonly token?: string;
  readonly authentication?: 'bearer' | 'spiffe-proxy';
  readonly sourceAuthority: string;
  readonly sourceAttestationPrivateKey: string | Buffer;
  readonly pollMilliseconds: number;
  readonly maximumResponseBytes: number;
  readonly maximumResultBytes: number;
  readonly maximumArchiveBytes: number;
  readonly maximumArchiveStoreBytes: number;
  readonly maximumEvidenceBytes: number;
  readonly maximumEvidenceStoreBytes: number;
  readonly recordLimits: DurableRecordLimits;
  readonly legacyLedger: LegacySuiteMigrationLedger;
}

export interface ProductionNovaTestGateExecutionInput<T> {
  readonly idempotencyKey: string;
  readonly pipelineStageId: string;
  readonly plan: ResolvedTestPlanV1;
  readonly repositoryRoot: string;
  readonly repositoryId: string;
  readonly revision?: string;
  readonly grants: ReadonlyMap<string, readonly string[]>;
  readonly maximumConcurrency: number;
  readonly submittedAt: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly legacySuites?: readonly string[];
  readonly runLegacy?: () => Promise<T>;
}

export class ProductionNovaTestGate {
  readonly #router: NovaTestGateAuthorityRouter;
  readonly #sourceAuthority: string;
  readonly #sourceAttestationPrivateKey: string | Buffer;
  readonly #maximumArchiveBytes: number;
  readonly #legacyLedger: LegacySuiteMigrationLedger;
  constructor(options: { router: NovaTestGateAuthorityRouter; sourceAuthority: string;
    sourceAttestationPrivateKey: string | Buffer; maximumArchiveBytes: number; legacyLedger: LegacySuiteMigrationLedger }) {
    this.#router = options.router;
    this.#sourceAuthority = options.sourceAuthority;
    this.#sourceAttestationPrivateKey = options.sourceAttestationPrivateKey;
    this.#maximumArchiveBytes = options.maximumArchiveBytes;
    this.#legacyLedger = options.legacyLedger;
  }
  async execute<T>(input: ProductionNovaTestGateExecutionInput<T>) {
    const legacySuites = input.legacySuites ?? [];
    assertLegacyBridgeSelection(input.plan, legacySuites, this.#legacyLedger);
    const source = buildCommittedSourceSnapshot({ repositoryRoot: input.repositoryRoot,
      repositoryId: input.repositoryId, pipelineStageId: input.pipelineStageId,
      creatorAuthority: this.#sourceAuthority,
      attestationPrivateKey: this.#sourceAttestationPrivateKey,
      maximumArchiveBytes: this.#maximumArchiveBytes,
      ...(input.revision ? { revision: input.revision } : {}) });
    const job = createRemotePlanJob({ idempotencyKey: input.idempotencyKey,
      pipelineStageId: input.pipelineStageId, plan: input.plan, sourceSnapshot: source.sourceSnapshot,
      repositoryArchive: source.repositoryArchive, grants: input.grants,
      maximumConcurrency: input.maximumConcurrency, submittedAt: input.submittedAt });
    return this.#router.execute({ job, timeoutMs: input.timeoutMs, legacySuites,
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.runLegacy ? { runLegacy: input.runLegacy } : {}) });
  }
}

/**
 * Build the one production authority path for resolved test plans.
 *
 * This composition keeps durable dispatch, terminal reconnect, verified import,
 * evidence transfer, gate policy, and legacy authority selection together.
 */
export function createProductionNovaTestGate(
  options: ProductionNovaTestGateOptions,
): ProductionNovaTestGate {
  if (!path.isAbsolute(options.stateRoot)) throw new Error('NOVA_REMOTE_STATE_ROOT_NOT_ABSOLUTE');
  const endpoint = assertSecureRemoteEndpoint(options.endpoint);
  const transport = new HttpRemotePlanTransport({
    endpoint: endpoint.href,
    ...(options.token ? { token: options.token } : {}),
    ...(options.authentication ? { authentication: options.authentication } : {}),
    maximumResponseBytes: options.maximumResponseBytes,
    maximumResultBytes: options.maximumResultBytes,
  });
  const dispatcher = new NovaRemotePlanDispatcher({
    store: new FileNovaRemotePlanStore(path.join(options.stateRoot, 'dispatch'), {
      recordLimits: options.recordLimits,
      maximumArchiveBytes: options.maximumArchiveBytes,
      maximumArchiveStoreBytes: options.maximumArchiveStoreBytes,
    }),
    transport,
    pollMilliseconds: options.pollMilliseconds,
  });
  const importer = new NovaRemoteGateImporter({
    store: new FileNovaGateImportStore(path.join(options.stateRoot, 'imports'), {
      recordLimits: options.recordLimits,
      maximumEvidenceStoreBytes: options.maximumEvidenceStoreBytes,
      graphStore: new FileNovaTestExecutionGraphStore(path.join(options.stateRoot, 'execution-graph'), options.recordLimits),
    }),
    evidence: transport,
    results: transport,
    maximumEvidenceBytes: options.maximumEvidenceBytes,
    maximumResultBytes: options.maximumResultBytes,
  });
  const remote = new NovaRemoteTestGate({
    dispatcher,
    importer,
    legacyLedger: options.legacyLedger,
  });
  const router = new NovaTestGateAuthorityRouter({ remote, ledger: options.legacyLedger });
  return new ProductionNovaTestGate({ router, sourceAuthority: options.sourceAuthority,
    sourceAttestationPrivateKey: options.sourceAttestationPrivateKey,
    maximumArchiveBytes: options.maximumArchiveBytes, legacyLedger: options.legacyLedger });
}
