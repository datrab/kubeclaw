import { canonicalJson, sha256Text, verifyReviewSubject, type ArtifactRef, type PluginInvocationContext, type StageResult } from '@kubeclaw/plugin-sdk';
import { execute as executeApproval } from './stage.ts';

interface ArchitectureApprovalInput {
  readonly summary: string;
  readonly artifactId: string;
  readonly namespace: string;
}

function requiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`ARCHITECTURE_APPROVAL_${label}_INVALID`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || normalized.includes('\0') || /[\r\n]/u.test(normalized)) {
    throw new Error(`ARCHITECTURE_APPROVAL_${label}_INVALID`);
  }
  return normalized;
}

function parseInput(value: unknown): ArchitectureApprovalInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ARCHITECTURE_APPROVAL_INPUT_INVALID');
  }
  const input = value as Record<string, unknown>;
  const allowed = new Set(['summary', 'artifactId', 'namespace']);
  const unknown = Object.keys(input).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`ARCHITECTURE_APPROVAL_INPUT_UNKNOWN_FIELD:${unknown}`);
  return Object.freeze({
    summary: requiredText(input.summary, 'SUMMARY', 4_096),
    artifactId: requiredText(input.artifactId, 'ARTIFACT_ID', 2_048),
    namespace: requiredText(input.namespace, 'NAMESPACE', 1_024),
  });
}

function reportText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new Error(`ARCHITECTURE_APPROVAL_${label}_INVALID`);
  }
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`ARCHITECTURE_APPROVAL_${label}_INVALID`);
  }
  return normalized;
}

function findingSummary(value: unknown, maximum: number): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ARCHITECTURE_APPROVAL_ARTIFACT_INVALID');
  }
  const findings = (value as Record<string, unknown>).findings;
  if (!Array.isArray(findings)) throw new Error('ARCHITECTURE_APPROVAL_FINDINGS_INVALID');
  if (findings.length === 0) return '';
  const fragments = findings.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`ARCHITECTURE_APPROVAL_FINDING_INVALID:${index}`);
    }
    const finding = entry as Record<string, unknown>;
    return [
      reportText(finding.severity, `FINDING_${index}_SEVERITY`, 32).toUpperCase(),
      reportText(finding.id, `FINDING_${index}_ID`, 256),
      reportText(finding.explanation, `FINDING_${index}_EXPLANATION`, 8_192),
      `Remediation: ${reportText(finding.remediation, `FINDING_${index}_REMEDIATION`, 8_192)}`,
    ].join(' · ');
  });
  const prefix = `${findings.length} architecture finding${findings.length === 1 ? '' : 's'}: `;
  let rendered = prefix;
  for (const [index, fragment] of fragments.entries()) {
    const separator = index === 0 ? '' : ' | ';
    const remaining = maximum - rendered.length - separator.length;
    if (remaining <= 0) break;
    if (fragment.length <= remaining) {
      rendered += `${separator}${fragment}`;
      continue;
    }
    const suffix = ' … Full details remain in the architecture artifact.';
    const available = Math.max(0, remaining - suffix.length);
    rendered += `${separator}${fragment.slice(0, available).trimEnd()}${suffix}`;
    break;
  }
  return rendered.slice(0, maximum).trimEnd();
}

async function approvalReport(
  rawInput: unknown,
  context: PluginInvocationContext,
) {
  const input = parseInput(rawInput);
  const candidates = context.contract.artifacts.filter((artifact) =>
    artifact.artifactId === input.artifactId && artifact.namespace === input.namespace
    && artifact.producer.runId === context.contract.lease.attempt.runId);
  const producers = new Set(candidates.map((artifact) => artifact.producer.stageId));
  const latest = Math.max(...candidates.map((artifact) => artifact.producer.attemptNumber));
  const selected = candidates.filter((artifact) => artifact.producer.attemptNumber === latest);
  if (producers.size !== 1 || selected.length !== 1) throw new Error('ARCHITECTURE_APPROVAL_REFERENCE_MISSING_OR_AMBIGUOUS');
  const artifact = selected[0]!;
  if (artifact.mediaType !== 'application/json' || !Number.isSafeInteger(artifact.sizeBytes)
    || artifact.sizeBytes < 1 || artifact.sizeBytes > 256 * 1024) throw new Error('ARCHITECTURE_APPROVAL_REFERENCE_INVALID');
  const response = await context.invoke('artifacts.read', {
    operation: 'get_json',
    resource: { type: 'artifact.object', canonicalId: artifact.artifactId },
    payload: { namespace: artifact.namespace, digest: artifact.digest },
  });
  const serialized = canonicalJson(response.value);
  if (response.digest !== artifact.digest || response.sizeBytes !== artifact.sizeBytes
    || sha256Text(serialized) !== artifact.digest || Buffer.byteLength(serialized) !== artifact.sizeBytes) {
    throw new Error('ARCHITECTURE_APPROVAL_CONTENT_INVALID');
  }
  const report = response.value as { verdict?: unknown; subject?: unknown } | null;
  if (!report || report.verdict !== 'passed') throw new Error('ARCHITECTURE_APPROVAL_REPORT_NOT_PASSED');
  return { input, artifact, report };
}

export async function execute(rawInput: unknown, context: PluginInvocationContext): Promise<StageResult> {
  const { input, artifact, report } = await approvalReport(rawInput, context);
  const subject = report.subject === undefined ? undefined : await verifyReviewSubject(report.subject, context);
  const approvalPrefix = `${input.summary} Evidence: ${artifact.digest}. Findings: `;
  const findings = findingSummary(report, 10_000 - approvalPrefix.length);
  const result = findings ? await executeApproval({ summary: `${approvalPrefix}${findings}` }, context) : {
      schemaVersion: 'stage-result.v2',
      outcome: 'passed',
      artifacts: [],
    } as StageResult;
  if (result.outcome !== 'passed') return result;
  if (subject) await verifyReviewSubject(subject, context);
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: 'architecture-approval' },
    payload: { namespace: 'kubeclaw.human-approval', mediaType: 'application/json', value: {
      decision: 'approved', subject: subject ?? null, reportDigest: artifact.digest, reportStageId: artifact.producer.stageId,
      guidance: context.contract.guidance ?? null, clean: !findings,
    } },
  });
  return { ...result, artifacts: [stored.artifact as ArtifactRef] };
}
