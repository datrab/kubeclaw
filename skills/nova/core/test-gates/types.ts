import type { ExecutionLimitsV1, JsonValue, TestMode } from '@kubeclaw/pipeline-test-gate-contract';
import type { RegistrySnapshot } from '@kubeclaw/plugin-foundation/registry/types';

export type ResultFilter = 'passed' | 'failed' | 'skipped' | 'errored' | 'cancelled' | 'timed_out';

export interface DependencyDeclaration {
  readonly nodeId: string;
  readonly acceptedResults?: readonly ResultFilter[];
}

export interface InputLinkDeclaration {
  readonly from: string;
  readonly output: string;
  readonly mediaType?: string;
}

export interface ConditionDeclaration {
  readonly changedPaths?: readonly string[];
  readonly moduleType?: string | readonly string[];
  readonly pipelineStage?: string | readonly string[];
}

export interface EvidenceOverride {
  readonly onPass?: readonly string[];
  readonly onFail?: readonly string[];
  readonly onError?: readonly string[];
}

export interface NodeDeclaration {
  readonly uses: string;
  readonly config?: Readonly<Record<string, JsonValue>>;
  readonly mode?: TestMode;
  readonly review?: { readonly agent: string };
  readonly needs?: readonly (string | DependencyDeclaration)[];
  readonly inputs?: Readonly<Record<string, InputLinkDeclaration>>;
  readonly when?: ConditionDeclaration;
  readonly timeoutMs?: number;
  readonly limits?: Partial<ExecutionLimitsV1>;
  readonly retries?: number;
  readonly acceptUnsafeRetry?: boolean;
  readonly concurrencyGroup?: string;
  readonly matrix?: Readonly<Record<string, readonly JsonValue[]>>;
  readonly evidence?: EvidenceOverride;
}

export type NodeOverride = Omit<Partial<NodeDeclaration>, 'uses'>;

export interface SuiteTemplateV1 {
  readonly schemaVersion: 'test-suite-template.v1';
  readonly contractId: string;
  readonly tests?: Readonly<Record<string, NodeDeclaration>>;
  readonly fixtures?: Readonly<Record<string, NodeDeclaration>>;
  readonly concurrencyLimits?: Readonly<Record<string, number>>;
}

export interface SuiteSelection {
  readonly uses: string;
  readonly exclude?: readonly string[];
  readonly overrides?: Readonly<Record<string, NodeOverride>>;
  readonly add?: Readonly<Record<string, NodeDeclaration>>;
}

export interface TestScopeDeclaration {
  readonly suites?: Readonly<Record<string, SuiteSelection>>;
  readonly tests?: Readonly<Record<string, NodeDeclaration>>;
  readonly fixtures?: Readonly<Record<string, NodeDeclaration>>;
  readonly concurrencyLimits?: Readonly<Record<string, number>>;
}

export interface ResolverFacts {
  readonly changedPaths: readonly string[];
  readonly moduleType: string | null;
  readonly pipelineStage: string | null;
}

export interface ResolverPolicy {
  readonly defaultTimeoutMs: number;
  readonly maximumTimeoutMs: number;
  readonly defaultLimits: ExecutionLimitsV1;
  readonly maximumLimits: ExecutionLimitsV1;
  readonly maximumRetryCount: number;
  readonly maximumMatrixSize: number;
  readonly maximumNodes: number;
  readonly defaultConcurrencyLimit: number;
  readonly maximumConcurrencyLimits: Readonly<Record<string, number>>;
  /** Optional exact adapter registration ID for each report format. */
  readonly reportAdapters?: ReadonlyMap<string, string>;
}

export interface TestPlanScope {
  readonly moduleId: string | null;
  readonly gateId: string | null;
}

export interface ResolveTestPlanInput {
  readonly planId: string;
  readonly runId: string;
  readonly project: string;
  readonly scope: TestPlanScope;
  readonly createdAt: string;
  readonly declaration: TestScopeDeclaration;
  readonly suiteTemplates: readonly SuiteTemplateV1[];
  readonly registry: RegistrySnapshot;
  readonly facts: ResolverFacts;
  readonly policy: ResolverPolicy;
}

export interface LoadedPipelineTestScope {
  readonly project: string;
  readonly declaration: TestScopeDeclaration;
}

export interface PipelineLintDeclaration {
  readonly uses: 'kubeclaw.lint.full';
  readonly policyProject: string;
  readonly rawManifests: readonly string[];
  readonly helmCharts: readonly string[];
}
