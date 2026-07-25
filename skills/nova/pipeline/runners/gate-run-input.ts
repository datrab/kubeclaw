import path from 'path';
import { selectTruthyValue } from '../optional-absence.ts';
import { getRunId } from '../core/runtime.ts';
import { gateOutputPath, gateInstructionsPath, gateStatusPath, gateActiveSessionPath } from '../core/paths.ts';
import { buildStageRefs, collectExistingArtifactRefs } from './stage-envelope-primitives.ts';

function objectRecord(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function formatFromPath(filePath: any, label: any) {
  const format = path.extname(filePath).slice(1);
  if (!format) throw new Error(`${label}: file extension required for artifact format`);
  return format;
}

function buildGateArtifactRefs(config: any, gateId: any, gate: any) {
  const refs: any[] = [];
  if (gate?.output_file) {
    const outputPath = gateOutputPath(config, gate);
    refs.push({ type: 'gate_output', role: 'output', format: formatFromPath(outputPath, 'gate.output_file'), path: outputPath });
  }
  refs.push({ type: 'gate_status', role: 'diagnostic', format: 'json', path: gateStatusPath(config, gateId) });
  refs.push({ type: 'gate_active_session', role: 'recovery', format: 'json', path: gateActiveSessionPath(config, gateId) });
  if (gate?.instructions_file) {
    const instructionsPath = gateInstructionsPath(config, gate);
    refs.push({ type: 'gate_instructions', role: 'input', format: formatFromPath(instructionsPath, 'gate.instructions_file'), path: instructionsPath });
  }
  return collectExistingArtifactRefs(refs);
}

function buildGateStateSnapshot(config: any, progress: any, gateId: any, gate: any, deps: any) {
  const gateOutput = deps.readGateOutput(config, gate);
  const lifecycleGate = deps.getLifecycleGateState(config, gateId);
  const completionEvidence = deps.readGateCompletionEvidence(config, gateId, gate);
  return {
    pipeline: { project: selectTruthyValue(() => config?.project, () => null), run_id: getRunId(config) },
    gate: {
      gate_id: gateId,
      gate_type: selectTruthyValue(() => gate?.type, () => null),
      title: selectTruthyValue(() => gate?.title, () => null),
      output_exists: gateOutput.exists === true,
      output_is_pass: gateOutput.isPass === true,
      output_status: selectTruthyValue(() => gateOutput?.data?.status, () => null),
      timeout_policy: selectTruthyValue(() => lifecycleGate?.timeout_policy, () => null),
      lifecycle_status: selectTruthyValue(() => lifecycleGate?.status, () => null),
      lifecycle_wait_status: selectTruthyValue(() => lifecycleGate?.wait_status, () => null),
      lifecycle_scheduler_consumed: lifecycleGate?.scheduler_consumed === true,
      lifecycle_wait_ref: selectTruthyValue(() => lifecycleGate?.wait_ref, () => null),
      gate_completion_is_pass: completionEvidence?.isPass === true,
      gate_completion_source: selectTruthyValue(() => completionEvidence?.source, () => null),
    },
    diagnostics: {},
  };
}

export function buildGateRunInput(config: any, progress: any, gateId: any, gate: any, opts: any, deps: any) {
  const runId = getRunId(config);
  const stageId = typeof opts?.stageId === 'string' && opts.stageId.trim() ? opts.stageId.trim() : null;
  const gateType = typeof gate?.type === 'string' && gate.type.trim() ? gate.type.trim() : null;
  const attempt = Number(opts?.attempt);
  validateGateRunIdentity({ runId, stageId, gateType, attempt });
  const artifacts = buildGateArtifactRefs(config, gateId, gate);
  const instructionsRef = selectTruthyValue(() => artifacts.find((artifact: any) => artifact.type === 'gate_instructions'), () => null);
  const stateSnapshot = buildGateStateSnapshot(config, progress, gateId, gate, deps);
  const refs = buildStageRefs({ runRef: { prefix: 'run', parts: [runId] }, gateRef: { prefix: 'gate', parts: [gateId] }, gateEvaluationRef: { prefix: 'gate_evaluation', parts: [runId, gateId, attempt] } });
  if (stateSnapshot?.gate?.lifecycle_wait_ref) refs.waitRef = stateSnapshot.gate.lifecycle_wait_ref;
  return {
    refs,
    ids: { runId, gateId, gateType, attempt, stageId },
    gate: { config: { ...objectRecord(gate) }, ...(instructionsRef ? { instructionsRef } : {}) },
    artifacts,
    priorResults: artifacts.filter((artifact: any) => artifact.type === 'gate_output'),
    stateSnapshot,
    executionContext: { novaPrompt: selectTruthyValue(() => opts?.novaPrompt, () => null), novaPromptProvided: Boolean(opts?.novaPrompt) },
    deadline: gate?.timeout_minutes ? { timeoutMs: Number(gate.timeout_minutes) * 60 * 1000 } : undefined,
  };
}

function validateGateRunIdentity({ runId, stageId, gateType, attempt }: any) {
  if (!runId) throw new Error('gate run input requires explicit runId');
  if (!stageId) throw new Error('gate run input requires explicit stageId');
  if (!gateType) throw new Error('gate run input requires explicit gateType');
  if (selectTruthyValue(() => !Number.isFinite(attempt), () => attempt < 1)) throw new Error('gate run input requires explicit positive attempt');
}
