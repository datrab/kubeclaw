import { selectTruthyValue } from '../optional-absence.js';
import { suiteErrorMessage as errorMessage, suiteNonEmptyString as nonEmptyString, suiteObjectOrEmpty as objectRecordOrEmpty } from './support.js';
import { getByPath, interpolate, interpolateObject } from './api-values.js';
import type { AnyRecord, ApiTestResult } from './api-values.js';

async function responseBody(response: Response, expect: AnyRecord): Promise<any> {
  if (!selectTruthyValue(() => selectTruthyValue(() => expect.body_type, () => expect.body_contains), () => expect.body_min_length != null)) return null;
  try { return await response.clone().json(); }
  catch (_error) { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): a non-JSON response may still be valid text. */
    try { return await response.text(); }
    catch (_error) { return null; /* INTENTIONAL_NONCRITICAL(optional_probe_failed): unreadable optional bodies are validated as absent. */ }
  }
}

function bodyFailures(body: any, expect: AnyRecord): string[] {
  const failures: string[] = [];
  if (expect.body_type) {
    const actual = Array.isArray(body) ? 'array' : typeof body;
    if (actual !== expect.body_type) failures.push(`Expected body type "${expect.body_type}", got "${actual}"`);
  }
  if (expect.body_min_length != null && Array.isArray(body) && body.length < expect.body_min_length) {
    failures.push(`Expected array length >= ${expect.body_min_length}, got ${body.length}`);
  }
  if (!expect.body_contains || typeof body !== 'object' || body === null) return failures;
  for (const [key, expected] of Object.entries(expect.body_contains)) {
    const actual = getByPath(body, key);
    if (actual === undefined) failures.push(`Expected body to contain key "${key}"`);
    else if (expected !== true && String(actual) !== String(expected)) failures.push(`Expected body.${key} = ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  return failures;
}

function requestOptions(test: AnyRecord, defaults: AnyRecord, vars: Record<string, string>, signal: AbortSignal): RequestInit {
  const configured = nonEmptyString(test.method);
  const method = (configured === null ? 'GET' : configured).toUpperCase();
  const headers = interpolateObject({ ...objectRecordOrEmpty(defaults.headers), ...objectRecordOrEmpty(test.headers) }, vars);
  const options: RequestInit = { method, headers, signal };
  if (test.body && ['POST', 'PUT', 'PATCH'].includes(method)) options.body = JSON.stringify(interpolateObject(test.body, vars));
  return options;
}

export async function runHttpTest(test: AnyRecord, baseUrl: string, defaults: AnyRecord, vars: Record<string, string>, timeoutMs: number): Promise<ApiTestResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}${String(interpolate(test.path, vars))}`, requestOptions(test, defaults, vars, controller.signal));
    const elapsed = Date.now() - start;
    const expect = objectRecordOrEmpty(test.expect);
    const failures = await bodyFailures(await responseBody(response, expect), expect);
    if (expect.status != null && response.status !== expect.status) failures.unshift(`Expected status ${expect.status}, got ${response.status}`);
    if (expect.max_response_ms != null && elapsed > expect.max_response_ms) failures.push(`Response took ${elapsed}ms (max: ${expect.max_response_ms}ms)`);
    return { passed: failures.length === 0, failures, status: response.status, elapsed };
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? `Timeout after ${timeoutMs}ms` : errorMessage(error);
    return { passed: false, failures: [message], status: null, elapsed: Date.now() - start };
  } finally { clearTimeout(timer); }
}
