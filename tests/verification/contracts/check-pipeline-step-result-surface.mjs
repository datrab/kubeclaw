import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-pipeline-step-result-surface' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/contracts/pipeline-step-result.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');

for (const marker of [
  'export const PIPELINE_STEP_RESULT_SCHEMA_VERSION',
  'export const PIPELINE_STEP_RESULT_KIND',
  'export const PIPELINE_STEP_TYPES',
  'export const PIPELINE_STEP_ACTIONS',
  'export const PIPELINE_STEP_OUTCOMES',
  'export function buildPipelineStepResult(',
  'export function buildPipelineStepResultFromControlResult(',
  'export function validatePipelineStepResult(',
  'export function assertPipelineStepResult(',
  'export function isPipelineStepResult(',
  'export function pipelineStepDiagnosticSummary(',
  'export function pipelineStepTerminalStatus(',
  'export function pipelineStepTerminalDecision(',
]) {
  assert.equal(helperSource.includes(marker), true, `pipeline step-result helper must export ${marker}`);
}

for (const forbidden of [
  'buildPipelineStepResultFromCompatibilityResult',
  'projectPipelineStepCompatibilityResult',
  'attachPipelineStepCompatibilityProjection',
  'buildPipelineStepResultAuthorityPolicy',
  'normalizeCompatibility',
  'compatibilityResult',
  'compatibilityProjection',
  'compatibility.projection',
  '../compatibility-authority.ts',
  'PIPELINE_STEP_EXIT_CODES',
  'PIPELINE_STEP_EXIT_LABELS',
  'pipelineStepExitCode',
  'pipelineStepExitLabel',
  'pipelineStepExitCodeForOutcome',
  'pipelineStepExitLabelForCode',
  'terminal.exitCode',
  'terminal.exitLabel',
]) {
  assert.equal(helperSource.includes(forbidden), false, `pipeline step-result helper must not expose ${forbidden}`);
}

assert.equal(helperSource.includes('summary.includes('), false, 'pipeline step-result helper must not infer HALT outcomes from summary text');
assert.equal(helperSource.includes('const normalizedOutcome = normalizePipelineStepOutcome(outcome) || defaultOutcomeForAction(normalizedAction);'), false, 'direct step-result builder must require explicit canonical outcome');
assert.equal(helperSource.includes('function defaultOutcomeForAction('), false, 'step-result projection must not synthesize outcomes from nextAction defaults');
assert.equal(helperSource.includes('function inferOutcomeFromControlResult('), false, 'step-result projection must not infer outcomes from control payload fields');
assert.equal(helperSource.includes('metadata.outcome'), false, 'step-result projection must not infer outcome from diagnostics metadata');
assert.equal(helperSource.includes("controlResult?.issueType === 'code'"), false, 'step-result projection must not infer HALT outcome from issueType');
assert.equal(helperSource.includes('typedNode.gateRunStatus'), false, 'step-result projection must not infer outcome from gateRunStatus');
assert.equal(helperSource.includes('typedNode.recommendation'), false, 'step-result projection must not infer outcome from recommendation');
assert.equal(helperSource.includes('metadata.rate_limit_exhausted === true'), false, 'rate-limit exhaustion must come from typed step outcome, not diagnostics metadata');
assert.equal(helperSource.includes('controlMetadata.rate_limit_exhausted === true'), false, 'rate-limit exhaustion must come from typed step outcome, not control metadata');
assert.equal(helperSource.includes('rateLimitStatus?.rate_limit_exhausted === true'), false, 'rate-limit exhaustion must come from typed step outcome, not nested rate-limit status metadata');

const runnerFiles = [
  'skills/nova/pipeline/runners/module-runner-shared.ts',
  'skills/nova/pipeline/runners/pipeline-runner-terminal.ts',
  'skills/nova/pipeline/runners/pipeline-runner-shared.ts',
  'skills/nova/pipeline/runners/pipeline-runner-scheduling.ts',
];

for (const relPath of runnerFiles) {
  const source = fs.readFileSync(path.join(sourceRoot, relPath), 'utf8');
  assert.equal(source.includes('attachPipelineStepCompatibilityProjection'), false, `${relPath} must not attach pipeline step compatibility projections`);
  assert.equal(source.includes('projectPipelineStepCompatibilityResult'), false, `${relPath} must not project pipeline step compatibility results`);
  assert.equal(source.includes('buildPipelineStepResultFromCompatibilityResult'), false, `${relPath} must not build from compatibility result envelopes`);
  assert.equal(source.includes('compatibilityResult'), false, `${relPath} must not pass compatibilityResult into typed step builders`);
}

const helperMod = await import(pathToFileURL(helperPath).href);

assert.equal(Object.isFrozen(helperMod.PIPELINE_STEP_TYPES), true, 'step type registry should be frozen');
assert.equal(Object.isFrozen(helperMod.PIPELINE_STEP_ACTIONS), true, 'step action registry should be frozen');
assert.equal(Object.isFrozen(helperMod.PIPELINE_STEP_OUTCOMES), true, 'step outcome registry should be frozen');

assert.deepEqual(Object.values(helperMod.PIPELINE_STEP_ACTIONS), ['continue', 'request_fix', 'wait', 'retry', 'halt']);
assert.equal(helperMod.pipelineStepActionForControlAction('block'), 'halt');
assert.equal(helperMod.pipelineStepActionForControlAction('pass'), 'continue');

const passResult = helperMod.buildPipelineStepResult({
  stepType: 'gate',
  stepId: 'quality',
  nextAction: 'continue',
  outcome: 'passed',
  reason: 'Gate passed',
  correlation: { gate_id: 'quality', gate_type: 'review' },
});
assert.equal(helperMod.isPipelineStepResult(passResult), true);
assert.deepEqual(helperMod.validatePipelineStepResult(passResult), []);
assert.equal(helperMod.pipelineStepTerminalStatus(passResult), 'succeeded');
assert.equal(helperMod.pipelineStepTerminalDecision(passResult).status, 'succeeded');
assert.equal(helperMod.pipelineStepTerminalDecision(passResult).action, 'none');
assert.equal(helperMod.pipelineStepTerminalDecision(passResult).exitCode, undefined, 'terminal decision must not carry numeric exitCode');
assert.equal(passResult.terminal.exitCode, undefined, 'typed step result terminal must not expose exitCode');
assert.equal(passResult.terminal.exitLabel, undefined, 'typed step result terminal must not expose exitLabel');
assert.equal(passResult.exit, undefined, 'typed step result must not expose top-level exit');
assert.equal(passResult.status, undefined, 'typed step result must not expose top-level status');
assert.equal(passResult.compatibility, undefined, 'typed step result must not expose compatibility projection data');

const needsNovaControl = {
  schemaVersion: 'v1',
  producerKind: 'gate',
  producerType: 'buster',
  nextAction: 'block',
  issueType: 'code',
  diagnostics: {
    summary: 'Fix cycles exhausted',
    metadata: {
      fix_cycles: 3,
    },
    typed: {
      gate: {
        schemaVersion: 'v1',
        outcomeClass: 'needs_nova',
      },
    },
  },
};
const needsNovaStep = helperMod.buildPipelineStepResultFromControlResult(needsNovaControl, {
  stepType: 'gate',
  stepId: 'test',
  outcome: 'needs_nova',
  correlation: { gate_id: 'test', gate_type: 'buster' },
  remediation: { cycle: 3, maxCycles: 3, reason: 'fix_cycles_exhausted' },
});
assert.equal(needsNovaStep.nextAction, 'halt');
assert.equal(needsNovaStep.outcome, 'needs_nova');
assert.equal(needsNovaStep.terminal.status, 'action_required');
assert.equal(needsNovaStep.terminal.decision.action, 'request_handoff');
assert.equal(needsNovaStep.terminal.decision.reasonCode, 'needs_nova');
assert.equal(needsNovaStep.terminal.exitCode, undefined);
assert.equal(needsNovaStep.terminal.exitLabel, undefined);
assert.equal(needsNovaStep.diagnostics.typed.remediation.cycle, 3);
assert.equal(helperMod.pipelineStepDiagnosticSummary(needsNovaStep), 'Fix cycles exhausted');

const staleMetadataStep = helperMod.buildPipelineStepResultFromControlResult({
  schemaVersion: 'v1',
  producerKind: 'gate',
  producerType: 'review',
  nextAction: 'pass',
  issueType: null,
  diagnostics: {
    summary: 'Typed pass should own lifecycle',
    metadata: {
      outcome: 'error',
      outcomeClass: 'needs_nova',
    },
    typed: {
      gate: {
        outcomeClass: 'passed',
      },
    },
  },
}, {
  stepType: 'gate',
  stepId: 'review',
  outcome: 'passed',
});
assert.equal(staleMetadataStep.nextAction, 'continue');
assert.equal(staleMetadataStep.outcome, 'passed', 'typed outcome must beat stale metadata outcome');
assert.equal(staleMetadataStep.terminal.status, 'succeeded');

const rateLimitedStep = helperMod.buildPipelineStepResultFromControlResult({
  schemaVersion: 'v1',
  producerKind: 'gate',
  producerType: 'buster',
  nextAction: 'block',
  issueType: 'environment',
  diagnostics: {
    summary: 'Rate limit exhausted',
    metadata: {
      legacy_outcome_class: 'rate_limit_exhausted',
      rate_limit_exhausted: true,
      max_rate_limit_pauses: 3,
      rate_limit_status: {
        rate_limit_exhausted: true,
        max_rate_limit_pauses: 3,
        dispatch_id: 'dispatch-rate-limit-1',
      },
    },
    typed: {
      gate: {
        outcomeClass: 'rate_limited',
      },
    },
  },
}, {
  stepType: 'gate',
  stepId: 'buster',
  outcome: 'rate_limited',
});
assert.equal(rateLimitedStep.outcome, 'rate_limited');
assert.equal(rateLimitedStep.terminal.status, 'rate_limited');
const rateLimitDetails = helperMod.pipelineStepRateLimitDetails(rateLimitedStep);
assert.equal(rateLimitDetails.source, 'typed_step_result_diagnostics');
assert.equal(rateLimitDetails.rate_limit_exhausted, true);
assert.equal(rateLimitDetails.max_rate_limit_pauses, 3);
assert.equal(rateLimitDetails.rate_limit_status.dispatch_id, 'dispatch-rate-limit-1');

const staleRateLimitMetadataStep = helperMod.buildPipelineStepResultFromControlResult({
  schemaVersion: 'v1',
  producerKind: 'gate',
  producerType: 'buster',
  nextAction: 'pass',
  issueType: null,
  diagnostics: {
    summary: 'Metadata still mentions exhaustion, but outcome passed',
    metadata: {
      rate_limit_exhausted: true,
      rate_limit_status: {
        rate_limit_exhausted: true,
        max_rate_limit_pauses: 7,
      },
    },
  },
}, {
  stepType: 'gate',
  stepId: 'stale-rate-limit-metadata',
  outcome: 'passed',
});
const staleRateLimitDetails = helperMod.pipelineStepRateLimitDetails(staleRateLimitMetadataStep);
assert.equal(staleRateLimitDetails.rate_limit_exhausted, false, 'rate-limit exhaustion must be false unless the typed step outcome is rate_limited');
assert.equal(staleRateLimitDetails.max_rate_limit_pauses, 7, 'diagnostic rate-limit metadata may still carry non-authoritative details');

const ambiguousHaltStep = helperMod.buildPipelineStepResultFromControlResult({
  schemaVersion: 'v1',
  producerKind: 'gate',
  producerType: 'buster',
  nextAction: 'block',
  issueType: null,
  diagnostics: {
    summary: 'Rate limit timeout needs nova wording should not be authority',
    typed: {
      gate: {
        outcomeClass: 'error',
      },
    },
  },
}, {
  stepType: 'gate',
  stepId: 'ambiguous-halt',
  outcome: 'error',
});
assert.equal(ambiguousHaltStep.outcome, 'error', 'explicit typed outcome metadata must own HALT classification instead of summary text');
assert.equal(ambiguousHaltStep.terminal.status, 'failed');

const retryStep = helperMod.buildPipelineStepResultFromControlResult({
  schemaVersion: 'v1',
  producerKind: 'worker',
  producerType: 'module_forge',
  nextAction: 'retry',
  issueType: 'environment',
  diagnostics: {
    summary: 'Forge timed out and will retry',
    typed: {
      worker: {
        outcomeClass: 'retrying',
      },
    },
  },
}, {
  stepType: 'module',
  stepId: '01',
  outcome: 'retrying',
});
assert.equal(retryStep.nextAction, 'retry');
assert.equal(retryStep.outcome, 'retrying', 'non-terminal retry action must not become terminal timeout internally');
assert.equal(retryStep.terminal.status, null);
assert.equal(retryStep.terminal.decision, null);
assert.equal(retryStep.terminal.exitCode, undefined);

const requestFixStep = helperMod.buildPipelineStepResultFromControlResult({
  schemaVersion: 'v1',
  producerKind: 'worker',
  producerType: 'module_buster',
  nextAction: 'request_fix',
  issueType: 'code',
  diagnostics: {
    summary: 'Tests failed',
    typed: {
      worker: {
        outcomeClass: 'fix_requested',
      },
    },
  },
}, {
  stepType: 'module',
  stepId: '01',
  outcome: 'fix_requested',
});
assert.equal(requestFixStep.nextAction, 'request_fix');
assert.equal(requestFixStep.outcome, 'fix_requested');
assert.equal(requestFixStep.terminal.exitCode, undefined, 'non-terminal request_fix should not project an exit code');

assert.throws(
  () => helperMod.buildPipelineStepResult({ stepType: 'gate', stepId: 'review', nextAction: 'continue', outcome: 'needs_nova' }),
  /outcome 'needs_nova' is not valid for nextAction 'continue'/,
  'step result helper should reject typed-action/outcome contradictions',
);

assert.throws(
  () => helperMod.buildPipelineStepResult({ stepType: 'gate', stepId: 'review', nextAction: 'continue' }),
  /outcome must be one of:/,
  'direct step result builder should reject missing outcome instead of defaulting from nextAction',
);

assert.throws(
  () => helperMod.buildPipelineStepResultFromControlResult({
    schemaVersion: 'v1',
    producerKind: 'gate',
    producerType: 'buster',
    nextAction: 'block',
    issueType: 'code',
    diagnostics: {
      summary: 'Issue type is not outcome authority',
      metadata: {
        outcomeClass: 'needs_nova',
      },
    },
  }, {
    stepType: 'gate',
    stepId: 'no-typed-outcome',
  }),
  /outcome must be one of:/,
  'control result projection should reject missing typed outcome instead of inferring from issueType or metadata',
);

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'typed-pipeline-step-results-only' }));
