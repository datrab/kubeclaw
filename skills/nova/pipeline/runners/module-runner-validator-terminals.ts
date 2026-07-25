import { resolveStatusGatewayLabel, resolveStatusSessionKey } from '../services/correlation.ts';
import { applyModuleRunnerCompletion } from './module-runner/completions.ts';
import { currentAttemptNumber } from './module-runner-shared.ts';
import { buildModuleBlockedTerminalResult, buildModuleErrorTerminalResult } from './module-runner/terminal-results.ts';

type AnyRecord = Record<string, any>;

export function buildModuleValidatorBlockTerminal(config: AnyRecord, moduleId: string, stageId: string, reason: string, controlResult: AnyRecord | null = null, diagnostics: AnyRecord = {}, options: AnyRecord = {}) {
  return buildModuleBlockedTerminalResult(config, moduleId, {
    reason, moduleDir: options.dir ?? null, attempt: currentAttemptNumber(options.status),
    phase: options.phase ?? stageId, gatewayLabel: resolveStatusGatewayLabel(options.status),
    sessionKey: resolveStatusSessionKey(options.status), terminalReasonCode: 'infra_error',
    metadata: { failure_class: 'infra_error', validator: stageId, validator_result: controlResult }, diagnostics,
  });
}

export function buildModuleValidatorErrorTerminal(config: AnyRecord, moduleId: string, stageId: string, reason: string, diagnostics: AnyRecord = {}, options: AnyRecord = {}) {
  return buildModuleErrorTerminalResult(config, moduleId, {
    reason, moduleDir: options.dir ?? null, attempt: currentAttemptNumber(options.status),
    phase: options.phase ?? stageId, gatewayLabel: resolveStatusGatewayLabel(options.status),
    sessionKey: resolveStatusSessionKey(options.status), terminalReasonCode: 'invalid_contract',
    metadata: { failure_class: 'invalid_contract', validator: stageId, validator_result: null }, diagnostics,
  });
}

export function persistModuleValidatorBlocked({ config, dir, status, deps, phase, reason }: AnyRecord) {
  applyModuleRunnerCompletion({
    deps, config, dir, status, moduleId: status?.module_id, phase,
    attempt: currentAttemptNumber(status), completionStatus: 'BLOCKED',
    authority: { kind: 'deterministic_check' }, reasonCode: reason, summary: reason,
    gatewayLabel: resolveStatusGatewayLabel(status), sessionKey: resolveStatusSessionKey(status),
    metadata: { fail_count: status?.fail_count ?? null },
  });
}
