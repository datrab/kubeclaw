import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import {
  APPROVAL_SIGNAL_TYPE,
  calculateApprovalExpiresAt,
  parseApprovalConfig,
  parseApprovalGuidance,
  parseApprovalInput,
  pendingApprovalResult,
  resultForApprovalGuidance,
  validateCreatedWait,
} from './approval.js';

export async function execute(
  rawInput: unknown,
  context: PluginInvocationContext,
): Promise<StageResult> {
  const input = parseApprovalInput(rawInput);
  const config = parseApprovalConfig(context.contract.config);
  const guidance = parseApprovalGuidance(context.contract.guidance, config.issuerId);
  if (guidance.decision !== 'pending') return resultForApprovalGuidance(guidance);

  const attempt = context.contract.lease.attempt;
  const approvalId = `approval:${attempt.runId}:${attempt.stageId}`;
  const expiresAt = calculateApprovalExpiresAt(new Date(), config.timeoutMinutes);
  await context.invoke('operator.request', {
    operation: 'publish',
    resource: { type: 'operator.target', canonicalId: config.target },
    payload: {
      type: 'approval.requested',
      approvalId,
      summary: input.summary,
      signalType: APPROVAL_SIGNAL_TYPE,
      authorizedIssuer: { type: 'operator', id: config.issuerId },
      expiresAt,
    },
  });
  const response = await context.invoke('signal.wait', {
    operation: 'create',
    resource: { type: 'signal.wait', canonicalId: approvalId },
    payload: {
      kind: 'signal',
      signalType: APPROVAL_SIGNAL_TYPE,
      authorizedIssuer: { type: 'operator', id: config.issuerId },
      expiresAt,
      request: { summary: input.summary },
    },
  });
  return pendingApprovalResult(validateCreatedWait(response, {
    issuerId: config.issuerId,
    expiresAt,
    summary: input.summary,
  }));
}
