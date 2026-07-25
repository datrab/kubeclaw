import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { buildArtifactPaths, buildArtifactRefs } from './arch-validator-artifacts.ts';
import {
  objectRecord,
  requireNonEmptyString,
  resolveArchValidatorRunId,
  SEVERITY,
} from './arch-validator-values.ts';

function countFindings(findings: any[]) {
  return {
    blocking: findings.filter((finding) => finding?.severity === SEVERITY.BLOCKING).length,
    error: findings.filter((finding) => finding?.severity === SEVERITY.ERROR).length,
    warn: findings.filter((finding) => finding?.severity === SEVERITY.WARN).length,
    info: findings.filter((finding) => finding?.severity === SEVERITY.INFO).length,
  };
}

function diagnosticSeverity(severity: any) {
  if (severity === SEVERITY.BLOCKING) return 'critical';
  if (severity === SEVERITY.ERROR) return 'error';
  if (severity === SEVERITY.WARN) return 'warn';
  return 'info';
}

function controlSummary(input: any) {
  if (input.executionFailed || input.contractInvalid) {
    return input.error ? `Architecture validator execution failed: ${input.error}` : 'Architecture validator execution failed';
  }
  if (input.blocked) {
    const counts = countFindings(input.findings);
    return `Architecture validation BLOCKED with ${counts.blocking} blocking and ${counts.error} error finding(s)`;
  }
  return input.findings.length > 0
    ? `Architecture validation passed with ${input.findings.length} non-blocking finding(s)`
    : 'Architecture validation passed';
}

function findingDiagnostic(finding: any = {}) {
  return {
    code: requireNonEmptyString(finding.id, 'architecture validator finding id'),
    severity: diagnosticSeverity(finding.severity),
    message: selectDefinedValue(() => (finding.explanation), () => ('Architecture validation finding')),
    category: selectTruthyValue(() => (finding.scope), () => (null)),
    target: Array.isArray(finding.paths) && finding.paths.length > 0 ? finding.paths[0] : null,
    retryable: false,
    environmentIssue: false,
    metadata: {
      remediation: selectTruthyValue(() => (finding.remediation), () => (null)),
      paths: Array.isArray(finding.paths) ? [...finding.paths] : [],
      original_severity: selectTruthyValue(() => (finding.severity), () => (null)),
    },
  };
}

function controlMetadata(config: any, result: any, options: any, context: any) {
  return {
    blocked: context.blocked,
    execution_failed: context.executionFailed,
    contract_invalid: context.contractInvalid,
    contract_diagnostic: selectTruthyValue(() => (options.contractDiagnostic), () => (null)),
    error: context.error,
    project: context.project,
    run_id: context.runId,
    timestamp: context.timestamp,
    stage_id: context.stageId,
    findings_total: context.findings.length,
    blocking_count: context.counts.blocking,
    error_count: context.counts.error,
    warn_count: context.counts.warn,
    info_count: context.counts.info,
    artifact_paths: buildArtifactPaths(config),
    raw_findings: context.findings,
  };
}

function controlContext(config: any, result: any, options: any) {
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  const executionFailed = options.executionFailed === true;
  const contractInvalid = options.contractInvalid === true;
  const blocked = [executionFailed, contractInvalid, result?.blocked === true].some(Boolean);
  const context = {
    findings,
    executionFailed,
    contractInvalid,
    blocked,
    counts: countFindings(findings),
    runId: resolveArchValidatorRunId(config, result?.run_id),
    project: requireNonEmptyString(result?.project, 'architecture validator result project'),
    timestamp: requireNonEmptyString(result?.timestamp, 'architecture validator result timestamp'),
    stageId: requireNonEmptyString(selectDefinedValue(() => (options?.input?.ids?.stageId), () => (options?.stageId)), 'architecture validator stageId'),
    validatorName: requireNonEmptyString(selectDefinedValue(() => (options?.input?.ids?.validatorName), () => (options?.validatorName)), 'architecture validator name'),
    error: selectTruthyValue(() => (options.error), () => (null)),
    summary: '',
  };
  context.summary = controlSummary(context);
  return context;
}

export function buildArchitectureValidatorControlResult(config: any, result: any = {}, options: any = {}) {
  const context = controlContext(config, result, options);
  const metadata = controlMetadata(config, result, options, context);
  return {
    schemaVersion: 'v1',
    producerKind: 'validator',
    producerType: context.validatorName,
    nextAction: context.blocked ? 'block' : 'pass',
    ...(context.blocked ? { issueType: context.executionFailed || context.contractInvalid ? 'contract' : 'code' } : {}),
    diagnostics: {
      summary: context.summary,
      findings: context.findings.map(findingDiagnostic),
      artifacts: buildArtifactRefs(config),
      metadata,
      typed: {
        validator: {
          schemaVersion: 'v1',
          validatorType: context.validatorName,
          outcomeClass: context.blocked ? 'blocked' : 'passed',
          summary: context.summary,
          metadata: {
            blocked: metadata.blocked,
            execution_failed: metadata.execution_failed,
            contract_invalid: metadata.contract_invalid,
            contract_diagnostic: metadata.contract_diagnostic,
            error: metadata.error,
            project: metadata.project,
            run_id: metadata.run_id,
            timestamp: metadata.timestamp,
            stage_id: metadata.stage_id,
            findings_total: metadata.findings_total,
            blocking_count: metadata.blocking_count,
            error_count: metadata.error_count,
            warn_count: metadata.warn_count,
            info_count: metadata.info_count,
          },
        },
      },
    },
  };
}

function isArchitectureValidatorControlResult(result: any) {
  return result?.schemaVersion === 'v1'
    && result?.producerKind === 'validator'
    && typeof result?.producerType === 'string'
    && typeof result?.nextAction === 'string';
}

export function coerceArchitectureValidatorControlResult(_config: any, result: any, _opts: any = {}) {
  if (isArchitectureValidatorControlResult(result)) return result;
  throw new Error('validator:architecture plugin output must be a typed validator control result; compatibility-shaped validation results are not accepted at the validator boundary');
}

export function extractArchValidatorReport(result: any, config: any) {
  if (!isArchitectureValidatorControlResult(result)) {
    return {
      blocked: result?.blocked === true,
      findings: Array.isArray(result?.findings) ? result.findings : [],
      timestamp: requireNonEmptyString(result?.timestamp, 'architecture validator result timestamp'),
      project: requireNonEmptyString(result?.project, 'architecture validator result project'),
      run_id: requireNonEmptyString(result?.run_id, 'architecture validator result run_id'),
      execution_failed: false,
      error: null,
      artifact_paths: buildArtifactPaths(config),
    };
  }
  const metadata = objectRecord(
    selectDefinedValue(() => (result?.diagnostics?.metadata), () => (result?.diagnostics?.typed?.validator?.metadata)),
  );
  return {
    blocked: result?.nextAction === 'block' || metadata.blocked === true,
    findings: Array.isArray(metadata.raw_findings) ? metadata.raw_findings : [],
    timestamp: requireNonEmptyString(metadata.timestamp, 'architecture validator metadata timestamp'),
    project: requireNonEmptyString(metadata.project, 'architecture validator metadata project'),
    run_id: requireNonEmptyString(metadata.run_id, 'architecture validator metadata run_id'),
    execution_failed: metadata.execution_failed === true || metadata.contract_invalid === true,
    error: selectTruthyValue(() => (metadata.error), () => (null)),
    artifact_paths: objectRecord(metadata.artifact_paths),
  };
}
