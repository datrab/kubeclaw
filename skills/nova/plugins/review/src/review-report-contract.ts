import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { REVIEW_CATEGORIES, REVIEW_PRIORITIES, type ReviewCategory, type ReviewPriority } from './echo-review-contract.ts';
import { REVIEW_GOVERNOR_DECISIONS, REVIEW_GOVERNOR_SCHEMA_VERSION, type ReviewGovernorSnapshot } from './review-governor.ts';

export const REVIEW_REPORT_SCHEMA_VERSION = 'review-report.v2' as const;
export const REVIEW_REPORT_DISPOSITIONS = ['blocker', 'advisory', 'follow_up', 'ignored'] as const;
export const REVIEW_REPORT_ORIGINS = ['verified_finding', 'echo_proposal'] as const;
export type ReviewReportDisposition = typeof REVIEW_REPORT_DISPOSITIONS[number];
export const REVIEW_GOVERNOR_CLASSES = ['in_scope_blocker', 'follow_up', 'scope_break'] as const;

export interface ReviewReportItem {
  readonly itemId: `sha256:${string}`;
  readonly disposition: ReviewReportDisposition;
  readonly origin: typeof REVIEW_REPORT_ORIGINS[number];
  readonly priority: ReviewPriority;
  readonly category: ReviewCategory;
  readonly message: string;
  readonly recommendedFix: string;
  readonly reason: string;
  readonly findingFingerprint?: `sha256:${string}`;
  readonly proposalId?: `sha256:${string}`;
  readonly rootCauseId?: `sha256:${string}`;
  readonly candidateIds?: readonly `sha256:${string}`[];
  readonly governorClass?: typeof REVIEW_GOVERNOR_CLASSES[number];
}

export interface ReviewReport {
  readonly schemaVersion: typeof REVIEW_REPORT_SCHEMA_VERSION;
  readonly attemptId: string;
  readonly taskId: string;
  readonly profile: 'gate' | 'lean' | 'audit';
  readonly policyDigest: `sha256:${string}`;
  readonly bundleDigest: `sha256:${string}`;
  readonly revision: {
    readonly base: string;
    readonly head: string;
    readonly changedManifestDigest: `sha256:${string}`;
  };
  readonly governor: ReviewGovernorSnapshot;
  readonly outcome: 'passed' | 'request_fix' | 'blocked' | 'orchestrator_required';
  readonly omitted: Readonly<Record<ReviewReportDisposition, number>>;
  readonly items: Readonly<Record<`sha256:${string}`, Omit<ReviewReportItem, 'itemId'>>>;
}

const DIGEST = /^sha256:[0-9a-f]{64}(?![\s\S])/u;
const GIT_OBJECT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})(?![\s\S])/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}(?![\s\S])/u;

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>> : undefined;
}

function exact(value: Readonly<Record<string, unknown>>, fields: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === fields.length && actual.every((field) => fields.includes(field));
}

function boundedText(value: unknown, maximum = 4096): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    && Array.from(value).length <= maximum;
}

function digest(value: unknown): value is `sha256:${string}` {
  return typeof value === 'string' && DIGEST.test(value);
}

function digestList(value: unknown): value is readonly `sha256:${string}`[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 64
    && value.every(digest) && new Set(value).size === value.length;
}

function validItemProvenance(item: Readonly<Record<string, unknown>>): boolean {
  if (item.origin === 'verified_finding') {
    return digest(item.findingFingerprint)
      && !Object.hasOwn(item, 'proposalId') && !Object.hasOwn(item, 'candidateIds');
  }
  return item.origin === 'echo_proposal' && digest(item.proposalId)
    && !Object.hasOwn(item, 'findingFingerprint') && !Object.hasOwn(item, 'rootCauseId');
}

function validOptionalItemFields(item: Readonly<Record<string, unknown>>): boolean {
  const checks = [
    !Object.hasOwn(item, 'findingFingerprint') || digest(item.findingFingerprint),
    !Object.hasOwn(item, 'proposalId') || digest(item.proposalId),
    !Object.hasOwn(item, 'rootCauseId') || digest(item.rootCauseId),
    !Object.hasOwn(item, 'candidateIds') || digestList(item.candidateIds),
    !Object.hasOwn(item, 'governorClass') || REVIEW_GOVERNOR_CLASSES.includes(item.governorClass as never),
  ];
  return checks.every(Boolean);
}

function validRequiredItemFields(item: Readonly<Record<string, unknown>>): boolean {
  return [
    REVIEW_REPORT_DISPOSITIONS.includes(item.disposition as never),
    REVIEW_REPORT_ORIGINS.includes(item.origin as never),
    REVIEW_PRIORITIES.includes(item.priority as never),
    REVIEW_CATEGORIES.includes(item.category as never),
    boundedText(item.message), boundedText(item.recommendedFix), boundedText(item.reason),
  ].every(Boolean);
}

function reportItem(value: unknown): value is ReviewReportItem {
  const item = record(value);
  if (!item) return false;
  const required = ['disposition', 'origin', 'priority', 'category', 'message', 'recommendedFix', 'reason'];
  const optional = ['findingFingerprint', 'proposalId', 'rootCauseId', 'candidateIds', 'governorClass'];
  if (!required.every((field) => Object.hasOwn(item, field))
    || !Object.keys(item).every((field) => required.includes(field) || optional.includes(field))) return false;
  return validItemProvenance(item) && validRequiredItemFields(item) && validOptionalItemFields(item);
}

function countIntegrity(
  omitted: Readonly<Record<string, unknown>>, items: readonly Omit<ReviewReportItem, 'itemId'>[], outcome: unknown,
): boolean {
  const blockerTotal = items.filter(({ disposition }) => disposition === 'blocker').length
    + Number(omitted.blocker);
  return outcome === 'request_fix' ? blockerTotal > 0 : outcome !== 'passed' || blockerTotal === 0;
}

function validReportIdentity(report: Readonly<Record<string, unknown>>): boolean {
  return [
    report.schemaVersion === REVIEW_REPORT_SCHEMA_VERSION,
    typeof report.attemptId === 'string' && IDENTIFIER.test(report.attemptId),
    typeof report.taskId === 'string' && IDENTIFIER.test(report.taskId),
    ['gate', 'lean', 'audit'].includes(String(report.profile)),
    digest(report.policyDigest), digest(report.bundleDigest),
    ['passed', 'request_fix', 'blocked', 'orchestrator_required'].includes(String(report.outcome)),
  ].every(Boolean);
}

function validRevision(revision: Readonly<Record<string, unknown>>): boolean {
  return [
    exact(revision, ['base', 'head', 'changedManifestDigest']),
    typeof revision.base === 'string' && GIT_OBJECT.test(revision.base),
    typeof revision.head === 'string' && GIT_OBJECT.test(revision.head),
    digest(revision.changedManifestDigest),
  ].every(Boolean);
}

function validOmitted(omitted: Readonly<Record<string, unknown>>): boolean {
  return exact(omitted, REVIEW_REPORT_DISPOSITIONS)
    && REVIEW_REPORT_DISPOSITIONS.every((disposition) => (
      Number.isSafeInteger(omitted[disposition]) && Number(omitted[disposition]) >= 0
    ));
}

function nonnegative(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function stringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= 2048 && value.every((entry) => typeof entry === 'string')
    && new Set(value).size === value.length && value.every((entry, index) => index === 0 || String(value[index - 1]) < entry);
}

function validGovernorBaseline(value: Readonly<Record<string, unknown>>): boolean {
  return [
    typeof value.base === 'string' && GIT_OBJECT.test(value.base),
    typeof value.head === 'string' && GIT_OBJECT.test(value.head),
    digest(value.changedManifestDigest), digest(value.policyDigest),
    stringList(value.allowedPrefixes), stringList(value.ownershipPrefixes), stringList(value.ownerKeys),
    nonnegative(value.changedFileCount), nonnegative(value.nonTestLoc),
  ].every(Boolean);
}

function validGovernorCurrent(value: Readonly<Record<string, unknown>>): boolean {
  return [
    typeof value.head === 'string' && GIT_OBJECT.test(value.head), digest(value.changedManifestDigest),
    stringList(value.ownerKeys), stringList(value.outsideOwnershipPaths),
    ...[value.remediationCyclesUsed, value.changedFileCount, value.nonTestLoc,
      value.fileLimit, value.nonTestLocLimit].map(nonnegative),
  ].every(Boolean);
}

function governorMatchesReport(
  baseline: Readonly<Record<string, unknown>>, current: Readonly<Record<string, unknown>>,
  report: Readonly<Record<string, unknown>>,
): boolean {
  const revision = record(report.revision);
  return Boolean(revision) && baseline.base === revision?.base && baseline.policyDigest === report.policyDigest
    && current.head === revision?.head && current.changedManifestDigest === revision?.changedManifestDigest;
}

function validGovernorShape(
  governor: Readonly<Record<string, unknown>>, baseline: Readonly<Record<string, unknown>>,
  current: Readonly<Record<string, unknown>>,
): boolean {
  return [
    exact(governor, ['schemaVersion', 'baselineId', 'baseline', 'current', 'decision']),
    governor.schemaVersion === REVIEW_GOVERNOR_SCHEMA_VERSION, digest(governor.baselineId),
    REVIEW_GOVERNOR_DECISIONS.includes(governor.decision as never),
    exact(baseline, ['base', 'head', 'changedManifestDigest', 'policyDigest', 'allowedPrefixes',
      'ownershipPrefixes', 'changedFileCount', 'nonTestLoc', 'ownerKeys']),
    exact(current, ['head', 'changedManifestDigest', 'remediationCyclesUsed', 'changedFileCount',
      'nonTestLoc', 'ownerKeys', 'outsideOwnershipPaths', 'fileLimit', 'nonTestLocLimit']),
  ].every(Boolean);
}

function validGovernor(value: unknown, report: Readonly<Record<string, unknown>>): value is ReviewGovernorSnapshot {
  const governor = record(value);
  if (!governor) return false;
  const baseline = record(governor.baseline), current = record(governor.current);
  if (!baseline || !current) return false;
  if (!validGovernorShape(governor, baseline, current)) return false;
  if (!validGovernorBaseline(baseline) || !validGovernorCurrent(current)) return false;
  if (!governorMatchesReport(baseline, current, report)) return false;
  return governor.baselineId === sha256Text(canonicalJson({
    schemaVersion: REVIEW_GOVERNOR_SCHEMA_VERSION, baseline,
  }));
}

export function isReviewReport(value: unknown): value is ReviewReport {
  const report = record(value);
  if (!report || !exact(report, [
    'schemaVersion', 'attemptId', 'taskId', 'profile', 'policyDigest', 'bundleDigest',
    'revision', 'governor', 'outcome', 'omitted', 'items',
  ])) return false;
  const revision = record(report.revision), omitted = record(report.omitted), items = record(report.items);
  if (![revision, omitted, items].every(Boolean)) return false;
  const safeRevision = revision as Readonly<Record<string, unknown>>;
  const safeOmitted = omitted as Readonly<Record<string, unknown>>;
  const safeItems = items as Readonly<Record<string, unknown>>;
  if (!validRevision(safeRevision) || !validOmitted(safeOmitted)) return false;
  const entries = Object.entries(safeItems);
  if (entries.length > 2048 || entries.some(([itemId, item]) => !digest(itemId) || !reportItem(item))) return false;
  const itemValues = entries.map(([, item]) => item as Omit<ReviewReportItem, 'itemId'>);
  return validReportIdentity(report) && validGovernor(report.governor, report)
    && countIntegrity(safeOmitted, itemValues, report.outcome);
}
