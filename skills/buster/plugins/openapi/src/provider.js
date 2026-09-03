import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const METHODS = ['delete', 'get', 'head', 'options', 'patch', 'post', 'put'];
function object(value, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code); return value; }
function inside(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\0')) throw new Error('OPENAPI_FILE_DENIED');
  const candidate = path.resolve(root, relative); if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error('OPENAPI_FILE_DENIED');
  let real;
  try { real = fs.realpathSync(candidate); } catch { throw new Error('OPENAPI_FILE_DENIED'); }
  try { if (!real.startsWith(`${root}${path.sep}`) || !fs.statSync(real).isFile()) throw new Error('OPENAPI_FILE_DENIED'); }
  catch { throw new Error('OPENAPI_FILE_DENIED'); }
  return real;
}
function endpoint(invocation, config) {
  if (invocation.inputs.some((input) => !['deployment', 'endpoint'].includes(input.name))) throw new Error('OPENAPI_INPUT_UNKNOWN');
  if (config.url !== undefined && invocation.inputs.length) throw new Error('OPENAPI_TARGET_AMBIGUOUS');
  if (config.url !== undefined) return config.url;
  if (invocation.inputs.length !== 1 || invocation.inputs[0].kind !== 'value') throw new Error('OPENAPI_TARGET_REQUIRED');
  const input = invocation.inputs[0]; const value = object(input.value, 'OPENAPI_INPUT_INVALID');
  if (input.name === 'endpoint') {
    if (input.schemaId !== 'kubeclaw.public-endpoint-fixture@1' || value.schemaVersion !== 'public-endpoint-fixture.v1'
      || typeof value.url !== 'string') throw new Error('OPENAPI_INPUT_INVALID');
    return value.url;
  }
  if (input.name !== 'deployment' || input.schemaId !== 'kubeclaw.kubernetes-deployment-fixture@1'
    || value.schemaVersion !== 'kubernetes-deployment-fixture.v1' || !Array.isArray(value.endpoints)) throw new Error('OPENAPI_INPUT_INVALID');
  const selected = config.endpointName === undefined ? (value.endpoints.length === 1 ? value.endpoints[0] : null)
    : value.endpoints.find((item) => item?.name === config.endpointName);
  if (!selected?.url) throw new Error('OPENAPI_ENDPOINT_NOT_FOUND'); return selected.url;
}
function decodePointer(value) { return value.replace(/~1/gu, '/').replace(/~0/gu, '~'); }
function resolveSchema(spec, schema, seen = new Set(), depth = 0) {
  if (!schema?.$ref) return schema;
  if (depth > 64) throw new Error('OPENAPI_SCHEMA_DEPTH_EXCEEDED');
  if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/')) throw new Error('OPENAPI_EXTERNAL_REF_DENIED');
  if (seen.has(schema.$ref)) throw new Error('OPENAPI_SCHEMA_REF_CYCLE'); seen.add(schema.$ref);
  let found = spec; for (const part of schema.$ref.slice(2).split('/').map(decodePointer)) {
    if (!found || typeof found !== 'object' || !Object.prototype.hasOwnProperty.call(found, part)) throw new Error('OPENAPI_SCHEMA_REF_MISSING');
    found = found[part];
  }
  return resolveSchema(spec, found, seen, depth + 1);
}
function same(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((item, index) => same(item, right[index]));
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left).sort(); const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]
    && same(left[key], right[key]));
}
function safePattern(source) {
  if (typeof source !== 'string' || source.length > 256 || /[()|]/u.test(source)
    || /\\(?:[1-9]|k<)/u.test(source)) throw new Error('OPENAPI_SCHEMA_PATTERN_UNSAFE');
  const unbounded = source.match(/(?<!\\)[*+]/gu)?.length ?? 0;
  if (unbounded > 1) throw new Error('OPENAPI_SCHEMA_PATTERN_UNSAFE');
  for (const match of source.matchAll(/(?<!\\)\{(\d+)(?:,(\d*))?\}/gu)) {
    const minimum = Number(match[1]); const maximum = match[2] === undefined ? minimum : (match[2] ? Number(match[2]) : Infinity);
    if (minimum > 1024 || maximum > 1024) throw new Error('OPENAPI_SCHEMA_PATTERN_UNSAFE');
  }
  try { return new RegExp(source, 'u'); } catch { throw new Error('OPENAPI_SCHEMA_PATTERN_INVALID'); }
}
function schemaFailures(value, rawSchema, label, spec, depth = 0) {
  if (rawSchema === undefined || rawSchema === null || rawSchema === true) return [];
  if (rawSchema === false) return [`${label} is denied by the schema.`];
  if (depth > 64) throw new Error('OPENAPI_SCHEMA_DEPTH_EXCEEDED');
  const schema = resolveSchema(spec, rawSchema);
  if (schema === true) return []; if (schema === false) return [`${label} is denied by the schema.`];
  const failures = [];
  if (schema.nullable === true && value === null) return [];
  if (schema.const !== undefined && !same(value, schema.const)) failures.push(`${label} must equal the declared constant.`);
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => same(value, item))) failures.push(`${label} is not in the declared enum.`);
  if (Array.isArray(schema.allOf)) for (const child of schema.allOf) failures.push(...schemaFailures(value, child, label, spec, depth + 1));
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((child) => schemaFailures(value, child, label, spec, depth + 1).length === 0)) failures.push(`${label} does not match any allowed schema.`);
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((child) => schemaFailures(value, child, label, spec, depth + 1).length === 0).length !== 1) failures.push(`${label} must match exactly one allowed schema.`);
  if (schema.not && schemaFailures(value, schema.not, label, spec, depth + 1).length === 0) failures.push(`${label} matches a denied schema.`);
  const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : Number.isInteger(value) ? 'integer' : typeof value;
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length && !types.includes(actual) && !(actual === 'integer' && types.includes('number'))) return [...failures, `${label} must have type ${types.join(' or ')}.`];
  if (typeof value === 'string') {
    if (Number.isSafeInteger(schema.minLength) && value.length < schema.minLength) failures.push(`${label} is shorter than allowed.`);
    if (Number.isSafeInteger(schema.maxLength) && value.length > schema.maxLength) failures.push(`${label} is longer than allowed.`);
    if (typeof schema.pattern === 'string' && !safePattern(schema.pattern).test(value)) failures.push(`${label} does not match the declared pattern.`);
    if (schema.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) failures.push(`${label} is not a UUID.`);
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) failures.push(`${label} is not a date-time.`);
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) failures.push(`${label} is below the minimum.`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) failures.push(`${label} is above the maximum.`);
    if (spec.openapi?.startsWith('3.0.') && schema.exclusiveMinimum === true
      && typeof schema.minimum === 'number' && value <= schema.minimum) failures.push(`${label} must exceed the minimum.`);
    if (spec.openapi?.startsWith('3.0.') && schema.exclusiveMaximum === true
      && typeof schema.maximum === 'number' && value >= schema.maximum) failures.push(`${label} must be below the maximum.`);
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) failures.push(`${label} must exceed the minimum.`);
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) failures.push(`${label} must be below the maximum.`);
  }
  if (Array.isArray(value)) {
    if (Number.isSafeInteger(schema.minItems) && value.length < schema.minItems) failures.push(`${label} has too few items.`);
    if (Number.isSafeInteger(schema.maxItems) && value.length > schema.maxItems) failures.push(`${label} has too many items.`);
    if (schema.uniqueItems && value.some((item, index) => value.slice(0, index).some((prior) => same(item, prior)))) {
      failures.push(`${label} has duplicate items.`);
    }
    if (schema.items) value.forEach((item, index) => failures.push(...schemaFailures(item, schema.items, `${label}[${index}]`, spec, depth + 1)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const propertyCount = Object.keys(value).length;
    if (Number.isSafeInteger(schema.minProperties) && propertyCount < schema.minProperties) failures.push(`${label} has too few properties.`);
    if (Number.isSafeInteger(schema.maxProperties) && propertyCount > schema.maxProperties) failures.push(`${label} has too many properties.`);
    if (Array.isArray(schema.required)) for (const key of schema.required) if (!Object.prototype.hasOwnProperty.call(value, key)) failures.push(`${label}.${key} is required.`);
    if (schema.properties) for (const [key, child] of Object.entries(schema.properties)) if (Object.prototype.hasOwnProperty.call(value, key)) failures.push(...schemaFailures(value[key], child, `${label}.${key}`, spec, depth + 1));
    const additionalKeys = Object.keys(value).filter((key) => !Object.prototype.hasOwnProperty.call(schema.properties ?? {}, key));
    if (schema.additionalProperties === false) for (const key of additionalKeys) failures.push(`${label}.${key} is not allowed.`);
    else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const key of additionalKeys) failures.push(...schemaFailures(value[key], schema.additionalProperties,
        `${label}.${key}`, spec, depth + 1));
    }
  }
  return failures;
}
function responseMedia(content, contentType) {
  if (!content || typeof content !== 'object' || typeof contentType !== 'string') return undefined;
  if (Object.prototype.hasOwnProperty.call(content, contentType)) return content[contentType];
  const slash = contentType.indexOf('/');
  const range = slash > 0 ? `${contentType.slice(0, slash)}/*` : null;
  if (range && Object.prototype.hasOwnProperty.call(content, range)) return content[range];
  return Object.prototype.hasOwnProperty.call(content, '*/*') ? content['*/*'] : undefined;
}
function deserializeWireValue(value, rawSchema, spec) {
  const schema = resolveSchema(spec, rawSchema); const types = Array.isArray(schema?.type) ? schema.type : [schema?.type];
  if (types.includes('integer') && /^-?\d+$/u.test(value)) return Number(value);
  if (types.includes('number') && /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) return Number(value);
  if (types.includes('boolean') && /^(?:true|false)$/u.test(value)) return value === 'true';
  return value;
}
function operations(spec) {
  const found = new Map(); for (const [route, pathItem] of Object.entries(object(spec.paths, 'OPENAPI_PATHS_INVALID'))) {
    if (!route.startsWith('/') || route.startsWith('//') || /[?#\r\n]/u.test(route)) throw new Error('OPENAPI_PATH_INVALID');
    const resolvedPathItem = resolveSchema(spec, pathItem);
    for (const method of METHODS) { const operation = resolvedPathItem?.[method]; if (!operation) continue;
      if (typeof operation.operationId !== 'string' || found.has(operation.operationId)) throw new Error('OPENAPI_OPERATION_ID_INVALID');
      const parameters = new Map();
      for (const raw of [...(resolvedPathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
        const parameter = resolveSchema(spec, raw); const location = String(parameter.in); const name = String(parameter.name);
        parameters.set(`${location}\0${location === 'header' ? name.toLowerCase() : name}`, raw);
      }
      found.set(operation.operationId, { route, method, operation, parameters: [...parameters.values()] }); }
  } return found;
}
function validateParameters(found, selected, spec) {
  const failures = []; const supplied = { path: selected.pathParameters ?? {}, query: selected.query ?? {}, header: selected.headers ?? {} };
  const declared = { path: new Set(), query: new Set(), header: new Set() };
  for (const raw of found.parameters) {
    const parameter = resolveSchema(spec, raw);
    if (parameter.in === 'cookie' && parameter.required === true) {
      failures.push(`cookie parameter ${String(parameter.name)} is required but cookie parameters are unsupported.`);
    }
    if (!['path', 'query', 'header'].includes(parameter.in)) continue;
    declared[parameter.in].add(parameter.in === 'header' ? String(parameter.name).toLowerCase() : String(parameter.name));
  }
  for (const [location, values] of Object.entries(supplied)) for (const name of Object.keys(values)) {
    const canonical = location === 'header' ? name.toLowerCase() : name;
    if (!declared[location].has(canonical)) failures.push(`${location} parameter ${name} is not declared.`);
  }
  for (const raw of found.parameters) { const parameter = resolveSchema(spec, raw); const location = parameter.in; if (!['path', 'query', 'header'].includes(location)) continue;
    const values = supplied[location]; const key = location === 'header' ? Object.keys(values).find((name) => name.toLowerCase() === String(parameter.name).toLowerCase()) : parameter.name;
    const present = key !== undefined && Object.prototype.hasOwnProperty.call(values, key);
    if (parameter.required && !present) failures.push(`${location} parameter ${parameter.name} is required.`);
    if (parameter.content !== undefined) {
      failures.push(`${location} parameter ${parameter.name} uses unsupported content serialization.`); continue;
    }
    if (present) failures.push(...schemaFailures(location === 'header'
      ? deserializeWireValue(values[key], parameter.schema, spec) : values[key], parameter.schema,
    `${location}.${parameter.name}`, spec));
  } return failures;
}
function responseRule(spec, operation, status) {
  const range = `${Math.floor(Number(status) / 100)}XX`;
  const rule = operation.responses?.[String(status)] ?? operation.responses?.[range] ?? operation.responses?.default ?? null;
  return rule === null ? null : resolveSchema(spec, rule);
}
function output(invocation, records, evidenceFile) {
  const findings = records.flatMap((record) => record.failures.map((message) => ({ id: `openapi:${invocation.testIdentity}:${record.operationId}:${crypto.createHash('sha256').update(message).digest('hex').slice(0, 12)}`, severity: 'high', message, rule: 'openapi.runtime' })));
  const passed = records.filter((item) => !item.failures.length).length;
  return { schemaVersion: 'provider-result.v1', outcome: findings.length ? 'failed' : 'passed', summary: findings.length ? `${findings.length} OpenAPI runtime check(s) failed.` : `${passed} OpenAPI operation(s) passed.`, counts: { total: records.length, passed, failed: records.length - passed, skipped: 0 }, findings, metrics: [], evidenceFiles: [{ evidenceId: 'openapi-report', type: 'test-report', file: evidenceFile, mediaType: 'application/vnd.kubeclaw.openapi-runtime+json' }], reports: [], outputs: [], exitCode: null, signal: null, providerDetails: { schemaId: 'kubeclaw.openapi-details.v1', schemaDigest: `sha256:${crypto.createHash('sha256').update('kubeclaw.openapi-details.v1').digest('hex')}`, values: { operations: records.map(({ operationId, status, durationMs }) => ({ operationId, status, durationMs })) } } };
}
export function provider() { return { async execute(invocation, context) {
  const config = object(invocation.configuration.values, 'OPENAPI_CONFIG_INVALID'); const workspace = fs.realpathSync(context.workspaceRoot);
  const repositoryPath = path.resolve(workspace, invocation.workspace.repository); if (!repositoryPath.startsWith(`${workspace}${path.sep}`)) throw new Error('OPENAPI_WORKSPACE_INVALID');
  const bytes = fs.readFileSync(inside(fs.realpathSync(repositoryPath), config.specFile)); if (bytes.byteLength > 4_194_304) throw new Error('OPENAPI_FILE_TOO_LARGE');
  let spec; try { spec = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('OPENAPI_FILE_INVALID'); }
  if (typeof spec?.openapi !== 'string' || !spec.openapi.startsWith('3.')) throw new Error('OPENAPI_VERSION_UNSUPPORTED');
  const catalog = operations(spec); const explicit = Array.isArray(config.operations) ? config.operations : []; const tags = new Set(config.tags ?? []);
  const explicitIds = new Set(explicit.map((item) => item.operationId));
  const tagged = [...catalog.entries()].filter(([operationId, found]) => !explicitIds.has(operationId)
    && (found.operation.tags ?? []).some((tag) => tags.has(tag))).map(([operationId]) => ({ operationId }));
  const selections = [...explicit, ...tagged]
    .sort((left, right) => Number(Boolean(left.cleanup)) - Number(Boolean(right.cleanup)));
  if (!selections.length) throw new Error('OPENAPI_SELECTION_EMPTY'); if (selections.length > 128) throw new Error('OPENAPI_SELECTION_LIMIT_EXCEEDED');
  const base = endpoint(invocation, config); const records = [];
  for (const selected of selections) {
    const started = Date.now(); const failures = []; let response = { status: null, body: '', headers: {} };
    try {
    const found = catalog.get(selected.operationId); if (!found) throw new Error(`OPENAPI_OPERATION_NOT_FOUND:${selected.operationId}`);
    let route = found.route; for (const [name, value] of Object.entries(selected.pathParameters ?? {})) route = route.replace(`{${name}}`, encodeURIComponent(String(value)));
    if (/\{[^}]+\}/u.test(route)) throw new Error(`OPENAPI_PATH_PARAMETER_MISSING:${selected.operationId}`);
    const baseUrl = new URL(base); const url = new URL(route, `${base}/`);
    if (url.origin !== baseUrl.origin) throw new Error('OPENAPI_PATH_INVALID');
    for (const [name, value] of Object.entries(selected.query ?? {})) url.searchParams.set(name, String(value));
    const requestBody = found.operation.requestBody ? resolveSchema(spec, found.operation.requestBody) : null;
    const requestMedia = requestBody?.content?.['application/json'];
    const requestSchema = resolveSchema(spec, requestMedia?.schema);
    failures.push(...validateParameters(found, selected, spec));
    if (selected.body !== undefined && Object.keys(selected.headers ?? {}).some((name) => name.toLowerCase() === 'content-type')) {
      failures.push('The content-type request header is provider-controlled.');
    }
    if (selected.body !== undefined && requestMedia === undefined) failures.push('A JSON request body is not declared.');
    else if (selected.body !== undefined && requestSchema !== undefined) failures.push(...schemaFailures(selected.body, requestSchema, 'request', spec));
    else if (selected.body === undefined && requestBody?.required === true) failures.push('A request body is required.');
    if (!failures.length) try {
      const responseRules = Object.values(found.operation.responses ?? {}).map((entry) => resolveSchema(spec, entry));
      const responseHeaders = [...new Set(responseRules.flatMap((entry) => Object.keys(entry?.headers ?? {}))
        .map((name) => name.toLowerCase()))];
      const acceptedTypes = [...new Set(responseRules.flatMap((entry) => Object.keys(entry?.content ?? {})))];
      response = await context.invoke('network.http', { operation: 'request', resource: { type: 'network.url', canonicalId: url.href }, payload: { method: found.method.toUpperCase(), headers: { ...(selected.headers ?? {}), ...(acceptedTypes.length ? { accept: acceptedTypes.join(', ') } : {}), ...(selected.body === undefined ? {} : { 'content-type': 'application/json' }) }, responseHeaders, body: selected.body === undefined ? undefined : JSON.stringify(selected.body), timeoutMs: Math.min(config.requestTimeoutMs ?? 10_000, invocation.timeoutMs), maximumResponseBytes: config.maximumResponseBytes ?? 1_048_576 } });
      const rule = responseRule(spec, found.operation, response.status); if (!rule) failures.push(`Status ${response.status} is not documented.`);
      if (selected.expectedStatuses && !selected.expectedStatuses.includes(response.status)) failures.push(`Status ${response.status} is not expected.`);
      const contentType = response.headers?.['content-type']; const media = responseMedia(rule?.content, contentType);
      const declared = resolveSchema(spec, media?.schema);
      if (rule?.content && media === undefined) failures.push(`Content type ${String(contentType)} is not documented.`);
      if (declared !== undefined) {
        let body = response.body;
        if (typeof contentType === 'string' && contentType.toLowerCase().includes('json')) {
          try { body = JSON.parse(response.body); } catch { failures.push('The response body was not valid JSON.'); body = undefined; }
        }
        if (body !== undefined) failures.push(...schemaFailures(body, declared, 'response', spec));
      }
      for (const [name, rawHeader] of Object.entries(rule?.headers ?? {})) {
        const header = resolveSchema(spec, rawHeader); const value = response.headers?.[name.toLowerCase()];
        if (header.required && !value) failures.push(`Required response header ${name} is missing.`);
        if (value !== null && value !== undefined && header.schema !== undefined) failures.push(...schemaFailures(
          deserializeWireValue(value, header.schema, spec), header.schema, `response header ${name}`, spec));
      }
    } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    records.push({ operationId: selected.operationId, status: response.status, durationMs: Date.now() - started, failures });
  }
  const evidenceFile = 'openapi-runtime-result.json'; fs.writeFileSync(path.join(path.resolve(workspace, invocation.workspace.evidence), evidenceFile), `${JSON.stringify({ schemaVersion: 'kubeclaw.openapi-runtime-evidence.v1', records }, null, 2)}\n`); return output(invocation, records, evidenceFile);
} }; }
