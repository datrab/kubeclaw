import { log } from '../core/logger.ts';
import { selectTruthyValue } from '../optional-absence.ts';
import { buildValidatorPrompt, runAgentJudgment } from './arch-validator-agent.ts';
import { writeArchitectureArtifacts } from './arch-validator-artifacts.ts';
import { runDeterministicArchitectureChecks } from './arch-validator-checks.ts';
import { buildArchitectureValidatorControlResult } from './arch-validator-control.ts';
import {
  errorMessage,
  FINDING_CODES,
  isBlocking,
  makeFinding,
  requireNonEmptyString,
  SCOPE,
  SEVERITY,
  validatorAgentOutputPath,
} from './arch-validator-values.ts';

export { buildValidatorPrompt } from './arch-validator-agent.ts';
export {
  buildArchitectureValidatorControlResult,
  coerceArchitectureValidatorControlResult,
  extractArchValidatorReport,
} from './arch-validator-control.ts';
export { isBlocking } from './arch-validator-values.ts';

function internalFailure(error: unknown) {
  const message = errorMessage(error);
  return {
    message,
    finding: makeFinding(
      FINDING_CODES.VALIDATOR_INTERNAL_ERROR,
      SEVERITY.BLOCKING,
      SCOPE.PROJECT,
      [],
      `Architecture validator encountered an internal error: ${message}`,
      'Review validator logs and fix the validator/runtime error before starting pipeline work.',
    ),
  };
}

function logValidationResult(findings: any[], blocked: boolean) {
  if (blocked) {
    const blocking = findings.filter(
      (finding) => finding.severity === SEVERITY.BLOCKING || finding.severity === SEVERITY.ERROR,
    );
    log('ERROR', `[arch-validator] Architecture validation BLOCKED — ${blocking.length} blocking/error finding(s)`);
    for (const finding of blocking) {
      log('ERROR', `  [${finding.id}] ${finding.explanation}`);
      log('ERROR', `  Fix: ${finding.remediation}`);
    }
    return;
  }
  if (findings.length > 0) {
    log('WARN', `[arch-validator] Architecture validation passed with ${findings.length} non-blocking finding(s)`);
    return;
  }
  log('OK', '[arch-validator] Architecture validation passed — no issues found');
}

export async function runArchValidator(config: any, progress: any, opts: any = {}) {
  const timestamp = new Date().toISOString();
  const project = requireNonEmptyString(progress?.project, 'progress.project');
  log('STEP', '[arch-validator] Running pre-pipeline architecture validation...');
  let findings: any[] = [];
  let prompt = null;
  let executionFailed = false;
  let executionError = null;
  try {
    const deterministic = runDeterministicArchitectureChecks(progress, config);
    prompt = buildValidatorPrompt(progress, config, deterministic, validatorAgentOutputPath(config));
    const agentFindings = await runAgentJudgment(progress, config, deterministic, opts);
    findings = [...deterministic, ...(agentFindings ?? [])];
  } catch (error) {
    const failure = internalFailure(error);
    executionFailed = true;
    executionError = failure.message;
    findings = [failure.finding];
    log('ERROR', `[arch-validator] Unexpected error during validation: ${executionError}`);
  }
  const blocked = isBlocking(findings);
  const result = {
    blocked,
    project,
    timestamp,
    findings,
    execution_failed: executionFailed,
    error: executionError,
  };
  writeArchitectureArtifacts(config, result, prompt);
  logValidationResult(findings, blocked);
  return result;
}

export async function runArchitectureValidatorStage(config: any, progress: any, opts: any = {}) {
  const result = await runArchValidator(config, progress, opts);
  return buildArchitectureValidatorControlResult(config, result, {
    ...opts,
    executionFailed: result.execution_failed === true,
    error: selectTruthyValue(() => (result.error), () => (null)),
  });
}
