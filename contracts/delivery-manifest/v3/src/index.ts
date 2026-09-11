import {
  canonicalJson,
  portableJson,
  PORTABLE_JSON_ENCODING,
  sha256Text,
  type ArtifactRef,
} from '@kubeclaw/plugin-sdk';
import {
  validatePipelineTestGateContract,
  type GateCoverageResultV1,
  type GateCoverageV1,
} from '@kubeclaw/pipeline-test-gate-contract';

export const DELIVERY_MANIFEST_V3 = 'delivery-manifest.v3' as const;
export const DELIVERY_MANIFEST_ENCODING = 'delivery-manifest.utf16-v1' as const;
export const DELIVERY_MANIFEST_ARTIFACT_ENCODING = PORTABLE_JSON_ENCODING;
export type DeliveryManifestEncoding = typeof DELIVERY_MANIFEST_ENCODING;

interface DeliveryModuleBindingV3 {
  readonly moduleId: string;
  readonly sourceStageId: string;
  readonly testStageId: string;
  readonly expectedCoverage: GateCoverageV1;
  readonly sourceRevision: string;
  readonly decisionDigest: string;
  readonly resultDigest: string;
  readonly coverage: GateCoverageResultV1;
}
interface DeliveryFinalBindingBaseV3 {
  readonly sourceStageId: string;
  readonly lintStageId: string;
  readonly testStageId: string;
  readonly expectedCoverage: GateCoverageV1;
  readonly sourceRevision: string;
  readonly decisionDigest: string;
  readonly resultDigest: string;
  readonly coverage: GateCoverageResultV1;
}
type DeliveryFinalBindingV3 = DeliveryFinalBindingBaseV3 & (
  | { readonly reviewStageId?: never; readonly reviewArtifactEncoding?: never; readonly reviewSemanticEncoding?: never }
  | { readonly reviewStageId: string; readonly reviewArtifactEncoding?: never; readonly reviewSemanticEncoding?: never }
  | { readonly reviewStageId: string; readonly reviewArtifactEncoding: typeof PORTABLE_JSON_ENCODING;
      readonly reviewSemanticEncoding?: never }
  | { readonly reviewStageId: string; readonly reviewArtifactEncoding: typeof PORTABLE_JSON_ENCODING;
      readonly reviewSemanticEncoding: 'review-semantics.utf16-v1' }
);
type DeliveryEvidenceArtifactRefV3 = Omit<ArtifactRef, 'mediaType'> & {
  readonly mediaType: 'application/json';
};
export interface DeliveryManifestV3 {
  readonly schemaVersion: typeof DELIVERY_MANIFEST_V3;
  readonly projectId: string;
  readonly runId: string;
  readonly sourceRevision: string;
  readonly modules: readonly DeliveryModuleBindingV3[];
  readonly final: DeliveryFinalBindingV3;
  readonly evidence: readonly DeliveryEvidenceArtifactRefV3[];
  readonly digest: string;
}
export type DeliveryManifestV3Unsigned = Omit<DeliveryManifestV3, 'digest'>;

type ObjectValue = Record<string, any>;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const GIT40 = /^[a-f0-9]{40}$/u;
const LOCAL_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const NAMESPACED_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/u;
const MAX_BYTES = 8 * 1024 * 1024;

function fail(): never { throw new Error('DELIVERY_MANIFEST_INVALID'); }
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  return value as ObjectValue;
}
function exactKeys(value: ObjectValue, required: readonly string[], optional: readonly string[] = []): void {
  const keys = Object.keys(value);
  if (required.some(key => !Object.hasOwn(value, key))
    || keys.some(key => !required.includes(key) && !optional.includes(key))) fail();
}
function text(value: unknown, maximum: number, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || (pattern && !pattern.test(value))) fail();
  return value;
}
function digest(value: unknown): string { return text(value, 71, DIGEST); }
function stageId(value: unknown): string { return text(value, 96, LOCAL_ID); }
function opaqueId(value: unknown): string { return text(value, 192, OPAQUE_ID); }
function namespacedId(value: unknown): string { return text(value, 160, NAMESPACED_ID); }

function artifactRef(value: unknown): ArtifactRef {
  const ref = object(value);
  exactKeys(ref, ['artifactId', 'namespace', 'mediaType', 'digest', 'sizeBytes', 'producer'], ['encoding']);
  opaqueId(ref.artifactId); namespacedId(ref.namespace); text(ref.mediaType, 2048); digest(ref.digest);
  if (!Number.isSafeInteger(ref.sizeBytes) || ref.sizeBytes < 1 || ref.sizeBytes > MAX_BYTES) fail();
  if (Object.hasOwn(ref, 'encoding') && ref.encoding !== PORTABLE_JSON_ENCODING) fail();
  const producer = object(ref.producer);
  exactKeys(producer, ['runId', 'stageId', 'attemptId', 'attemptNumber']);
  opaqueId(producer.runId); stageId(producer.stageId); opaqueId(producer.attemptId);
  if (!Number.isSafeInteger(producer.attemptNumber) || producer.attemptNumber < 1) fail();
  return ref as ArtifactRef;
}

function coveragePair(binding: ObjectValue, projectId: string, sourceRevision: string,
  kind: 'module' | 'cumulative', moduleId?: string): void {
  validatePipelineTestGateContract('gateCoverage', binding.expectedCoverage);
  validatePipelineTestGateContract('gateCoverageResult', binding.coverage);
  const expected = binding.expectedCoverage as GateCoverageV1;
  const result = binding.coverage as GateCoverageResultV1;
  if (expected.kind !== kind || expected.projectId !== projectId
    || canonicalJson(result.policy) !== canonicalJson(expected)
    || result.sourceRevision !== `git:${sourceRevision}`
    || result.pipelineStageId !== binding.testStageId) fail();
  if (kind === 'module' && (expected.modules.length !== 1 || expected.modules[0]?.moduleId !== moduleId)) fail();
}

function refKey(ref: ArtifactRef): string { return portableJson(ref); }
function assertOwnedRef(ref: ArtifactRef, runId: string, stageIdValue: string, namespace: string,
  predicate: (id: string) => boolean): void {
  if (ref.producer.runId !== runId || ref.producer.stageId !== stageIdValue || ref.namespace !== namespace
    || ref.mediaType !== 'application/json' || !predicate(ref.artifactId)) fail();
}
function sameAttempt(left: ArtifactRef, right: ArtifactRef): void {
  if (left.producer.runId !== right.producer.runId || left.producer.stageId !== right.producer.stageId
    || left.producer.attemptId !== right.producer.attemptId || left.producer.attemptNumber !== right.producer.attemptNumber) fail();
}

function validateModules(manifest: ObjectValue, projectId: string, sourceRevision: string): void {
  const moduleIds = new Set<string>(), sourceIds = new Set<string>(), testIds = new Set<string>();
  for (const raw of manifest.modules) {
    const module = object(raw);
    exactKeys(module, ['moduleId', 'sourceStageId', 'testStageId', 'expectedCoverage', 'sourceRevision', 'decisionDigest', 'resultDigest', 'coverage']);
    const moduleId = text(module.moduleId, 128), source = stageId(module.sourceStageId), test = stageId(module.testStageId);
    if (moduleIds.has(moduleId) || sourceIds.has(source) || testIds.has(test) || module.sourceRevision !== sourceRevision) fail();
    digest(module.decisionDigest); digest(module.resultDigest);
    coveragePair(module, projectId, sourceRevision, 'module', moduleId);
    moduleIds.add(moduleId); sourceIds.add(source); testIds.add(test);
  }
}

function validateFinal(manifest: ObjectValue, projectId: string, sourceRevision: string): { hasReview: boolean; hasArtifactEncoding: boolean } {
  const final = object(manifest.final);
  exactKeys(final, ['sourceStageId', 'lintStageId', 'testStageId', 'expectedCoverage', 'sourceRevision', 'decisionDigest', 'resultDigest', 'coverage'],
    ['reviewStageId', 'reviewArtifactEncoding', 'reviewSemanticEncoding']);
  stageId(final.sourceStageId); stageId(final.lintStageId); stageId(final.testStageId);
  if (final.sourceRevision !== sourceRevision || manifest.modules.filter((item: ObjectValue) => item.sourceStageId === final.sourceStageId).length !== 1) fail();
  digest(final.decisionDigest); digest(final.resultDigest);
  coveragePair(final, projectId, sourceRevision, 'cumulative');
  const expectedModules = manifest.modules.flatMap((item: ObjectValue) => item.expectedCoverage.modules)
    .sort((a: ObjectValue, b: ObjectValue) => a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0);
  if (canonicalJson(expectedModules) !== canonicalJson(final.expectedCoverage.modules)) fail();
  const hasReview = Object.hasOwn(final, 'reviewStageId');
  const hasArtifactEncoding = Object.hasOwn(final, 'reviewArtifactEncoding');
  const hasSemanticEncoding = Object.hasOwn(final, 'reviewSemanticEncoding');
  if (hasReview) stageId(final.reviewStageId);
  if (hasArtifactEncoding && (!hasReview || final.reviewArtifactEncoding !== PORTABLE_JSON_ENCODING)) fail();
  if (hasSemanticEncoding && (!hasArtifactEncoding || final.reviewSemanticEncoding !== 'review-semantics.utf16-v1')) fail();
  return { hasReview, hasArtifactEncoding };
}

function validateReviewRefs(refs: ArtifactRef[], finalStart: number, final: ObjectValue, runId: string,
  hasReview: boolean, hasArtifactEncoding: boolean): void {
  if (hasReview) {
    const report = refs[finalStart + 4]!, bundle = refs[finalStart + 5]!;
    assertOwnedRef(report, runId, final.reviewStageId, 'kubeclaw.review', id => id.startsWith('review-report:'));
    assertOwnedRef(bundle, runId, final.reviewStageId, 'kubeclaw.review', id => id.startsWith('review-bundle:'));
    sameAttempt(report, bundle);
    if (hasArtifactEncoding && (report.encoding !== PORTABLE_JSON_ENCODING || bundle.encoding !== PORTABLE_JSON_ENCODING)) fail();
  } else if (refs.some(ref => ref.namespace === 'kubeclaw.review')) fail();
}

function validateRefMultiplicity(refs: ArtifactRef[], finalImplementation: ArtifactRef): void {
  const counts = new Map<string, number>();
  refs.forEach(ref => counts.set(refKey(ref), (counts.get(refKey(ref)) ?? 0) + 1));
  const duplicateKey = refKey(finalImplementation);
  if ([...counts].some(([key, count]) => count > (key === duplicateKey ? 2 : 1)) || counts.get(duplicateKey) !== 2) fail();
}

function validateEvidence(manifest: ObjectValue, runId: string, hasReview: boolean, hasArtifactEncoding: boolean): void {
  const final = manifest.final as ObjectValue;
  const refs = manifest.evidence.map(artifactRef);
  const n = manifest.modules.length;
  if (refs.length !== 3 * n + (hasReview ? 6 : 4)) fail();
  let total = 0;
  for (const ref of refs) {
    total += ref.sizeBytes;
    if (total > MAX_BYTES) fail();
  }
  for (let index = 0; index < n; index += 1) {
    const module = manifest.modules[index] as ObjectValue;
    const implementation = refs[3 * index]!, decision = refs[3 * index + 1]!, quality = refs[3 * index + 2]!;
    assertOwnedRef(implementation, runId, module.sourceStageId, 'kubeclaw.implementation-agent', id => id.startsWith('implementation:'));
    assertOwnedRef(decision, runId, module.testStageId, 'kubeclaw.buster-quality-gate', id => id.includes(':decision:'));
    assertOwnedRef(quality, runId, module.testStageId, 'kubeclaw.buster-quality-gate', id => !id.includes(':decision:'));
    sameAttempt(decision, quality);
  }
  const finalStart = 3 * n;
  const finalImplementation = refs[finalStart]!, finalDecision = refs[finalStart + 1]!, finalQuality = refs[finalStart + 2]!, lint = refs[finalStart + 3]!;
  assertOwnedRef(finalImplementation, runId, final.sourceStageId, 'kubeclaw.implementation-agent', id => id.startsWith('implementation:'));
  assertOwnedRef(finalDecision, runId, final.testStageId, 'kubeclaw.buster-quality-gate', id => id.includes(':decision:'));
  assertOwnedRef(finalQuality, runId, final.testStageId, 'kubeclaw.buster-quality-gate', id => !id.includes(':decision:'));
  assertOwnedRef(lint, runId, final.lintStageId, 'kubeclaw.lint', () => true);
  sameAttempt(finalDecision, finalQuality);
  const matchingModule = manifest.modules.findIndex((item: ObjectValue) => item.sourceStageId === final.sourceStageId);
  if (refKey(finalImplementation) !== refKey(refs[3 * matchingModule]!)) fail();
  validateReviewRefs(refs, finalStart, final, runId, hasReview, hasArtifactEncoding);
  validateRefMultiplicity(refs, finalImplementation);
}

function validateUnsignedV3(value: unknown): DeliveryManifestV3Unsigned {
  // This is deliberately the first observation of caller-owned data.
  const serialized = portableJson(value);
  if (Buffer.byteLength(serialized) < 1 || Buffer.byteLength(serialized) > MAX_BYTES) fail();
  const manifest = object(value);
  exactKeys(manifest, ['schemaVersion', 'projectId', 'runId', 'sourceRevision', 'modules', 'final', 'evidence']);
  if (manifest.schemaVersion !== DELIVERY_MANIFEST_V3) fail();
  const projectId = text(manifest.projectId, 128);
  const runId = opaqueId(manifest.runId);
  const sourceRevision = text(manifest.sourceRevision, 40, GIT40);
  if (!Array.isArray(manifest.modules) || manifest.modules.length < 1 || manifest.modules.length > 128
    || !Array.isArray(manifest.evidence)) fail();
  validateModules(manifest, projectId, sourceRevision);
  const { hasReview, hasArtifactEncoding } = validateFinal(manifest, projectId, sourceRevision);
  validateEvidence(manifest, runId, hasReview, hasArtifactEncoding);
  return manifest as DeliveryManifestV3Unsigned;
}

function validateV3(value: unknown): DeliveryManifestV3 {
  // Reject caller traps and the full closed shape before extracting the digest.
  const serialized = portableJson(value);
  if (Buffer.byteLength(serialized) < 1 || Buffer.byteLength(serialized) > MAX_BYTES) fail();
  const manifest = object(value);
  exactKeys(manifest, ['schemaVersion', 'projectId', 'runId', 'sourceRevision', 'modules', 'final', 'evidence', 'digest']);
  const supplied = digest(manifest.digest);
  const { digest: _ignored, ...unsigned } = manifest;
  validateUnsignedV3(unsigned);
  if (supplied !== sha256Text(portableJson(unsigned))) fail();
  return manifest as DeliveryManifestV3;
}

function immutableClone<T>(value: T): T {
  const clone = JSON.parse(portableJson(value)) as T;
  const freeze = (item: unknown): void => {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      Object.freeze(item);
      for (const child of Object.values(item as ObjectValue)) freeze(child);
    }
  };
  freeze(clone);
  return clone;
}

export function createDeliveryManifestV3(value: DeliveryManifestV3Unsigned): DeliveryManifestV3 {
  const valid = validateUnsignedV3(value);
  const candidate = { ...valid, digest: sha256Text(portableJson(valid)) };
  return immutableClone(validateV3(candidate));
}

export function parseDeliveryManifestV3(value: unknown): DeliveryManifestV3 {
  portableJson(value);
  return immutableClone(validateV3(value));
}

export function assertDeliveryManifestForRead(value: unknown, owner: {
  runId: string;
  manifestStageId: string;
  gateStageId: string;
  expectedRef: ArtifactRef;
  bytes: string;
}): Readonly<Record<string, unknown>> {
  portableJson(value); portableJson(owner); // fail before reflection
  const manifest = object(value);
  const ref = artifactRef(owner.expectedRef);
  assertOwnedRef(ref, owner.runId, owner.manifestStageId, 'kubeclaw.project-summary', () => true);
  if (manifest.runId !== owner.runId || sha256Text(owner.bytes) !== ref.digest
    || Buffer.byteLength(owner.bytes) !== ref.sizeBytes) fail();
  const final = object(manifest.final);
  if (final.testStageId !== owner.gateStageId || manifest.sourceRevision !== final.sourceRevision || !Array.isArray(manifest.evidence)) fail();
  if (manifest.schemaVersion === 'delivery-manifest.v2') {
    const { digest: supplied, ...unsigned } = manifest;
    if (supplied !== sha256Text(canonicalJson(unsigned))) fail();
    return immutableClone(manifest);
  }
  const parsed = parseDeliveryManifestV3(manifest);
  if (ref.encoding !== PORTABLE_JSON_ENCODING || ref.artifactId !== `project-summary:${parsed.runId}`
    || owner.bytes !== portableJson(parsed)) fail();
  return parsed as unknown as Readonly<Record<string, unknown>>;
}
