import crypto from 'node:crypto';
import {
  resolvedTestPlanDigest,
  stableTestIdentity,
  validatePipelineTestGateContract,
  type DependencyV1,
  type EvidencePolicyV1,
  type ExecutionLimitsV1,
  type JsonValue,
  type ResolvedPlanNodeV1,
  type ResolvedSuiteRefV1,
  type ResolvedTestPlanV1,
  type TypedLinkV1,
} from '@kubeclaw/pipeline-test-gate-contract';
import { resolveTestProviderConfiguration } from '@kubeclaw/plugin-foundation/registry/configuration';
import type { ReportAdapterRegistryEntry, TestProviderRegistryEntry } from '@kubeclaw/plugin-foundation/registry/types';
import type {
  ConditionDeclaration,
  DependencyDeclaration,
  EvidenceOverride,
  NodeDeclaration,
  NodeOverride,
  ResolveTestPlanInput,
  ResolverPolicy,
  ResultFilter,
  SuiteSelection,
  SuiteTemplateV1,
} from './types.ts';

const CONTRACT_ID = /^[a-z0-9][a-z0-9._/-]*@[1-9][0-9]*$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const RESULT_VALUES = new Set<ResultFilter>(['passed', 'failed', 'skipped', 'errored', 'cancelled', 'timed_out']);
const LIMIT_KEYS = ['cpuMillis', 'memoryBytes', 'logBytes', 'artifactBytes', 'artifactFiles', 'processes'] as const;
const DEFAULT_RETRY_COUNT = 1;
const NODE_KEYS = new Set(['uses', 'config', 'mode', 'review', 'needs', 'inputs', 'when', 'timeoutMs', 'limits', 'retries', 'acceptUnsafeRetry', 'concurrencyGroup', 'matrix', 'evidence']);
const OVERRIDE_KEYS = new Set([...NODE_KEYS].filter((key) => key !== 'uses'));

export class TestPlanResolutionError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}:${detail}`);
    this.name = 'TestPlanResolutionError';
    this.code = code;
  }
}

interface DraftNode {
  readonly id: string;
  readonly suiteInstanceId: string | null;
  readonly kind: 'test' | 'fixture';
  readonly declaration: NodeDeclaration;
}

interface ExpandedNode {
  readonly baseId: string;
  readonly node: ResolvedPlanNodeV1;
  readonly declaration: NodeDeclaration;
  readonly provider: TestProviderRegistryEntry;
}

function fail(code: string, detail: string): never {
  throw new TestPlanResolutionError(code, detail);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('TEST_PLAN_DECLARATION_INVALID', label);
  return value as Record<string, unknown>;
}

function stableId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !STABLE_ID.test(value) || value.length > 256) fail('TEST_PLAN_ID_INVALID', label);
  return value;
}

function localId(value: unknown, label: string): string {
  const result = stableId(value, label);
  if (result.includes('/')) fail('TEST_PLAN_LOCAL_ID_INVALID', label);
  return result;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function jsonObject(value: unknown, label: string): Record<string, JsonValue> {
  const item = record(value, label);
  if (!isJsonValue(item)) fail('TEST_PLAN_DECLARATION_INVALID', label);
  return structuredClone(item) as Record<string, JsonValue>;
}

function assertKnownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail('TEST_PLAN_FIELD_UNKNOWN', `${label}.${key}`);
}

function stringList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) fail('TEST_PLAN_DECLARATION_INVALID', label);
  return value;
}

function validateGlobPattern(pattern: string): void {
  if (pattern.startsWith('/') || pattern.split('/').includes('..')) fail('TEST_PLAN_CONDITION_INVALID', pattern);
}

function parseDependency(value: unknown, label: string): string | DependencyDeclaration {
  if (typeof value === 'string') return stableId(value, label);
  const item = record(value, label);
  assertKnownKeys(item, new Set(['nodeId', 'acceptedResults']), label);
  const nodeId = stableId(item.nodeId, `${label}.nodeId`);
  const acceptedResults = item.acceptedResults === undefined
    ? undefined
    : stringList(item.acceptedResults, `${label}.acceptedResults`) as ResultFilter[];
  if (acceptedResults?.length === 0 || acceptedResults?.some((result) => !RESULT_VALUES.has(result))) {
    fail('TEST_PLAN_DEPENDENCY_INVALID', label);
  }
  if (acceptedResults && new Set(acceptedResults).size !== acceptedResults.length) fail('TEST_PLAN_DEPENDENCY_INVALID', label);
  return acceptedResults === undefined ? { nodeId } : { nodeId, acceptedResults: [...acceptedResults].sort() as ResultFilter[] };
}

function parseCondition(value: unknown, label: string): ConditionDeclaration {
  const item = record(value, label);
  assertKnownKeys(item, new Set(['changedPaths', 'moduleType', 'pipelineStage']), label);
  const changedPaths = item.changedPaths === undefined ? undefined : stringList(item.changedPaths, `${label}.changedPaths`);
  for (const pattern of changedPaths ?? []) validateGlobPattern(pattern);
  const parseFact = (field: 'moduleType' | 'pipelineStage'): string | readonly string[] | undefined => {
    const fact = item[field];
    if (fact === undefined) return undefined;
    if (typeof fact === 'string' && fact.length > 0) return fact;
    const values = stringList(fact, `${label}.${field}`);
    if (values.length === 0) fail('TEST_PLAN_CONDITION_INVALID', `${label}.${field}`);
    return values;
  };
  const moduleType = parseFact('moduleType');
  const pipelineStage = parseFact('pipelineStage');
  if (changedPaths === undefined && moduleType === undefined && pipelineStage === undefined) fail('TEST_PLAN_CONDITION_INVALID', label);
  if (changedPaths?.length === 0) fail('TEST_PLAN_CONDITION_INVALID', `${label}.changedPaths`);
  return { ...(changedPaths === undefined ? {} : { changedPaths }), ...(moduleType === undefined ? {} : { moduleType }),
    ...(pipelineStage === undefined ? {} : { pipelineStage }) };
}

function parseEvidence(value: unknown, label: string): EvidenceOverride {
  const item = record(value, label);
  assertKnownKeys(item, new Set(['onPass', 'onFail', 'onError']), label);
  return {
    ...(item.onPass === undefined ? {} : { onPass: stringList(item.onPass, `${label}.onPass`) }),
    ...(item.onFail === undefined ? {} : { onFail: stringList(item.onFail, `${label}.onFail`) }),
    ...(item.onError === undefined ? {} : { onError: stringList(item.onError, `${label}.onError`) }),
  };
}

function parseNode(value: unknown, label: string, override = false): NodeDeclaration | NodeOverride {
  const item = record(value, label);
  assertKnownKeys(item, override ? OVERRIDE_KEYS : NODE_KEYS, label);
  const uses = override ? undefined : item.uses;
  if (!override && (typeof uses !== 'string' || !CONTRACT_ID.test(uses))) fail('TEST_PLAN_PROVIDER_INVALID', label);
  if (item.mode !== undefined && item.mode !== 'blocking' && item.mode !== 'advisory') fail('TEST_PLAN_MODE_INVALID', label);
  const needs = item.needs === undefined ? undefined : (() => {
    if (!Array.isArray(item.needs)) fail('TEST_PLAN_DECLARATION_INVALID', `${label}.needs`);
    return item.needs.map((dependency, index) => parseDependency(dependency, `${label}.needs.${index}`));
  })();
  const inputs = item.inputs === undefined ? undefined : (() => {
    const values = record(item.inputs, `${label}.inputs`);
    return Object.fromEntries(Object.entries(values).map(([name, raw]) => {
      stableId(name, `${label}.inputs.${name}`);
      const link = record(raw, `${label}.inputs.${name}`);
      assertKnownKeys(link, new Set(['from', 'output', 'mediaType']), `${label}.inputs.${name}`);
      return [name, {
        from: stableId(link.from, `${label}.inputs.${name}.from`),
        output: stableId(link.output, `${label}.inputs.${name}.output`),
        ...(link.mediaType === undefined ? {} : { mediaType: typeof link.mediaType === 'string' && link.mediaType.length > 0
          ? link.mediaType : fail('TEST_PLAN_DECLARATION_INVALID', `${label}.inputs.${name}.mediaType`) }),
      }];
    }));
  })();
  const limits = item.limits === undefined ? undefined : (() => {
    const values = record(item.limits, `${label}.limits`);
    assertKnownKeys(values, new Set(LIMIT_KEYS), `${label}.limits`);
    return values as Partial<ExecutionLimitsV1>;
  })();
  const matrix = item.matrix === undefined ? undefined : (() => {
    const values = record(item.matrix, `${label}.matrix`);
    return Object.fromEntries(Object.entries(values).map(([field, entries]) => {
      stableId(field, `${label}.matrix.${field}`);
      if (!Array.isArray(entries) || entries.length === 0) fail('TEST_PLAN_MATRIX_INVALID', `${label}.matrix.${field}`);
      if (!entries.every(isJsonValue)) fail('TEST_PLAN_MATRIX_INVALID', `${label}.matrix.${field}`);
      return [field, structuredClone(entries) as JsonValue[]];
    }));
  })();
  const result = {
    ...(uses === undefined ? {} : { uses }),
    ...(item.config === undefined ? {} : { config: jsonObject(item.config, `${label}.config`) }),
    ...(item.mode === undefined ? {} : { mode: item.mode as 'blocking' | 'advisory' }),
    ...(item.review === undefined ? {} : { review: (() => {
      const review = record(item.review, `${label}.review`);
      assertKnownKeys(review, new Set(['agent']), `${label}.review`);
      return { agent: stableId(review.agent, `${label}.review.agent`) };
    })() }),
    ...(needs === undefined ? {} : { needs }),
    ...(inputs === undefined ? {} : { inputs }),
    ...(item.when === undefined ? {} : { when: parseCondition(item.when, `${label}.when`) }),
    ...(item.timeoutMs === undefined ? {} : { timeoutMs: typeof item.timeoutMs === 'number'
      ? item.timeoutMs : fail('TEST_PLAN_TIMEOUT_INVALID', label) }),
    ...(limits === undefined ? {} : { limits }),
    ...(item.retries === undefined ? {} : { retries: typeof item.retries === 'number'
      ? item.retries : fail('TEST_PLAN_RETRY_INVALID', label) }),
    ...(item.acceptUnsafeRetry === undefined ? {} : { acceptUnsafeRetry: typeof item.acceptUnsafeRetry === 'boolean'
      ? item.acceptUnsafeRetry : fail('TEST_PLAN_RETRY_INVALID', label) }),
    ...(item.concurrencyGroup === undefined ? {} : { concurrencyGroup: stableId(item.concurrencyGroup, `${label}.concurrencyGroup`) }),
    ...(matrix === undefined ? {} : { matrix }),
    ...(item.evidence === undefined ? {} : { evidence: parseEvidence(item.evidence, `${label}.evidence`) }),
  };
  return result as NodeDeclaration | NodeOverride;
}

function deepMerge(base: Record<string, JsonValue>, override: Record<string, JsonValue>): Record<string, JsonValue> {
  const output = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    const current = output[key];
    const merged = current && value && typeof current === 'object' && typeof value === 'object'
      && !Array.isArray(current) && !Array.isArray(value)
      ? deepMerge(current as Record<string, JsonValue>, value as Record<string, JsonValue>)
      : structuredClone(value);
    Object.defineProperty(output, key, { value: merged, enumerable: true, configurable: true, writable: true });
  }
  return output;
}

function mergeNode(base: NodeDeclaration, override: NodeOverride): NodeDeclaration {
  return {
    ...base,
    ...override,
    uses: base.uses,
    config: deepMerge(base.config ?? {}, override.config ?? {}),
    evidence: { ...(base.evidence ?? {}), ...(override.evidence ?? {}) },
  };
}

function localReference(reference: string, suiteInstanceId: string): string {
  return reference.includes('/') ? reference : `${suiteInstanceId}/${reference}`;
}

function localizeNode(node: NodeDeclaration, suiteInstanceId: string): NodeDeclaration {
  return {
    ...node,
    ...(node.needs === undefined ? {} : { needs: node.needs.map((dependency) => typeof dependency === 'string'
      ? localReference(dependency, suiteInstanceId)
      : { ...dependency, nodeId: localReference(dependency.nodeId, suiteInstanceId) }) }),
    ...(node.inputs === undefined ? {} : { inputs: Object.fromEntries(Object.entries(node.inputs).map(([name, link]) => [
      name,
      { ...link, from: localReference(link.from, suiteInstanceId) },
    ])) }),
  };
}

function parseSuiteSelection(value: unknown, label: string): SuiteSelection {
  const item = record(value, label);
  assertKnownKeys(item, new Set(['uses', 'exclude', 'overrides', 'add']), label);
  if (typeof item.uses !== 'string' || !CONTRACT_ID.test(item.uses)) fail('TEST_PLAN_SUITE_INVALID', label);
  const overrides = item.overrides === undefined ? undefined : Object.fromEntries(Object.entries(record(item.overrides, `${label}.overrides`))
    .map(([id, node]) => [stableId(id, `${label}.overrides.${id}`), parseNode(node, `${label}.overrides.${id}`, true) as NodeOverride]));
  const add = item.add === undefined ? undefined : Object.fromEntries(Object.entries(record(item.add, `${label}.add`))
    .map(([id, node]) => [stableId(id, `${label}.add.${id}`), parseNode(node, `${label}.add.${id}`) as NodeDeclaration]));
  return {
    uses: item.uses,
    ...(item.exclude === undefined ? {} : { exclude: stringList(item.exclude, `${label}.exclude`) }),
    ...(overrides === undefined ? {} : { overrides }),
    ...(add === undefined ? {} : { add }),
  };
}

function validateSuiteTemplate(value: SuiteTemplateV1): SuiteTemplateV1 {
  const item = record(value, `suite.${value.contractId}`);
  assertKnownKeys(item, new Set(['schemaVersion', 'contractId', 'tests', 'fixtures', 'concurrencyLimits']), `suite.${value.contractId}`);
  if (item.schemaVersion !== 'test-suite-template.v1' || typeof item.contractId !== 'string' || !CONTRACT_ID.test(item.contractId)) {
    fail('TEST_PLAN_SUITE_INVALID', String(item.contractId));
  }
  const tests = item.tests === undefined ? {} : Object.fromEntries(Object.entries(record(item.tests, `${item.contractId}.tests`))
    .map(([id, node]) => [localId(id, `${item.contractId}.tests.${id}`), parseNode(node, `${item.contractId}.tests.${id}`)]));
  const fixtures = item.fixtures === undefined ? {} : Object.fromEntries(Object.entries(record(item.fixtures, `${item.contractId}.fixtures`))
    .map(([id, node]) => [localId(id, `${item.contractId}.fixtures.${id}`), parseNode(node, `${item.contractId}.fixtures.${id}`)]));
  const overlap = Object.keys(tests).find((id) => id in fixtures);
  if (overlap) fail('TEST_PLAN_NODE_DUPLICATE', `${item.contractId}:${overlap}`);
  const concurrencyLimits = item.concurrencyLimits === undefined ? {} : Object.fromEntries(
    Object.entries(record(item.concurrencyLimits, `${item.contractId}.concurrencyLimits`)).map(([group, limit]) => {
      stableId(group, `${item.contractId}.concurrencyLimits.${group}`);
      if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1) {
        fail('TEST_PLAN_CONCURRENCY_INVALID', `${item.contractId}.concurrencyLimits.${group}`);
      }
      return [group, limit];
    }),
  );
  return { schemaVersion: 'test-suite-template.v1', contractId: item.contractId,
    tests: tests as Record<string, NodeDeclaration>, fixtures: fixtures as Record<string, NodeDeclaration>, concurrencyLimits };
}

function draftNodes(input: ResolveTestPlanInput): {
  nodes: DraftNode[];
  requestedConcurrency: Map<string, number>;
  projectConcurrencyGroups: Set<string>;
  suites: ResolvedSuiteRefV1[];
  excludedNodeIds: string[];
} {
  const declaration = record(input.declaration, 'scope');
  assertKnownKeys(declaration, new Set(['suites', 'tests', 'fixtures', 'concurrencyLimits', 'coverage']), 'scope');
  const catalog = new Map<string, { template: SuiteTemplateV1; templateDigest: string }>();
  for (const raw of input.suiteTemplates) {
    const template = validateSuiteTemplate(raw);
    if (catalog.has(template.contractId)) fail('TEST_PLAN_SUITE_DUPLICATE', template.contractId);
    catalog.set(template.contractId, {
      template,
      templateDigest: `sha256:${crypto.createHash('sha256').update(canonical(raw)).digest('hex')}`,
    });
  }
  const nodes: DraftNode[] = [];
  const ids = new Set<string>();
  const requestedConcurrency = new Map<string, number>();
  const projectConcurrencyGroups = new Set<string>();
  const selectedSuites: ResolvedSuiteRefV1[] = [];
  const excludedNodeIds: string[] = [];
  const addNode = (node: DraftNode): void => {
    if (ids.has(node.id)) fail('TEST_PLAN_NODE_DUPLICATE', node.id);
    ids.add(node.id);
    nodes.push(node);
  };
  const addConcurrency = (values: Readonly<Record<string, number>>, source: string): void => {
    for (const [group, rawLimit] of Object.entries(values)) {
      stableId(group, `${source}.${group}`);
      if (typeof rawLimit !== 'number') fail('TEST_PLAN_CONCURRENCY_INVALID', `${source}.${group}`);
      const limit = rawLimit;
      if (!Number.isSafeInteger(limit) || limit < 1) fail('TEST_PLAN_CONCURRENCY_INVALID', `${source}.${group}`);
      requestedConcurrency.set(group, Math.min(requestedConcurrency.get(group) ?? limit, limit));
    }
  };
  const addProjectConcurrency = (values: Readonly<Record<string, number>>): void => {
    for (const [group, rawLimit] of Object.entries(values)) {
      stableId(group, `scope.concurrencyLimits.${group}`);
      if (typeof rawLimit !== 'number') fail('TEST_PLAN_CONCURRENCY_INVALID', `scope.concurrencyLimits.${group}`);
      const limit = rawLimit;
      if (!Number.isSafeInteger(limit) || limit < 1) fail('TEST_PLAN_CONCURRENCY_INVALID', `scope.concurrencyLimits.${group}`);
      const suiteLimit = requestedConcurrency.get(group);
      if (suiteLimit !== undefined && limit > suiteLimit) fail('TEST_PLAN_CONCURRENCY_INVALID', `scope.concurrencyLimits.${group}`);
      requestedConcurrency.set(group, limit);
      projectConcurrencyGroups.add(group);
    }
  };
  const suites = declaration.suites === undefined ? {} : record(declaration.suites, 'scope.suites');
  for (const [suiteInstanceId, rawSelection] of Object.entries(suites).sort(([a], [b]) => compareText(a, b))) {
    localId(suiteInstanceId, `scope.suites.${suiteInstanceId}`);
    const selection = parseSuiteSelection(rawSelection, `scope.suites.${suiteInstanceId}`);
    const catalogEntry = catalog.get(selection.uses);
    if (!catalogEntry) fail('TEST_PLAN_SUITE_MISSING', selection.uses);
    const { template, templateDigest } = catalogEntry;
    selectedSuites.push({
      instanceId: suiteInstanceId,
      contractId: template.contractId,
      templateDigest,
    });
    const excluded = new Set(selection.exclude ?? []);
    const templateNodes = new Map<string, { kind: 'test' | 'fixture'; declaration: NodeDeclaration }>();
    for (const [id, node] of Object.entries(template.tests ?? {})) templateNodes.set(id, { kind: 'test', declaration: node });
    for (const [id, node] of Object.entries(template.fixtures ?? {})) templateNodes.set(id, { kind: 'fixture', declaration: node });
    for (const id of excluded) if (!templateNodes.has(id)) fail('TEST_PLAN_EXCLUDE_INVALID', `${suiteInstanceId}/${id}`);
    for (const id of Object.keys(selection.overrides ?? {})) if (!templateNodes.has(id)) fail('TEST_PLAN_OVERRIDE_INVALID', `${suiteInstanceId}/${id}`);
    for (const [id, value] of [...templateNodes].sort(([a], [b]) => compareText(a, b))) {
      if (excluded.has(id)) { excludedNodeIds.push(`${suiteInstanceId}/${id}`); continue; }
      const merged = mergeNode(value.declaration, selection.overrides?.[id] ?? {});
      addNode({ id: `${suiteInstanceId}/${id}`, suiteInstanceId, kind: value.kind, declaration: localizeNode(merged, suiteInstanceId) });
    }
    for (const [id, node] of Object.entries(selection.add ?? {}).sort(([a], [b]) => compareText(a, b))) {
      localId(id, `scope.suites.${suiteInstanceId}.add.${id}`);
      if (templateNodes.has(id)) fail('TEST_PLAN_NODE_DUPLICATE', `${suiteInstanceId}/${id}`);
      addNode({ id: `${suiteInstanceId}/${id}`, suiteInstanceId, kind: 'test', declaration: localizeNode(node, suiteInstanceId) });
    }
    addConcurrency(template.concurrencyLimits ?? {}, `suite.${selection.uses}.concurrencyLimits`);
  }
  for (const [kind, rawNodes] of [['test', declaration.tests], ['fixture', declaration.fixtures]] as const) {
    if (rawNodes === undefined) continue;
    for (const [id, rawNode] of Object.entries(record(rawNodes, `scope.${kind}s`)).sort(([a], [b]) => compareText(a, b))) {
      stableId(id, `scope.${kind}s.${id}`);
      addNode({ id, suiteInstanceId: null, kind, declaration: parseNode(rawNode, `scope.${kind}s.${id}`) as NodeDeclaration });
    }
  }
  if (declaration.concurrencyLimits !== undefined) addProjectConcurrency(record(declaration.concurrencyLimits, 'scope.concurrencyLimits') as Record<string, number>);
  if (nodes.length === 0) fail('TEST_PLAN_EMPTY', 'no declared tests, fixtures, or selected suites');
  return { nodes, requestedConcurrency, projectConcurrencyGroups, suites: selectedSuites, excludedNodeIds };
}

function matchesGlob(pattern: string, candidate: string): boolean {
  validateGlobPattern(pattern);
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        if (pattern[index + 2] === '/') { source += '(?:.*/)?'; index += 2; } else { source += '.*'; index += 1; }
      } else source += '[^/]*';
    } else if (character === '?') source += '[^/]';
    else source += character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }
  return new RegExp(`${source}$`).test(candidate);
}

function skipReason(condition: ConditionDeclaration | undefined, input: ResolveTestPlanInput): string | null {
  if (!condition) return null;
  if (condition.changedPaths && !condition.changedPaths.some((pattern) => input.facts.changedPaths.some((file) => matchesGlob(pattern, file)))) {
    return 'condition changedPaths did not match';
  }
  const allowed = (value: string | readonly string[]): readonly string[] => typeof value === 'string' ? [value] : value;
  if (condition.moduleType && (input.facts.moduleType === null || !allowed(condition.moduleType).includes(input.facts.moduleType))) {
    return 'condition moduleType did not match';
  }
  if (condition.pipelineStage && (input.facts.pipelineStage === null || !allowed(condition.pipelineStage).includes(input.facts.pipelineStage))) {
    return 'condition pipelineStage did not match';
  }
  return null;
}

function resolvedLimits(requested: Partial<ExecutionLimitsV1> | undefined, policy: ResolverPolicy, nodeId: string): ExecutionLimitsV1 {
  return Object.fromEntries(LIMIT_KEYS.map((key) => {
    const value = requested?.[key] ?? policy.defaultLimits[key];
    const minimum = key === 'logBytes' || key === 'artifactBytes' || key === 'artifactFiles' ? 0 : 1;
    if (!Number.isSafeInteger(value) || value < minimum || value > policy.maximumLimits[key]) fail('TEST_PLAN_LIMIT_INVALID', `${nodeId}.${key}`);
    return [key, value];
  })) as unknown as ExecutionLimitsV1;
}

function validateResolverPolicy(policy: ResolverPolicy): void {
  const positiveInteger = (value: unknown, label: string, minimum = 1): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail('TEST_PLAN_POLICY_INVALID', label);
    return value;
  };
  const defaultTimeout = positiveInteger(policy.defaultTimeoutMs, 'policy.defaultTimeoutMs');
  const maximumTimeout = positiveInteger(policy.maximumTimeoutMs, 'policy.maximumTimeoutMs');
  if (defaultTimeout > maximumTimeout) fail('TEST_PLAN_POLICY_INVALID', 'policy.defaultTimeoutMs');
  for (const key of LIMIT_KEYS) {
    const minimum = key === 'logBytes' || key === 'artifactBytes' || key === 'artifactFiles' ? 0 : 1;
    const defaultValue = positiveInteger(policy.defaultLimits[key], `policy.defaultLimits.${key}`, minimum);
    const maximumValue = positiveInteger(policy.maximumLimits[key], `policy.maximumLimits.${key}`, minimum);
    if (defaultValue > maximumValue) fail('TEST_PLAN_POLICY_INVALID', `policy.defaultLimits.${key}`);
  }
  positiveInteger(policy.maximumRetryCount, 'policy.maximumRetryCount');
  positiveInteger(policy.maximumMatrixSize, 'policy.maximumMatrixSize');
  positiveInteger(policy.maximumNodes, 'policy.maximumNodes');
  positiveInteger(policy.defaultConcurrencyLimit, 'policy.defaultConcurrencyLimit');
  for (const [group, maximum] of Object.entries(policy.maximumConcurrencyLimits)) {
    stableId(group, `policy.maximumConcurrencyLimits.${group}`);
    positiveInteger(maximum, `policy.maximumConcurrencyLimits.${group}`);
  }
}

function validateResolverFacts(input: ResolveTestPlanInput): void {
  const facts = input.facts as unknown;
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) fail('TEST_PLAN_FACTS_INVALID', 'facts');
  const item = facts as Record<string, unknown>;
  for (const key of Object.keys(item)) {
    if (!new Set(['changedPaths', 'moduleType', 'pipelineStage']).has(key)) fail('TEST_PLAN_FACTS_INVALID', `facts.${key}`);
  }
  if (!Array.isArray(item.changedPaths)) fail('TEST_PLAN_FACTS_INVALID', 'facts.changedPaths');
  for (const path of item.changedPaths) {
    if (typeof path !== 'string' || path.length === 0 || path.length > 4096 || path.startsWith('/') || path.includes('\\')
      || path.split('/').includes('..')) fail('TEST_PLAN_FACTS_INVALID', 'facts.changedPaths');
  }
  for (const key of ['moduleType', 'pipelineStage'] as const) {
    const value = item[key];
    if (value !== null && (typeof value !== 'string' || value.length === 0 || value.length > 256)) {
      fail('TEST_PLAN_FACTS_INVALID', `facts.${key}`);
    }
  }
}

function evidencePolicy(provider: TestProviderRegistryEntry, override: EvidenceOverride | undefined, nodeId: string): EvidencePolicyV1 {
  const policy = {
    onPass: [...(override?.onPass ?? provider.registration.evidenceDefaults.onPass)],
    onFail: [...(override?.onFail ?? provider.registration.evidenceDefaults.onFail)],
    onError: [...(override?.onError ?? provider.registration.evidenceDefaults.onError)],
  };
  const supported = new Set(provider.registration.evidenceTypes);
  for (const type of [...policy.onPass, ...policy.onFail, ...policy.onError]) if (!supported.has(type)) fail('TEST_PLAN_EVIDENCE_INVALID', `${nodeId}:${type}`);
  return policy;
}

function matrixValues(node: DraftNode, provider: TestProviderRegistryEntry, maximum: number): readonly Record<string, JsonValue>[] {
  const matrix = node.declaration.matrix ?? {};
  const fields = Object.keys(matrix).sort();
  for (const field of fields) if (!provider.registration.matrixFields.includes(field)) fail('TEST_PLAN_MATRIX_INVALID', `${node.id}:${field}`);
  let values: Record<string, JsonValue>[] = [{}];
  for (const field of fields) {
    values = values.flatMap((current) => matrix[field]!.map((value) => ({ ...current, [field]: structuredClone(value) })));
    if (values.length > maximum) fail('TEST_PLAN_MATRIX_LIMIT', node.id);
  }
  return values;
}

function providerRef(entry: TestProviderRegistryEntry) {
  return {
    packageId: entry.registration.package.packageId,
    packageVersion: entry.registration.package.packageVersion,
    contentDigest: entry.registration.package.contentDigest,
    registrationId: entry.registration.registrationId,
    contractId: entry.registration.contractId,
  };
}

function reportAdapterRef(entry: ReportAdapterRegistryEntry) {
  return {
    adapterId: entry.registration.adapterId,
    format: entry.registration.format,
    contractVersion: entry.registration.contractVersion,
    package: { ...entry.registration.package },
  };
}

function resolvedReportAdapters(input: ResolveTestPlanInput, provider: TestProviderRegistryEntry, nodeId: string) {
  return provider.registration.reportFormats.map((format) => {
    const selectedId = input.policy.reportAdapters?.get(format);
    if (selectedId) {
      const entry = input.registry.reportAdapters.get(selectedId);
      if (!entry || entry.registration.format !== format) fail('TEST_PLAN_REPORT_ADAPTER_INVALID', `${nodeId}:${format}:${selectedId}`);
      return reportAdapterRef(entry);
    }
    const candidates = input.registry.reportAdapterFormats.get(format) ?? [];
    if (candidates.length === 0) fail('TEST_PLAN_REPORT_ADAPTER_MISSING', `${nodeId}:${format}`);
    if (candidates.length > 1) fail('TEST_PLAN_REPORT_ADAPTER_AMBIGUOUS', `${nodeId}:${format}`);
    return reportAdapterRef(candidates[0]!);
  });
}

function expandNodes(input: ResolveTestPlanInput, drafts: readonly DraftNode[]): { expanded: ExpandedNode[]; byBase: Map<string, ExpandedNode[]> } {
  const expanded: ExpandedNode[] = [];
  const expandedIds = new Set<string>();
  const byBase = new Map<string, ExpandedNode[]>();
  for (const draft of drafts) {
    const provider = input.registry.testProviderContracts.get(draft.declaration.uses);
    if (!provider) fail('TEST_PLAN_PROVIDER_MISSING', draft.declaration.uses);
    if (provider.registration.kind !== draft.kind) fail('TEST_PLAN_PROVIDER_KIND_INVALID', draft.id);
    if (draft.kind === 'fixture' && draft.declaration.mode !== undefined) fail('TEST_PLAN_MODE_INVALID', draft.id);
    if (draft.kind === 'fixture' && draft.declaration.review !== undefined) fail('TEST_PLAN_REVIEW_INVALID', draft.id);
    const variations = matrixValues(draft, provider, input.policy.maximumMatrixSize);
    const items = variations.map((variation, index): ExpandedNode => {
      const hasMatrix = Object.keys(variation).length > 0;
      const id = hasMatrix ? `${draft.id}/matrix-${String(index + 1).padStart(3, '0')}` : draft.id;
      stableId(id, `${draft.id}.expandedId`);
      const executionId = `${input.planId}:${id}`;
      stableId(executionId, `${draft.id}.executionId`);
      const requestedTimeout = draft.declaration.timeoutMs ?? input.policy.defaultTimeoutMs;
      if (!Number.isSafeInteger(requestedTimeout) || requestedTimeout < 1 || requestedTimeout > input.policy.maximumTimeoutMs) fail('TEST_PLAN_TIMEOUT_INVALID', id);
      const requestedRetries = draft.declaration.retries;
      let retryCount = requestedRetries ?? DEFAULT_RETRY_COUNT;
      if (!provider.registration.retrySafe && requestedRetries === undefined) retryCount = 0;
      if (!Number.isSafeInteger(retryCount) || retryCount < 0 || retryCount > input.policy.maximumRetryCount) fail('TEST_PLAN_RETRY_INVALID', id);
      if (!provider.registration.retrySafe && retryCount > 0 && draft.declaration.acceptUnsafeRetry !== true) fail('TEST_PLAN_RETRY_UNSAFE', id);
      const config = deepMerge(draft.declaration.config ?? {}, variation);
      let configuration;
      try {
        configuration = resolveTestProviderConfiguration(input.registry, provider.registration.contractId, config);
      } catch (error) {
        fail('TEST_PLAN_CONFIGURATION_INVALID', `${id}:${error instanceof Error ? error.message : String(error)}`);
      }
      const mode = draft.kind === 'test' ? draft.declaration.mode ?? 'blocking' : null;
      if (provider.registration.contractId === 'kubeclaw.coverage-budget@1'
        && mode === 'blocking' && configuration.values.minimumLinePercent === undefined) {
        fail('TEST_PLAN_COVERAGE_MINIMUM_REQUIRED', id);
      }
      if (provider.registration.contractId === 'kubeclaw.lighthouse@1'
        && mode === 'blocking' && configuration.values.purpose === 'performance'
        && configuration.values.budget === undefined) {
        fail('TEST_PLAN_LIGHTHOUSE_BUDGET_REQUIRED', id);
      }
      const node: ResolvedPlanNodeV1 = {
        id,
        executionId,
        testIdentity: stableTestIdentity({ project: input.project, moduleId: input.scope.moduleId,
          gateId: input.scope.gateId, suiteInstanceId: draft.suiteInstanceId, nodeId: id, variation }),
        suiteInstanceId: draft.suiteInstanceId,
        kind: draft.kind,
        provider: providerRef(provider),
        reportAdapters: resolvedReportAdapters(input, provider, id),
        mode,
        reviewAgent: draft.kind === 'test' ? draft.declaration.review?.agent ?? null : null,
        configuration,
        dependencies: [],
        timeoutMs: requestedTimeout,
        limits: resolvedLimits(draft.declaration.limits, input.policy, id),
        retryCount,
        concurrencyGroup: draft.declaration.concurrencyGroup ?? null,
        parentNodeId: hasMatrix ? draft.id : null,
        variation,
        evidence: evidencePolicy(provider, draft.declaration.evidence, id),
        skipReason: skipReason(draft.declaration.when, input),
      };
      return { baseId: draft.id, node, declaration: draft.declaration, provider };
    });
    for (const item of items) {
      if (expandedIds.has(item.node.id)) fail('TEST_PLAN_NODE_DUPLICATE', item.node.id);
      expandedIds.add(item.node.id);
    }
    expanded.push(...items);
    byBase.set(draft.id, items);
  }
  if (expanded.length > input.policy.maximumNodes) fail('TEST_PLAN_NODE_LIMIT', String(expanded.length));
  return { expanded, byBase };
}

function dependencyValue(value: string | DependencyDeclaration, suiteId: string | null): DependencyV1 {
  const rawId = typeof value === 'string' ? value : value.nodeId;
  const nodeId = suiteId === null ? rawId : localReference(rawId, suiteId);
  const acceptedResults: ResultFilter[] = typeof value === 'string' || value.acceptedResults === undefined
    ? ['passed']
    : [...value.acceptedResults];
  return { nodeId, acceptedResults };
}

function port(entry: TestProviderRegistryEntry, direction: 'inputs' | 'outputs', name: string, nodeId: string) {
  const found = entry.registration[direction].find((item) => item.name === name);
  if (!found) fail('TEST_PLAN_PORT_MISSING', `${nodeId}:${direction}:${name}`);
  return found;
}

function connectGraph(expanded: readonly ExpandedNode[], byBase: ReadonlyMap<string, readonly ExpandedNode[]>): TypedLinkV1[] {
  const byId = new Map(expanded.map((item) => [item.node.id, item]));
  const links: TypedLinkV1[] = [];
  for (const item of expanded) {
    const declaredDependencies = (item.declaration.needs ?? []).map((value) => dependencyValue(value, item.node.suiteInstanceId));
    const dependencies: DependencyV1[] = [];
    for (const dependency of declaredDependencies) {
      const targets = byBase.get(dependency.nodeId);
      if (!targets) fail('TEST_PLAN_DEPENDENCY_MISSING', `${item.node.id}:${dependency.nodeId}`);
      if (dependency.nodeId === item.baseId) fail('TEST_PLAN_DEPENDENCY_SELF', item.node.id);
      for (const target of targets) dependencies.push({ nodeId: target.node.id, acceptedResults: [...dependency.acceptedResults] });
    }
    const linkedInputs = new Set<string>();
    for (const [inputName, declaration] of Object.entries(item.declaration.inputs ?? {})) {
      if (linkedInputs.has(inputName)) fail('TEST_PLAN_INPUT_DUPLICATE', `${item.node.id}:${inputName}`);
      linkedInputs.add(inputName);
      const inputPort = port(item.provider, 'inputs', inputName, item.node.id);
      const sources = byBase.get(declaration.from);
      if (!sources) fail('TEST_PLAN_LINK_SOURCE_MISSING', `${item.node.id}:${declaration.from}`);
      if (sources.length !== 1) fail('TEST_PLAN_MATRIX_LINK_AMBIGUOUS', declaration.from);
      const source = sources[0]!;
      const outputPort = port(source.provider, 'outputs', declaration.output, source.node.id);
      if (inputPort.kind !== outputPort.kind) fail('TEST_PLAN_LINK_KIND_MISMATCH', `${source.node.id}:${item.node.id}`);
      if (inputPort.kind === 'value' && outputPort.kind === 'value') {
        if (declaration.mediaType !== undefined) fail('TEST_PLAN_LINK_MEDIA_MISMATCH', `${source.node.id}:${item.node.id}`);
        if (inputPort.schemaId !== outputPort.schemaId) fail('TEST_PLAN_LINK_SCHEMA_MISMATCH', `${source.node.id}:${item.node.id}`);
        links.push({ schemaVersion: 'typed-link.v1', kind: 'value', from: { nodeId: source.node.id, output: outputPort.name },
          to: { nodeId: item.node.id, input: inputPort.name }, schemaId: inputPort.schemaId });
      } else if (inputPort.kind === 'artifact' && outputPort.kind === 'artifact') {
        if (inputPort.schemaId && inputPort.schemaId !== outputPort.schemaId) fail('TEST_PLAN_LINK_SCHEMA_MISMATCH', `${source.node.id}:${item.node.id}`);
        const common = inputPort.mediaTypes.filter((mediaType) => outputPort.mediaTypes.includes(mediaType));
        const mediaType = declaration.mediaType ?? [...common].sort()[0];
        if (!mediaType || !common.includes(mediaType)) fail('TEST_PLAN_LINK_MEDIA_MISMATCH', `${source.node.id}:${item.node.id}`);
        links.push({ schemaVersion: 'typed-link.v1', kind: 'artifact', from: { nodeId: source.node.id, output: outputPort.name },
          to: { nodeId: item.node.id, input: inputPort.name }, ...(inputPort.schemaId ?? outputPort.schemaId
            ? { schemaId: inputPort.schemaId ?? outputPort.schemaId } : {}), mediaType });
      }
      const existing = dependencies.find((dependency) => dependency.nodeId === source.node.id);
      if (existing && (existing.acceptedResults.length !== 1 || existing.acceptedResults[0] !== 'passed')) {
        fail('TEST_PLAN_LINK_DEPENDENCY_INVALID', `${source.node.id}:${item.node.id}`);
      }
      if (!existing) dependencies.push({ nodeId: source.node.id, acceptedResults: ['passed'] });
    }
    for (const inputPort of item.provider.registration.inputs) {
      if (inputPort.required && !linkedInputs.has(inputPort.name)) fail('TEST_PLAN_INPUT_REQUIRED', `${item.node.id}:${inputPort.name}`);
    }
    const uniqueDependencies = new Map<string, DependencyV1>();
    for (const dependency of dependencies) {
      const existing = uniqueDependencies.get(dependency.nodeId);
      if (existing && JSON.stringify(existing.acceptedResults) !== JSON.stringify(dependency.acceptedResults)) fail('TEST_PLAN_DEPENDENCY_CONFLICT', `${item.node.id}:${dependency.nodeId}`);
      uniqueDependencies.set(dependency.nodeId, dependency);
    }
    item.node.dependencies = [...uniqueDependencies.values()].sort((a, b) => compareText(a.nodeId, b.nodeId));
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) fail('TEST_PLAN_DEPENDENCY_CYCLE', id);
    if (visited.has(id)) return;
    visiting.add(id);
    const item = byId.get(id)!;
    for (const dependency of item.node.dependencies) visit(dependency.nodeId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of [...byId.keys()].sort()) visit(id);
  return links.sort((a, b) => compareText(`${a.to.nodeId}:${a.to.input}`, `${b.to.nodeId}:${b.to.input}`));
}

function concurrencyLimits(expanded: readonly ExpandedNode[], requested: ReadonlyMap<string, number>, projectGroups: ReadonlySet<string>, policy: ResolverPolicy): Record<string, number> {
  const used = new Set(expanded.map((item) => item.node.concurrencyGroup).filter((value): value is string => value !== null));
  for (const group of projectGroups) if (!used.has(group)) fail('TEST_PLAN_CONCURRENCY_UNUSED', group);
  return Object.fromEntries([...used].sort().map((group) => {
    const maximum = policy.maximumConcurrencyLimits[group] ?? policy.defaultConcurrencyLimit;
    const value = requested.get(group) ?? maximum;
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail('TEST_PLAN_CONCURRENCY_INVALID', group);
    return [group, value];
  }));
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => compareText(a, b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
}

function freeze<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

export function resolveTestPlan(input: ResolveTestPlanInput): ResolvedTestPlanV1 {
  validateResolverPolicy(input.policy);
  validateResolverFacts(input);
  stableId(input.planId, 'planId');
  stableId(input.runId, 'runId');
  stableId(input.project, 'project');
  if ((input.scope.moduleId === null) === (input.scope.gateId === null)) fail('TEST_PLAN_SCOPE_INVALID', input.planId);
  if (input.scope.moduleId !== null) stableId(input.scope.moduleId, 'moduleId');
  if (input.scope.gateId !== null) stableId(input.scope.gateId, 'gateId');
  if (!Number.isFinite(Date.parse(input.createdAt))) fail('TEST_PLAN_CREATED_AT_INVALID', input.createdAt);
  if (input.declaration.coverage) validatePipelineTestGateContract('gateCoverage', input.declaration.coverage);
  const draft = draftNodes(input);
  const { expanded, byBase } = expandNodes(input, draft.nodes);
  const links = connectGraph(expanded, byBase);
  const unsigned = {
    schemaVersion: 'resolved-test-plan.v1' as const,
    ...(input.declaration.coverage ? { coverage: { policy: structuredClone(input.declaration.coverage), excludedNodeIds: draft.excludedNodeIds.sort() } } : {}),
    planId: input.planId,
    runId: input.runId,
    project: input.project,
    scope: { moduleId: input.scope.moduleId, gateId: input.scope.gateId },
    registrySnapshotDigest: input.registry.snapshotDigest,
    createdAt: input.createdAt,
    suites: draft.suites,
    nodes: expanded.map((item) => item.node).sort((a, b) => compareText(a.id, b.id)),
    links,
    concurrencyLimits: concurrencyLimits(expanded, draft.requestedConcurrency, draft.projectConcurrencyGroups, input.policy),
  };
  const plan: ResolvedTestPlanV1 = {
    ...unsigned,
    planDigest: resolvedTestPlanDigest(unsigned),
  };
  validatePipelineTestGateContract('resolvedTestPlan', plan);
  return freeze(plan);
}
