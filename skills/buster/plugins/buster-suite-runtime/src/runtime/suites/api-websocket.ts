import { selectTruthyValue } from '../optional-absence.ts';
import { suiteErrorMessage as errorMessage, suiteObjectOrEmpty as objectRecordOrEmpty } from './support.ts';
import { getByPath, interpolate, interpolateObject } from './api-values.ts';
import type { AnyRecord, ApiTestResult } from './api-values.ts';
import WebSocket from 'ws';

type Log = (message: string) => void;
interface SocketState { failures: string[]; responses: any[]; start: number; settled: boolean }

function finish(resolve: (result: ApiTestResult) => void, state: SocketState): void {
  if (state.settled) return;
  state.settled = true;
  resolve({ passed: state.failures.length === 0, failures: state.failures, status: null, elapsed: Date.now() - state.start });
}

function verifyResponses(expect: AnyRecord, state: SocketState): void {
  for (const [key, expected] of Object.entries(objectRecordOrEmpty(expect.ws_response_contains))) {
    const found = state.responses.some((response) => {
      if (typeof response !== 'object' || response === null) return false;
      const actual = getByPath(response, key);
      return expected === true ? actual !== undefined : String(actual) === String(expected);
    });
    if (!found) state.failures.push(`No WS response contained "${key}": ${JSON.stringify(expected)}`);
  }
  if (expect.ws_min_messages != null && state.responses.length < expect.ws_min_messages) state.failures.push(`Expected >= ${expect.ws_min_messages} WS messages, got ${state.responses.length}`);
}

function attachHandlers(ws: any, test: AnyRecord, vars: Record<string, string>, state: SocketState, done: () => void): void {
  const expect = objectRecordOrEmpty(test.expect);
  ws.on('open', () => {
    if (expect.ws_connected === false) state.failures.push('Expected connection to fail, but it succeeded');
    for (const message of Array.isArray(test.ws_messages) ? test.ws_messages : []) {
      if (message.send) ws.send(typeof message.send === 'string' ? interpolate(message.send, vars) : JSON.stringify(interpolateObject(message.send, vars)));
    }
  });
  ws.on('message', (data: any) => {
    try { state.responses.push(JSON.parse(String(data))); }
    catch (_error) { state.responses.push(String(data)); }
  });
  ws.on('error', (error: unknown) => { if (expect.ws_connected !== false) state.failures.push(`WebSocket error: ${errorMessage(error)}`); });
  ws.on('close', () => { verifyResponses(expect, state); done(); });
}

export async function runWsTest(test: AnyRecord, baseUrl: string, vars: Record<string, string>, timeoutMs: number, log: Log): Promise<ApiTestResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const state: SocketState = { failures: [], responses: [], start, settled: false };
    let ws: any;
    try { ws = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}${interpolate(test.path, vars)}`); }
    catch (error) { finish(resolve, { ...state, failures: [`WebSocket connection failed: ${errorMessage(error)}`] }); return; }
    const done = (): void => finish(resolve, state);
    const timer = setTimeout(() => {
      state.failures.push(`WebSocket timeout after ${timeoutMs}ms`);
      try { ws.close(); } catch (error) { log(`non-blocking WebSocket timeout close failed: ${errorMessage(error)}`); }
      done();
    }, timeoutMs);
    attachHandlers(ws, test, vars, state, () => { clearTimeout(timer); done(); });
    if (objectRecordOrEmpty(test.expect).ws_connected === false) setTimeout(() => { clearTimeout(timer); try { ws.close(); } catch (error) { log(`non-blocking WebSocket expected-failure close failed: ${errorMessage(error)}`); } done(); }, 2000);
  });
}
