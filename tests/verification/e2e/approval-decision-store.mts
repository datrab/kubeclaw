import fs from 'node:fs';
import crypto from 'node:crypto';

export function approvalDecisionPath(statePath: string, waitId: string): string {
  const identity = crypto.createHash('sha256').update(waitId).digest('hex');
  return `${statePath}.decision-${identity}.json`;
}

export function readApprovalDecisionForWait(
  statePath: string,
  waitId: string,
): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(approvalDecisionPath(statePath, waitId), 'utf8')) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
