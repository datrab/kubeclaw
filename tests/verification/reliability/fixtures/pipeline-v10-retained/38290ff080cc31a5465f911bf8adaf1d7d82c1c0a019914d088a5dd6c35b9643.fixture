import crypto from 'node:crypto';
import path from 'node:path';
import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';
import type { OpenClawTarget, RuntimeSessionEvidence } from './openclaw.ts';
import type { OpenClawSessionState } from './openclaw-session.ts';
import { gateway } from './openclaw-session.ts';
import { openClawToolDetails } from './openclaw-response.ts';
import { persistResult, readResult } from './result-persistence.ts';

type JsonRecord = Record<string, unknown>;
function record(value: unknown): value is JsonRecord { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function requiredText(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`OPENCLAW_${label}_INVALID`); return value.trim(); }

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed, trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')];
  const first = trimmed.indexOf('{'); const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
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

interface OpenClawResultRequest {
  readonly payload: JsonRecord; readonly relative: string; readonly key: string;
  readonly startedAt: string; readonly state: OpenClawSessionState; readonly token: string;
}

function terminalAssistantText(value: unknown): string {
  const details = openClawToolDetails(value);
  if (!record(details) || !Array.isArray(details.messages)) throw new Error('OPENCLAW_SESSION_HISTORY_INVALID');
  const candidates = details.messages.filter((message) => record(message) && message.role === 'assistant'
    && record(message.__openclaw) && message.__openclaw.runTerminal === true);
  if (candidates.length !== 1) throw new Error('OPENCLAW_SESSION_TERMINAL_OUTPUT_AMBIGUOUS');
  const content = candidates[0]?.content;
  if (!Array.isArray(content)) throw new Error('OPENCLAW_SESSION_OUTPUT_NOT_JSON');
  const texts = content.filter((item) => record(item) && item.type === 'text' && typeof item.text === 'string')
    .map((item) => String(item.text));
  if (texts.length !== 1) throw new Error('OPENCLAW_SESSION_OUTPUT_NOT_JSON');
  return requiredText(texts[0], 'SESSION_OUTPUT');
}


async function localResult(context: AdapterActivationContext, target: OpenClawTarget,
  relative: string, key: string, token: string, state: OpenClawSessionState): Promise<JsonRecord> {
  if (target.workspaceReference) {
    const content = readResult(target.cwd, relative);
    if (content !== undefined) {
      parseJsonText(content);
      // Preserve the established repository result record before Git cleanup.
      persistResult(target.repositoryRoot, relative, content);
      return { content };
    }
  }
  try {
    return await context.invokeConfidential('git.repository.read', { operation: 'read_text',
      resource: { type: 'git.repository.path', canonicalId: relative.split(path.sep).join('/') }, payload: {} }) as JsonRecord;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('REPOSITORY_FILE_NOT_FOUND')) throw error;
    if (state.structured !== undefined) {
      const content = JSON.stringify(state.structured);
      if (typeof content !== 'string') throw new Error('OPENCLAW_COLLECTOR_STRUCTURED_RESULT_INVALID');
      persistResult(target.repositoryRoot, relative, content);
      return { content };
    }
    if (typeof state.result === 'string' && state.result.trim()) {
      const content = requiredText(state.result, 'COLLECTOR_RESULT');
      parseJsonText(content);
      persistResult(target.repositoryRoot, relative, content);
      return { content };
    }
    if (state.schemaError) throw new Error(`OPENCLAW_COLLECTOR_SCHEMA_INVALID:${state.schemaError}`);
    if (state.error) throw new Error(`OPENCLAW_COLLECTOR_FAILED:${state.error}`);
    const history = await gateway(context, target, token, 'sessions_history',
      { sessionKey: key, limit: 1, includeTools: false });
    const content = terminalAssistantText(history);
    parseJsonText(content);
    persistResult(target.repositoryRoot, relative, content);
    return { content };
  }
}

export async function readOpenClawResult(
  context: AdapterActivationContext, target: OpenClawTarget, request: OpenClawResultRequest,
): Promise<Readonly<{ result: unknown; outputText: string }>> {
  const { payload, relative, key, startedAt, state, token } = request;
  const durable = target.resultEndpoint && target.resultTokenSecret
    ? await remoteResult(context, target, relative)
    : await localResult(context, target, relative, key, token, state);
  const content = requiredText(durable.content, 'RESULT_FILE');
  const session: RuntimeSessionEvidence = {
    sessionId: key, startedAt, completedAt: new Date().toISOString(),
    transcriptDigest: crypto.createHash('sha256').update(content).digest('hex'),
    termination: ['failed', 'error'].includes(state.state) ? 'blocked' : 'completed',
  };
  return Object.freeze({ result: attachRuntimeEvidence(payload, parseJsonText(content), session), outputText: content });
}
