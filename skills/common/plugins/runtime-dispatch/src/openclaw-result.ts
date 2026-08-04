import crypto from 'node:crypto';
import path from 'node:path';
import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';
import type { OpenClawTarget, RuntimeSessionEvidence } from './openclaw.ts';

type JsonRecord = Record<string, unknown>;
function record(value: unknown): value is JsonRecord { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function requiredText(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`OPENCLAW_${label}_INVALID`); return value.trim(); }

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed, trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')];
  const first = trimmed.indexOf('{'); const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch {
      // INTENTIONAL_NONCRITICAL(result_candidate_invalid): Continue through bounded representations.
    }
  }
  throw new Error('OPENCLAW_SESSION_OUTPUT_NOT_JSON');
}

export function attachRuntimeEvidence(payload: JsonRecord, result: unknown, session: RuntimeSessionEvidence): unknown {
  if (!record(result)) return result;
  const protocol = String(payload.protocol ?? '');
  if (protocol === 'kubeclaw.implementation.v2') return { ...result, session: { ...session, handoffs: 0 } };
  if (protocol === 'kubeclaw.buster-test-judgment.v2') return { ...result, session };
  return result;
}

async function remoteResult(context: AdapterActivationContext, target: OpenClawTarget, relative: string): Promise<JsonRecord> {
  const secret = await context.invokeConfidential('secrets.read', { operation: 'resolve', resource: { type: 'secret.name', canonicalId: target.resultTokenSecret! }, payload: {} });
  const endpoint = new URL(target.resultEndpoint!);
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/u, '')}/${path.basename(relative)}`;
  const response = await context.invokeConfidential('network.http', { operation: 'request', resource: { type: 'network.url', canonicalId: endpoint.href }, payload: { method: 'GET', headers: { authorization: `Bearer ${requiredText(secret.value, 'RESULT_TOKEN')}` } } });
  if (!record(response) || response.status !== 200 || !record(response.body)) throw new Error('OPENCLAW_REMOTE_RESULT_READ_FAILED');
  return response.body;
}

export async function readOpenClawResult(context: AdapterActivationContext, target: OpenClawTarget, payload: JsonRecord, relative: string, key: string, startedAt: string, state: string): Promise<Readonly<{ result: unknown }>> {
  const durable = target.resultEndpoint && target.resultTokenSecret
    ? await remoteResult(context, target, relative)
    : await context.invokeConfidential('git.repository.read', { operation: 'read_text', resource: { type: 'git.repository.path', canonicalId: relative.split(path.sep).join('/') }, payload: {} });
  const content = requiredText(durable.content, 'RESULT_FILE');
  const session: RuntimeSessionEvidence = {
    sessionId: key, startedAt, completedAt: new Date().toISOString(),
    transcriptDigest: crypto.createHash('sha256').update(content).digest('hex'),
    termination: ['failed', 'error'].includes(state) ? 'blocked' : 'completed',
  };
  return Object.freeze({ result: attachRuntimeEvidence(payload, parseJsonText(content), session) });
}
