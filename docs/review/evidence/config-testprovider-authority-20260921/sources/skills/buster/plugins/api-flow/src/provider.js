import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const METHODS = new Set(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
const STEP_KEYS = new Set(['id', 'protocol', 'method', 'path', 'headers', 'body', 'messages', 'timeoutMs', 'expect', 'extract']);
const EXPECT_KEYS = new Set(['status', 'contentType', 'bodyContains', 'json', 'minimumMessages', 'messageContains']);
const FLOW_KEYS = new Set(['schemaVersion', 'variables', 'setup', 'steps', 'cleanup']);
const IDENTIFIER = /^[a-z][a-z0-9-]{0,63}$/u;
const VARIABLE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
const SELECTOR = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/u;

function object(value, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code); return value; }
function exact(value, keys, code) { const result = object(value, code); if (Object.keys(result).some((key) => !keys.has(key))) throw new Error(code); return result; }
function integer(value, fallback, minimum, maximum, code) { const result = value ?? fallback; if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new Error(code); return result; }
function map(value, code, maximum = 32) { const result = object(value ?? {}, code); if (Object.keys(result).length > maximum) throw new Error(code); return result; }
function inside(root, relative, code) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\0')) throw new Error(code);
  const candidate = path.resolve(root, relative); if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error(code);
  let real;
  try { real = fs.realpathSync(candidate); } catch { throw new Error(code); }
  try { if (!real.startsWith(`${root}${path.sep}`) || !fs.statSync(real).isFile()) throw new Error(code); }
  catch { throw new Error(code); }
  return real;
}
function endpoint(invocation, config) {
  if (invocation.inputs.some((input) => !['deployment', 'endpoint'].includes(input.name))) throw new Error('API_FLOW_INPUT_UNKNOWN');
  const inputs = invocation.inputs.filter((input) => ['deployment', 'endpoint'].includes(input.name));
  if (inputs.length > 1) throw new Error('API_FLOW_INPUT_INVALID');
  if (config.url !== undefined && inputs.length) throw new Error('API_FLOW_TARGET_AMBIGUOUS');
  if (config.url !== undefined) return String(config.url);
  if (!inputs.length || inputs[0].kind !== 'value') throw new Error('API_FLOW_TARGET_REQUIRED');
  const input = inputs[0]; const value = object(input.value, 'API_FLOW_INPUT_INVALID');
  if (input.name === 'endpoint') {
    if (input.schemaId !== 'kubeclaw.public-endpoint-fixture@1' || value.schemaVersion !== 'public-endpoint-fixture.v1'
      || typeof value.url !== 'string') throw new Error('API_FLOW_INPUT_INVALID');
    return value.url;
  }
  if (input.schemaId !== 'kubeclaw.kubernetes-deployment-fixture@1' || value.schemaVersion !== 'kubernetes-deployment-fixture.v1'
    || !Array.isArray(value.endpoints) || value.endpoints.length < 1) throw new Error('API_FLOW_INPUT_INVALID');
  const selected = config.endpointName === undefined ? (value.endpoints.length === 1 ? value.endpoints[0] : null)
    : value.endpoints.find((item) => item?.name === config.endpointName);
  if (!selected?.url) throw new Error('API_FLOW_ENDPOINT_NOT_FOUND'); return String(selected.url);
}
function readFlow(invocation, context, config) {
  const workspace = fs.realpathSync(context.workspaceRoot); const repository = path.resolve(workspace, invocation.workspace.repository);
  if (!repository.startsWith(`${workspace}${path.sep}`)) throw new Error('API_FLOW_WORKSPACE_INVALID');
  const bytes = fs.readFileSync(inside(fs.realpathSync(repository), config.flowFile, 'API_FLOW_FILE_DENIED'));
  if (bytes.byteLength > 1_048_576) throw new Error('API_FLOW_FILE_TOO_LARGE');
  let flow; try { flow = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('API_FLOW_FILE_INVALID'); }
  exact(flow, FLOW_KEYS, 'API_FLOW_FILE_INVALID'); if (flow.schemaVersion !== 'kubeclaw.api-flow.v1') throw new Error('API_FLOW_VERSION_UNSUPPORTED'); return flow;
}
function validateStep(value, seen) {
  const step = exact(value, STEP_KEYS, 'API_FLOW_STEP_INVALID');
  if (typeof step.id !== 'string' || !IDENTIFIER.test(step.id) || seen.has(step.id)) throw new Error(seen.has(step.id) ? 'API_FLOW_STEP_ID_DUPLICATE' : 'API_FLOW_STEP_ID_INVALID');
  seen.add(step.id); if (step.protocol !== undefined && step.protocol !== 'websocket') throw new Error('API_FLOW_PROTOCOL_INVALID');
  const method = String(step.method ?? 'GET').toUpperCase(); if (step.protocol === 'websocket' ? step.method !== undefined : !METHODS.has(method)) throw new Error('API_FLOW_METHOD_INVALID');
  if (typeof step.path !== 'string' || !step.path.startsWith('/') || step.path.startsWith('//') || /[\r\n#]/u.test(step.path) || step.path.length > 2048) throw new Error('API_FLOW_PATH_INVALID');
  const headers = map(step.headers, 'API_FLOW_HEADERS_INVALID');
  if (Object.entries(headers).some(([name, content]) => !/^[a-z0-9!#$%&'*+.^_`|~-]+$/iu.test(name) || typeof content !== 'string' || content.length < 1 || content.length > 4096 || /[\r\n]/u.test(content))) throw new Error('API_FLOW_HEADERS_INVALID');
  if (step.timeoutMs !== undefined) integer(step.timeoutMs, null, 1, 300_000, 'API_FLOW_TIMEOUT_INVALID');
  if (step.messages !== undefined && (!Array.isArray(step.messages) || step.messages.length > 64)) throw new Error('API_FLOW_MESSAGES_INVALID');
  const expect = exact(step.expect ?? {}, EXPECT_KEYS, 'API_FLOW_EXPECT_INVALID');
  const httpAssertions = ['status', 'contentType', 'bodyContains', 'json'];
  const websocketAssertions = ['minimumMessages', 'messageContains'];
  if (step.protocol === 'websocket') {
    if (step.method !== undefined || step.body !== undefined || step.extract !== undefined
      || httpAssertions.some((key) => expect[key] !== undefined)) throw new Error('API_FLOW_STEP_INVALID');
  } else if (step.messages !== undefined || websocketAssertions.some((key) => expect[key] !== undefined)) {
    throw new Error('API_FLOW_STEP_INVALID');
  }
  if (expect.status !== undefined && (!Number.isSafeInteger(expect.status) || expect.status < 100 || expect.status > 599)) throw new Error('API_FLOW_EXPECT_INVALID');
  for (const key of ['contentType', 'bodyContains', 'messageContains']) if (expect[key] !== undefined && typeof expect[key] !== 'string') throw new Error('API_FLOW_EXPECT_INVALID');
  if (expect.minimumMessages !== undefined) integer(expect.minimumMessages, null, 1, 64, 'API_FLOW_EXPECT_INVALID');
  for (const selector of Object.keys(map(expect.json, 'API_FLOW_EXPECT_INVALID'))) if (!SELECTOR.test(selector)) throw new Error('API_FLOW_SELECTOR_INVALID');
  for (const [name, selector] of Object.entries(map(step.extract, 'API_FLOW_EXTRACT_INVALID'))) if (!VARIABLE.test(name) || typeof selector !== 'string' || !SELECTOR.test(selector)) throw new Error('API_FLOW_EXTRACT_INVALID');
  return { ...step, method };
}
function validateFlow(flow, maximumSteps) {
  const groups = [['setup', flow.setup ?? []], ['steps', flow.steps], ['cleanup', flow.cleanup ?? []]];
  if (groups.some(([, items]) => !Array.isArray(items))) throw new Error('API_FLOW_STEPS_INVALID');
  const count = groups.reduce((sum, [, items]) => sum + items.length, 0); if (count < 1 || count > maximumSteps) throw new Error('API_FLOW_STEP_LIMIT_EXCEEDED');
  const variables = map(flow.variables, 'API_FLOW_VARIABLES_INVALID', 64);
  if (Object.entries(variables).some(([name, value]) => !VARIABLE.test(name) || !['string', 'number', 'boolean'].includes(typeof value))) throw new Error('API_FLOW_VARIABLES_INVALID');
  const seen = new Set(); return { variables: Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, String(value)])), groups: groups.map(([name, items]) => [name, items.map((step) => validateStep(step, seen))]) };
}
function interpolate(value, variables) {
  if (typeof value === 'string') return value.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/gu, (_match, name) => { if (!(name in variables)) throw new Error(`API_FLOW_VARIABLE_MISSING:${name}`); return variables[name]; });
  if (Array.isArray(value)) return value.map((item) => interpolate(item, variables));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolate(item, variables)])); return value;
}
function byPath(value, selector) { let current = value; for (const part of selector.split('.')) { if (current === null || current === undefined || !Object.prototype.hasOwnProperty.call(current, part)) return undefined; current = current[part]; } return current; }
function sameJson(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((item, index) => sameJson(item, right[index]));
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left).sort(); const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]
    && sameJson(left[key], right[key]));
}
function stepUrl(base, rawPath) { const baseUrl = new URL(base); const url = new URL(rawPath, baseUrl); if (url.origin !== baseUrl.origin) throw new Error('API_FLOW_PATH_INVALID'); return url.href; }
function failures(expect, response, websocket) {
  const result = [];
  if (websocket) {
    if ((expect.minimumMessages ?? 1) > response.messageCount) result.push('The WebSocket returned too few messages.');
    if (expect.messageContains !== undefined && !response.messages?.some((message) => String(message).includes(expect.messageContains))) result.push('No WebSocket message contained the declared text.');
    return result;
  }
  if (expect.status !== undefined && response.status !== expect.status) result.push(`Expected status ${expect.status}; received ${response.status}.`);
  if (expect.contentType !== undefined && response.headers?.['content-type'] !== expect.contentType) result.push(`Expected content type ${expect.contentType}.`);
  if (expect.bodyContains !== undefined && !response.body.includes(expect.bodyContains)) result.push('The response body did not contain the declared text.');
  if (expect.json !== undefined) { let body; try { body = JSON.parse(response.body); } catch { return [...result, 'The response body was not valid JSON.']; } for (const [selector, expected] of Object.entries(expect.json)) if (!sameJson(byPath(body, selector), expected)) result.push(`JSON value ${selector} did not match.`); }
  return result;
}
function output(invocation, records, evidenceFile, executedMainSteps) {
  const findings = records.flatMap((record) => record.failures.map((message) => ({ id: `api-flow:${invocation.testIdentity}:${record.id}:${crypto.createHash('sha256').update(message).digest('hex').slice(0, 12)}`, severity: 'high', message, rule: 'api-flow.assertion' })));
  if (executedMainSteps === 0) findings.push({ id: `api-flow:${invocation.testIdentity}:coverage`, severity: 'high',
    message: 'No main API flow step executed; setup, cleanup, and dependency skips do not prove coverage.', rule: 'api-flow.coverage' });
  const passed = records.filter((item) => item.state === 'passed').length; const skipped = records.filter((item) => item.state === 'skipped').length;
  return { schemaVersion: 'provider-result.v1', outcome: findings.length ? 'failed' : 'passed', summary: findings.length ? `${findings.length} API flow assertion(s) failed.` : `${passed} API flow step(s) passed.`, counts: { total: records.length, passed, failed: records.length - passed - skipped, skipped }, findings, metrics: [], evidenceFiles: [{ evidenceId: 'api-flow-report', type: 'test-report', file: evidenceFile, mediaType: 'application/vnd.kubeclaw.api-flow+json' }], reports: [], outputs: [], exitCode: null, signal: null, providerDetails: { schemaId: 'kubeclaw.api-flow-details.v1', schemaDigest: `sha256:${crypto.createHash('sha256').update('kubeclaw.api-flow-details.v1').digest('hex')}`, values: { steps: records.map(({ id, state, status, durationMs }) => ({ id, state, status, durationMs })) } } };
}
export function provider() { return { async execute(invocation, context) {
  const config = object(invocation.configuration.values, 'API_FLOW_CONFIG_INVALID'); const flow = validateFlow(readFlow(invocation, context, config), integer(config.maximumSteps, 64, 1, 256, 'API_FLOW_STEP_LIMIT_INVALID'));
  const base = endpoint(invocation, config); const records = []; let executedMainSteps = 0;
  const execution = { failed: false, error: undefined };
  async function invoke(request) {
    try { return await context.invoke('network.http', request); }
    catch (error) { if (!execution.failed) { execution.failed = true; execution.error = error; } throw error; }
  }
  const steps = flow.groups.flatMap(([group, items]) => items.map((step) => ({ group, step })));
  for (const { group, step } of steps) {
    context.signal.throwIfAborted();
    if (execution.failed && group !== 'cleanup') continue;
    const started = Date.now(); let response;
    try {
      const url = stepUrl(base, String(interpolate(step.path, flow.variables))); const timeoutMs = Math.min(integer(step.timeoutMs, config.requestTimeoutMs ?? 10_000, 1, 300_000, 'API_FLOW_TIMEOUT_INVALID'), invocation.timeoutMs); const maximumResponseBytes = integer(config.maximumResponseBytes, 1_048_576, 1, 16_777_216, 'API_FLOW_RESPONSE_LIMIT_INVALID');
      if (step.protocol === 'websocket') response = await invoke({ operation: 'websocket', resource: { type: 'network.url', canonicalId: url }, payload: { headers: interpolate(step.headers ?? {}, flow.variables), messages: interpolate(step.messages ?? [], flow.variables).map((item) => typeof item === 'string' ? item : JSON.stringify(item)), minimumMessages: step.expect?.minimumMessages ?? 1, timeoutMs, maximumResponseBytes } });
      else response = await invoke({ operation: 'request', resource: { type: 'network.url', canonicalId: url }, payload: { method: step.method, headers: interpolate(step.headers ?? {}, flow.variables), body: step.body === undefined ? undefined : JSON.stringify(interpolate(step.body, flow.variables)), responseHeaders: ['content-type'], timeoutMs, maximumResponseBytes } });
      context.signal.throwIfAborted();
      if (group === 'steps') executedMainSteps += 1;
      const stepFailures = failures(step.expect ?? {}, response, step.protocol === 'websocket');
      if (!stepFailures.length && step.extract) { let body; try { body = JSON.parse(response.body); } catch { stepFailures.push('The response body was not valid JSON for extraction.'); } if (body !== undefined) for (const [name, selector] of Object.entries(step.extract)) { const value = byPath(body, selector); if (value === undefined) stepFailures.push(`Extraction ${name} did not find ${selector}.`); else flow.variables[name] = String(value); } }
      records.push({ id: step.id, state: stepFailures.length ? 'failed' : 'passed', status: response.status ?? null, durationMs: Date.now() - started, failures: stepFailures });
    } catch (error) { context.signal.throwIfAborted(); if (execution.failed) continue; const message = error instanceof Error ? error.message : String(error); if (group === 'steps' && message.startsWith('API_FLOW_VARIABLE_MISSING:')) records.push({ id: step.id, state: 'skipped', status: null, durationMs: Date.now() - started, failures: [] }); else records.push({ id: step.id, state: 'failed', status: null, durationMs: Date.now() - started, failures: [message] }); }
  }
  context.signal.throwIfAborted();
  if (execution.failed) throw execution.error;
  const evidenceFile = 'api-flow-result.json'; fs.writeFileSync(path.join(path.resolve(context.workspaceRoot, invocation.workspace.evidence), evidenceFile), `${JSON.stringify({ schemaVersion: 'kubeclaw.api-flow-evidence.v1', records }, null, 2)}\n`); return output(invocation, records, evidenceFile, executedMainSteps);
} }; }
