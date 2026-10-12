/* eslint-disable max-lines -- Source packing and final-prompt packing share one lossless job-construction authority. */
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { echoReviewOutputSchema } from './echo-review-contract.ts';
import type { ReviewSourceDocument } from './review-fact-extractors.ts';
import type { ReviewGraph } from './review-graph.ts';
import { relationKey } from './review-map-artifacts.ts';
import type { ReviewSliceBudget, ScalableReviewPlan } from './review-scale-slicing.ts';
import { compareCodeUnits } from './review-ordering.ts';
import type { RepositoryReviewLens, ResolvedRepositoryReviewProfile } from './repository-review-profile.ts';
import { countReviewTextTokens, reserveReviewRuntimePrompt } from './review-prompt-budget.ts';
import { REVIEWED_TOPOLOGY_EVIDENCE_KIND } from './review-evidence-authority.ts';
import { buildTopologyGroups, compactReviewTopology, compactTopologyConnections, compactTopologyRegions,
  splitTopologyGroup, type TopologyGroup } from './scalable-review-topology.ts';
import type { ScalableReviewJob, ScalableReviewJobResult, ScalableReviewSource } from './scalable-review-types.ts';
export type { ScalableReviewJob, ScalableReviewJobResult, ScalableReviewSource } from './scalable-review-types.ts';
function lineCount(content: string): number {
  return Math.max(1, content.split('\n').length);
}
function fullSource(document: ReviewSourceDocument): ScalableReviewSource {
  return Object.freeze({ path: document.path, content: document.content, digest: sha256Text(document.content),
    complete: true, ranges: Object.freeze([{ startLine: 1, endLine: lineCount(document.content) }]) });
}

function mergedRanges(lines: ReadonlySet<number>, maximum: number): readonly { readonly startLine: number; readonly endLine: number }[] {
  const selected = [...lines].filter((line) => line >= 1 && line <= maximum).sort((left, right) => left - right);
  const ranges: { startLine: number; endLine: number }[] = [];
  for (const line of selected) {
    const last = ranges.at(-1);
    if (last && line <= last.endLine + 1) last.endLine = line;
    else ranges.push({ startLine: line, endLine: line });
  }
  return Object.freeze(ranges.map((range) => Object.freeze(range)));
}

export function scalableReviewSourceExcerpt(
  document: ReviewSourceDocument, lineHints: readonly number[], radius = 4,
): ScalableReviewSource {
  const lines = document.content.split('\n'), selected = new Set<number>();
  const addWindow = (line: number, radius: number): void => {
    for (let value = Math.max(1, line - radius); value <= Math.min(lines.length, line + radius); value += 1) selected.add(value);
  };
  lineHints.forEach((line) => addWindow(line, radius));
  const contract = /^\s*(?:export\s+)?(?:abstract\s+)?(?:interface|type|class|function|const|enum)\b|schemaVersion|capability|operation/u;
  for (let index = 0, matches = 0; index < lines.length && matches < 3; index += 1) {
    if (contract.test(lines[index] ?? '')) { addWindow(index + 1, 1); matches += 1; }
  }
  if (selected.size === 0) for (let line = 1; line <= Math.min(lines.length, 24); line += 1) selected.add(line);
  const ranges = mergedRanges(selected, lines.length);
  const content = ranges.map(({ startLine, endLine }) => {
    const body = lines.slice(startLine - 1, endLine).map((text, offset) => `${startLine + offset}: ${text}`).join('\n');
    return `[lines ${startLine}-${endLine}]\n${body}`;
  }).join('\n...\n');
  return Object.freeze({ path: document.path, content, digest: sha256Text(document.content), complete: false, ranges });
}

const COMPONENT_REQUIREMENTS = Object.freeze([
  { id: 'component.correctness', text: 'The supplied component has no directly evidenced correctness defect.' },
  { id: 'component.security', text: 'The supplied component preserves authorization, confidentiality, and input boundaries.' },
  { id: 'component.lifecycle', text: 'Concurrency, cancellation, persistence, recovery, cleanup, and data-loss behavior are correct.' },
]);
const SIMPLIFICATION_REQUIREMENT = Object.freeze({
  id: 'component.simplification',
  text: 'The supplied component has no directly evidenced behavior-preserving simplification opportunity.',
});
const BOUNDARY_REQUIREMENTS = Object.freeze([
  { id: 'boundary.contract', text: 'The producer, contract, and consumer agree on behavior and required data.' },
  { id: 'boundary.authority', text: 'Authority, secret, command, network, and storage boundaries are least-privilege and enforced.' },
  { id: 'boundary.lifecycle', text: 'Timeout, cancellation, retry, recovery, cleanup, and deployment behavior compose correctly.' },
]);
const SYSTEM_PATH_REQUIREMENTS = Object.freeze([
  { id: 'system.path', text: 'Shared cross-region ports agree on direction, relation type, confidence, and multiplicity.' },
  { id: 'system.failure', text: 'The supplied cross-region port topology has no evidenced failure-path composition gap.' },
]);
const SYSTEM_LENS_REQUIREMENTS: Readonly<Record<RepositoryReviewLens, Readonly<{ id: string; text: string }>>> = Object.freeze({
  architecture: Object.freeze({ id: 'system.architecture', text: 'Architecture and ownership compose coherently across this topology region.' }),
  contracts: Object.freeze({ id: 'system.contracts', text: 'Producer, schema, adapter, and consumer contracts compose across this topology region.' }),
  security: Object.freeze({ id: 'system.security', text: 'Authority, secret, command, network, and storage boundaries remain least-privilege.' }),
  lifecycle: Object.freeze({ id: 'system.lifecycle', text: 'State, persistence, recovery, cleanup, and data ownership compose correctly.' }),
  resilience: Object.freeze({ id: 'system.resilience', text: 'Concurrency, cancellation, timeout, retry, and failure containment compose correctly.' }),
  deployment: Object.freeze({ id: 'system.deployment', text: 'Build, configuration, generated assets, network, and deployment topology agree.' }),
  simplification: Object.freeze({ id: 'system.simplification', text: 'Cross-component ownership has no directly evidenced behavior-preserving simplification opportunity.' }),
});

function requestsSimplification(requirements: readonly Readonly<{ id: string }>[]): boolean {
  return requirements.some(({ id }) => id === SIMPLIFICATION_REQUIREMENT.id || id === 'system.simplification');
}

// eslint-disable-next-line max-lines-per-function -- The complete reviewer contract stays visible as one prompt definition.
export function scalableReviewTask(kind: ScalableReviewJob['kind'], simplification = false): string {
  const kindRules: Readonly<Record<ScalableReviewJob['kind'], readonly string[]>> = {
    component: [
      'Trace inputs, state changes, outputs, errors, and cleanup through the supplied component source.',
      'Check authorization, secrets, commands, network use, persistence, concurrency, retry, recovery, deployment, tests, and schemas when present.',
    ],
    boundary: [
      'Trace each supplied relation across both endpoints. Check data shape, authority, failure, timeout, retry, and ownership assumptions.',
      'The excerpts are exact frozen-source ranges. Do not infer behavior outside those ranges; request full source for a concrete gap.',
    ],
    'system-path': [
      'Inspect the complete cross-region port accounting. connectionRows use path:region,region rows separated by semicolons.',
      'portRows use the declared portFields order, comma-separated fields, semicolon-separated rows, with direction 0=in and 1=out.',
      'Use reviewed-topology evidence to certify topology-only requirements.',
      'Request exact source only for a concrete topology concern. Never create a code finding from topology alone.',
    ],
    'system-lens': [
      'Inspect the complete topology accounting across every enabled lens. Use reviewed-topology evidence to certify topology-only requirements.',
      'Request exact source only for a concrete topology concern. Never create a code finding from topology alone.',
    ],
  };
  const lensRules = kind === 'system-lens' || kind === 'system-path' ? [
    'A clean topology triage is valid when every system requirement cites the supplied reviewed-topology digest.',
  ] : [];
  const simplificationRules = simplification ? [
    'Also identify concrete behavior-preserving simplifications: removable unused code, forwarding-only wrappers, single-use abstractions, unused configuration variation, duplicate helpers, trivial dependencies, and standard-library or native replacements.',
    'Report a simplification only when exact supplied source proves the current indirection or duplication and the smallest replacement. Use category simplification. Do not report subjective cleanup, naming, formatting, speculative consolidation, or rewrites that change behavior.',
  ] : [];
  return [
    '# KubeClaw scalable review protocol v1', '',
    `Review this ${kind} unit using only the exact source and deterministic relations below.`,
    'Report observable bugs, security defects, broken contracts, concurrency faults, persistence or recovery faults, deployment failures, and data-loss risks.',
    'Do not report formatting, naming, subjective style, or general cleanup.',
    'Priority calibration: P0 is catastrophic and immediate; P1 breaks critical behavior or creates severe exposure; P2 is a material defect in normal use; P3 is limited and non-blocking.',
    'A finding must cite the exact digest of every source location it names. Boundary findings must cite source on both sides when both sides are files.',
    'Use evidence kind reviewed-source for supplied source digests and reviewed-topology for the supplied topology digest. Do not invent evidence kinds.',
    'Every finding location must include a precise lineHint inside a supplied full-source or excerpt range.',
    'List a location only when that exact line participates in the defect. Do not list clean comparison code as a finding location.',
    'Before marking a requirement satisfied, test one concrete counterexample against the supplied evidence and explain why it does not apply.',
    'Every requirement assessment must include its evidence array. Use an empty evidence array only when the assessment is unverified.',
    'Uncertain relations are navigation hints only and do not prove behavior.',
    ...kindRules[kind],
    ...lensRules,
    ...simplificationRules,
    'When exact evidence is insufficient, return contextRequest with only the additional paths needed.',
    'Return raw JSON matching outputContract. Do not decide the pipeline result.',
  ].join('\n');
}

function job(values: {
  readonly id: string; readonly kind: ScalableReviewJob['kind']; readonly sources: readonly ScalableReviewSource[];
  readonly relationKeys: readonly string[]; readonly relatedIds: readonly string[];
  readonly systemContext?: Readonly<Record<string, unknown>>;
  readonly requirements?: readonly Readonly<{ id: string; text: string }>[];
}): ScalableReviewJob {
  const { id, kind, relationKeys, relatedIds, systemContext } = values;
  const sources = [...values.sources].sort((left, right) => compareCodeUnits(left.path, right.path));
  const requirements = values.requirements ?? (kind === 'component' ? COMPONENT_REQUIREMENTS
    : kind === 'boundary' ? BOUNDARY_REQUIREMENTS
      : SYSTEM_PATH_REQUIREMENTS);
  const body = { id, kind, source: sources, relationKeys: [...relationKeys].sort(), relatedIds: [...relatedIds].sort(),
    ...(systemContext === undefined ? {} : { systemContext }), requirements };
  const unsigned = { schemaVersion: 'scalable-review-job.v1' as const, ...body,
    taskDigest: sha256Text(scalableReviewTask(kind, requestsSimplification(requirements))) };
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}

export function buildScalableReviewDispatchPayload(jobValue: ScalableReviewJob): Readonly<Record<string, unknown>> {
  return Object.freeze({
    protocol: 'kubeclaw.echo-review-scale.v1',
    task: scalableReviewTask(jobValue.kind, requestsSimplification(jobValue.requirements)),
    review: Object.freeze({ job: jobValue, jobDigest: jobValue.digest }),
    outputContract: echoReviewOutputSchema,
  });
}

export function expandScalableReviewJob(
  jobValue: ScalableReviewJob,
  requestedPaths: readonly string[],
  completeSources: ReadonlyMap<string, ScalableReviewSource>,
): ScalableReviewJob {
  const sources = new Map(jobValue.source.map((value) => [value.path, value]));
  for (const path of requestedPaths) {
    const value = completeSources.get(path);
    if (!value?.complete) throw new Error(`scalable review requested source is unavailable: ${path}`);
    sources.set(path, value);
  }
  const unsigned = {
    schemaVersion: jobValue.schemaVersion, id: jobValue.id, kind: jobValue.kind,
    source: Object.freeze([...sources.values()].sort((left, right) => compareCodeUnits(left.path, right.path))),
    relationKeys: jobValue.relationKeys, relatedIds: jobValue.relatedIds,
    ...(jobValue.systemContext === undefined ? {} : { systemContext: jobValue.systemContext }),
    requirements: jobValue.requirements,
    taskDigest: jobValue.taskDigest,
  };
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}

type BoundaryConcern = 'architecture' | 'contracts' | 'security' | 'lifecycle' | 'resilience' | 'deployment';
interface BoundaryItem {
  readonly boundaryId: string; readonly fromSlice: string; readonly toSlice: string;
  readonly relationKey: string; readonly concern: BoundaryConcern; readonly paths: readonly string[];
}
interface BoundaryBatch {
  readonly concerns: readonly BoundaryConcern[]; readonly relationKeys: readonly string[];
  readonly boundaryIds: readonly string[]; readonly sliceIds: readonly string[]; readonly paths: readonly string[];
}

function concern(type: string): BoundaryConcern {
  if (['reads_secret', 'grants_authority', 'executes_command'].includes(type)) return 'security';
  if (['writes_state', 'deletes_state', 'recovers'].includes(type)) return 'lifecycle';
  if (['retries', 'cancels', 'times_out'].includes(type)) return 'resilience';
  if (['uses_network', 'deploys', 'builds', 'generates'].includes(type)) return 'deployment';
  if (['imports', 'references_schema', 'implements', 'calls'].includes(type)) return 'contracts';
  return 'architecture';
}

function boundaryItems(
  plan: ScalableReviewPlan, relations: ReadonlyMap<string, ReviewGraph['relations'][number]>,
  documents: ReadonlyMap<string, ReviewSourceDocument>,
): readonly BoundaryItem[] {
  const items = plan.boundaries.flatMap((boundary) => boundary.relationKeys.map((key) => {
    const relation = relations.get(key); if (!relation) throw new Error(`scalable review boundary relation is missing: ${key}`);
    return Object.freeze({ boundaryId: boundary.id, fromSlice: boundary.fromSlice, toSlice: boundary.toSlice,
      relationKey: key, concern: concern(relation.type),
      paths: Object.freeze([relation.from, relation.to].filter((path) => documents.has(path)).sort()),
    });
  }));
  items.sort((left, right) => compareCodeUnits(
    `${left.paths[0] ?? ''}\0${left.paths[1] ?? ''}\0${left.concern}\0${left.relationKey}`,
    `${right.paths[0] ?? ''}\0${right.paths[1] ?? ''}\0${right.concern}\0${right.relationKey}`,
  ));
  return Object.freeze(items);
}

function asBoundaryBatch(selected: readonly BoundaryItem[]): BoundaryBatch {
  const concerns = new Set<BoundaryConcern>(); const boundaryIds = new Set<string>();
  const sliceIds = new Set<string>(); const paths = new Set<string>();
  for (const item of selected) {
    concerns.add(item.concern);
    boundaryIds.add(item.boundaryId); sliceIds.add(item.fromSlice); sliceIds.add(item.toSlice);
    item.paths.forEach((path) => paths.add(path));
  }
  return Object.freeze({ concerns: Object.freeze([...concerns].sort()),
    relationKeys: Object.freeze(selected.map(({ relationKey }) => relationKey)),
    boundaryIds: Object.freeze([...boundaryIds].sort()), sliceIds: Object.freeze([...sliceIds].sort()),
    paths: Object.freeze([...paths].sort()) });
}

function emitBoundaryBatch(
  selected: readonly BoundaryItem[], output: BoundaryBatch[], documents: ReadonlyMap<string, ReviewSourceDocument>,
  relations: ReadonlyMap<string, ReviewGraph['relations'][number]>, profile: ResolvedRepositoryReviewProfile,
): void {
  if (selected.length === 0) return;
  const batch = asBoundaryBatch(selected), sources = sourcesForRelations(batch.relationKeys, relations, documents);
  const bytes = sources.reduce((total, value) => total + Buffer.byteLength(value.content, 'utf8'), 0);
  const tokens = sources.reduce((total, value) => (
    total + countReviewTextTokens(value.content, profile.tokenizerEncoding)
  ), 0);
  const probe = job({ id: 'boundary-batch:000000', kind: 'boundary', sources,
    relationKeys: batch.relationKeys, relatedIds: [...batch.boundaryIds, ...batch.sliceIds] });
  const payload = reserveReviewRuntimePrompt(buildScalableReviewDispatchPayload(probe), profile.tokenizerEncoding);
  const maximumPayloadTokens = Math.min(profile.maxInputTokensPerJob,
    profile.maxContextTokensPerJob - profile.maxOutputTokensPerJob);
  const fits = sources.length <= profile.boundaryBudget.maxFiles && bytes <= profile.boundaryBudget.maxBytes
    && tokens <= profile.boundaryBudget.maxTokens && payload.bytes <= profile.maxPromptBytesPerJob
    && payload.tokens <= maximumPayloadTokens;
  if (fits) { output.push(batch); return; }
  if (selected.length === 1) {
    throw new Error(`scalable review boundary relation exceeds budget: ${selected[0]?.relationKey ?? 'unknown'}`);
  }
  const midpoint = Math.ceil(selected.length / 2);
  emitBoundaryBatch(selected.slice(0, midpoint), output, documents, relations, profile);
  emitBoundaryBatch(selected.slice(midpoint), output, documents, relations, profile);
}

function boundaryBatches(
  items: readonly BoundaryItem[], documents: ReadonlyMap<string, ReviewSourceDocument>,
  relations: ReadonlyMap<string, ReviewGraph['relations'][number]>, profile: ResolvedRepositoryReviewProfile,
): readonly BoundaryBatch[] {
  const output: BoundaryBatch[] = [];
  let current: BoundaryItem[] = [];
  const flush = (): void => { emitBoundaryBatch(current, output, documents, relations, profile); current = []; };
  for (const item of items) {
    const slices = new Set(current.flatMap(({ fromSlice, toSlice }) => [fromSlice, toSlice]));
    slices.add(item.fromSlice); slices.add(item.toSlice);
    const exceeds = current.length > 0 && (current.length + 1 > profile.boundaryBudget.maxRelations
      || slices.size > profile.boundaryBudget.maxSlices);
    if (exceeds) flush();
    current.push(item);
  }
  flush(); return Object.freeze(output);
}

function sourcesForRelations(
  relationKeys: readonly string[], relations: ReadonlyMap<string, ReviewGraph['relations'][number]>,
  documents: ReadonlyMap<string, ReviewSourceDocument>,
): readonly ScalableReviewSource[] {
  const hints = new Map<string, number[]>();
  for (const key of relationKeys) {
    const relation = relations.get(key); if (!relation) throw new Error(`scalable review relation is missing: ${key}`);
    const match = /:(\d+)(?::\d+)?$/u.exec(relation.provenance);
    if (documents.has(relation.from)) {
      const values = hints.get(relation.from) ?? [];
      if (match) values.push(Number(match[1]));
      hints.set(relation.from, values);
    }
    if (documents.has(relation.to) && !hints.has(relation.to)) hints.set(relation.to, []);
  }
  return Object.freeze([...hints].sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([path, values]) => scalableReviewSourceExcerpt(documents.get(path) as ReviewSourceDocument, values)));
}

// eslint-disable-next-line max-lines-per-function -- Region packing and its aggregate coverage proof form one fail-closed operation.
function holisticJobs(
  batches: readonly BoundaryBatch[], lenses: readonly RepositoryReviewLens[],
  profile: ResolvedRepositoryReviewProfile,
): readonly ScalableReviewJob[] {
  if (lenses.length === 0 || batches.length === 0) return Object.freeze([]);
  const requirements = Object.freeze(lenses.map((lens) => SYSTEM_LENS_REQUIREMENTS[lens]));
  const groups: TopologyGroup[] = [];
  const maximumPayloadTokens = Math.min(profile.maxInputTokensPerJob,
    profile.maxContextTokensPerJob - profile.maxOutputTokensPerJob);
  const candidate = (part: TopologyGroup): ScalableReviewJob => {
    const topology = compactReviewTopology(part);
    const topologyEvidence = Object.freeze({ kind: REVIEWED_TOPOLOGY_EVIDENCE_KIND,
      digest: sha256Text(canonicalJson(topology)) });
    return job({ id: 'system-lens:region:000000', kind: 'system-lens', sources: [],
      relationKeys: [], relatedIds: [], requirements,
      systemContext: Object.freeze({ enabledLenses: lenses, boundaryCount: part.boundaryIds.length,
        sliceCount: part.sliceIds.length, relationCount: part.relationKeys.length,
        topology, topologyEvidence }),
    });
  };
  const emit = (part: TopologyGroup): void => {
    const measured = reserveReviewRuntimePrompt(buildScalableReviewDispatchPayload(candidate(part)),
      profile.tokenizerEncoding);
    if (measured.bytes <= profile.maxPromptBytesPerJob && measured.tokens <= maximumPayloadTokens) {
      groups.push(part); return;
    }
    if (part.relationKeys.length < 2) {
      throw new Error(`scalable review holistic relation exceeds prompt budget: ${part.relationKeys[0] ?? 'unknown'}`);
    }
    splitTopologyGroup(part).forEach(emit);
  };
  buildTopologyGroups(batches).forEach(emit);
  const regions = groups.map((part, index) => {
    const value = candidate(part);
    const unsigned = { ...value, id: `system-lens:region:${String(index + 1).padStart(6, '0')}` };
    const { digest: _digest, ...body } = unsigned;
    return Object.freeze({ ...body, digest: sha256Text(canonicalJson(body)) });
  });
  const completeTopology = compactTopologyRegions(groups);
  interface AggregatePart { readonly connections: readonly number[] }
  interface MeasuredAggregatePart extends AggregatePart { readonly bytes: number; readonly tokens: number }
  const aggregateValue = (part: AggregatePart, id: string): ScalableReviewJob => {
    const topology = compactTopologyConnections(completeTopology, part.connections);
    const topologyEvidence = Object.freeze({ kind: REVIEWED_TOPOLOGY_EVIDENCE_KIND,
      digest: sha256Text(canonicalJson(topology)) });
    return job({ id, kind: 'system-path', sources: [],
      relationKeys: [], relatedIds: [], requirements: SYSTEM_PATH_REQUIREMENTS,
      systemContext: Object.freeze({ enabledLenses: lenses, topologyScope: 'region-connection-graph',
        topology, topologyEvidence }),
    });
  };
  const measurePart = (part: AggregatePart): MeasuredAggregatePart => {
    const value = aggregateValue(part, 'system-path:aggregate:000000');
    const measured = reserveReviewRuntimePrompt(buildScalableReviewDispatchPayload(value), profile.tokenizerEncoding);
    return Object.freeze({ ...part, bytes: measured.bytes, tokens: measured.tokens });
  };
  const parts: MeasuredAggregatePart[] = [];
  const emitConnections = (part: AggregatePart): void => {
    const measured = measurePart(part);
    if (measured.bytes <= profile.maxPromptBytesPerJob && measured.tokens <= maximumPayloadTokens) {
      parts.push(measured); return;
    }
    if (part.connections.length > 1) {
      const midpoint = Math.ceil(part.connections.length / 2);
      const left = part.connections.slice(0, midpoint), right = part.connections.slice(midpoint);
      emitConnections({ connections: left }); emitConnections({ connections: right }); return;
    }
    throw new Error(`scalable review topology connection exceeds prompt budget: ${part.connections[0]}`);
  };
  if (completeTopology.connectionCount > 0) {
    emitConnections({ connections: Array.from({ length: completeTopology.connectionCount }, (_value, index) => index) });
  }
  const packed: MeasuredAggregatePart[] = [];
  for (const part of [...parts].sort((left, right) => right.tokens - left.tokens)) {
    let placed = false;
    for (let index = 0; index < packed.length; index += 1) {
      const previous = packed[index] as MeasuredAggregatePart;
      const bytes = previous.bytes + part.bytes, tokens = previous.tokens + part.tokens;
      if (bytes > profile.maxPromptBytesPerJob || tokens > maximumPayloadTokens) continue;
      const merged = Object.freeze({
        connections: Object.freeze([...new Set([...previous.connections, ...part.connections])]),
        bytes, tokens,
      });
      packed[index] = merged; placed = true; break;
    }
    if (!placed) packed.push(part);
  }
  const aggregateJobs = packed.map((part, index) => {
    const value = aggregateValue(part, `system-path:aggregate:${String(index + 1).padStart(6, '0')}`);
    const measured = reserveReviewRuntimePrompt(buildScalableReviewDispatchPayload(value), profile.tokenizerEncoding);
    if (measured.bytes > profile.maxPromptBytesPerJob || measured.tokens > maximumPayloadTokens) {
      throw new Error(`scalable review packed topology exceeds prompt budget: ${measured.bytes}:${measured.tokens}`);
    }
    return value;
  });
  return Object.freeze([...aggregateJobs, ...regions]);
}

export function buildScalableReviewJobs(values: {
  readonly plan: ScalableReviewPlan; readonly graph: ReviewGraph; readonly documents: readonly ReviewSourceDocument[];
  readonly tokenCounts: ReadonlyMap<string, number>; readonly budget: ReviewSliceBudget;
  readonly profile?: ResolvedRepositoryReviewProfile;
}): readonly ScalableReviewJob[] {
  const { plan, graph, documents, tokenCounts, budget } = values;
  let { profile } = values;
  if (!plan.coverage.complete) throw new Error('scalable review coverage is incomplete');
  const byPath = new Map(documents.map((document) => [document.path, document]));
  const requireDocuments = (paths: readonly string[]): readonly ReviewSourceDocument[] => paths.map((path) => {
    const document = byPath.get(path); if (!document) throw new Error(`scalable review source is missing: ${path}`); return document;
  });
  if (!profile) profile = Object.freeze({ boundaryBudget: { ...budget, maxRelations: 1, maxSlices: 2 },
    maxInputTokensPerJob: Number.MAX_SAFE_INTEGER, maxContextTokensPerJob: Number.MAX_SAFE_INTEGER,
    maxOutputTokensPerJob: 0, maxPromptBytesPerJob: Number.MAX_SAFE_INTEGER,
    tokenizerEncoding: 'o200k_base', enabledLenses: [] } as unknown as ResolvedRepositoryReviewProfile);
  const relations = new Map(graph.relations.map((value) => [relationKey(value), value]));
  const componentRequirements = profile.enabledLenses.includes('simplification')
    ? Object.freeze([...COMPONENT_REQUIREMENTS, SIMPLIFICATION_REQUIREMENT]) : COMPONENT_REQUIREMENTS;
  const components = plan.slices.map((slice) => job({ id: `component:${slice.id}`, kind: 'component',
    sources: requireDocuments(slice.files).map(fullSource), relationKeys: [], relatedIds: [slice.id],
    requirements: componentRequirements }));
  const batches = boundaryBatches(boundaryItems(plan, relations, byPath), byPath, relations, profile);
  const batchSources = (part: BoundaryBatch): readonly ScalableReviewSource[] => (
    sourcesForRelations(part.relationKeys, relations, byPath)
  );
  const boundaries = batches.map((part, index) => job({
    id: `boundary-batch:${String(index + 1).padStart(6, '0')}`, kind: 'boundary',
    sources: batchSources(part), relationKeys: part.relationKeys,
    relatedIds: [...part.boundaryIds, ...part.sliceIds],
  }));
  const holistic = holisticJobs(batches, profile.enabledLenses.filter((lens) => lens !== 'simplification'), profile);
  return Object.freeze([...components, ...boundaries, ...holistic]
    .sort((left, right) => compareCodeUnits(left.id, right.id)));
}
