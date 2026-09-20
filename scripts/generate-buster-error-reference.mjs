#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'docs/site/reference/buster-error-codes.md');
const revision = '3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f';
const codePattern = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?:$|:)/u;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : walk(absolute);
    if (!/\.(?:js|ts)$/u.test(entry.name) || entry.name.endsWith('.d.ts')) return [];
    return [path.relative(root, absolute).split(path.sep).join('/')];
  });
}

const productionFiles = [...new Set([
  ...walk(path.join(root, 'skills/buster/engine')),
  ...walk(path.join(root, 'skills/buster/plugins')).filter((file) => file.includes('/src/')),
])].sort();

function stableCode(message) {
  const match = String(message).match(codePattern);
  return match ? match[0].replace(/:$/u, '') : null;
}

function valuesFor(expression, constants, parameters) {
  if (!expression) return new Set();
  if (ts.isStringLiteralLike(expression)) return new Set([expression.text]);
  if (ts.isParenthesizedExpression(expression)) return valuesFor(expression.expression, constants, parameters);
  if (ts.isIdentifier(expression)) return new Set([...(constants.get(expression.text) ?? []),
    ...(parameters.get(expression.text) ?? [])]);
  if (ts.isConditionalExpression(expression)) return new Set([
    ...valuesFor(expression.whenTrue, constants, parameters),
    ...valuesFor(expression.whenFalse, constants, parameters),
  ]);
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = valuesFor(expression.left, constants, parameters);
    const right = valuesFor(expression.right, constants, parameters);
    return new Set([...left].flatMap((a) => [...right].map((b) => `${a}${b}`)));
  }
  if (ts.isTemplateExpression(expression)) {
    let values = new Set([expression.head.text]);
    for (const span of expression.templateSpans) {
      const substitutions = valuesFor(span.expression, constants, parameters);
      if (!substitutions.size) {
        // Text after a colon is diagnostic detail, not part of the stable code.
        if ([...values].every((value) => stableCode(value))) return values;
        return new Set();
      }
      values = new Set([...values].flatMap((value) => [...substitutions]
        .map((substitution) => `${value}${substitution}${span.literal.text}`)));
    }
    return values;
  }
  return new Set();
}

function addValues(targetMap, name, values) {
  const targetSet = targetMap.get(name) ?? new Set();
  const size = targetSet.size;
  for (const value of values) targetSet.add(value);
  targetMap.set(name, targetSet);
  return targetSet.size !== size;
}

function analyse(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const kind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const constants = new Map();
  const functions = new Map();
  const calls = [];
  const visitChildren = (node) => {
    const result = [];
    node.forEachChild((child) => { result.push(child); });
    return result;
  };
  const nameOf = (node) => ts.isFunctionDeclaration(node) && node.name ? node.name.text : null;

  const collect = (node, owner = null) => {
    const declared = nameOf(node);
    const nextOwner = declared ?? owner;
    if (declared) functions.set(declared, {
      names: node.parameters.map((parameter) => ts.isIdentifier(parameter.name) ? parameter.name.text : null),
      values: node.parameters.map(() => new Set()),
    });
    if (owner === null && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const values = valuesFor(node.initializer, constants, new Map());
      if (values.size) addValues(constants, node.name.text, values);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.push({ node, owner: nextOwner });
    for (const child of visitChildren(node)) collect(child, nextOwner);
  };
  collect(sourceFile);

  // Resolve string codes passed through local validation helpers. Repeat because
  // one helper can pass its code parameter to another helper.
  let changed = true;
  while (changed) {
    changed = false;
    for (const call of calls) {
      const callee = functions.get(call.node.expression.text);
      if (!callee) continue;
      const owner = call.owner ? functions.get(call.owner) : null;
      const ownerParameters = new Map(owner?.names.map((name, index) =>
        [name, owner.values[index]]).filter(([name]) => name) ?? []);
      for (const [index, argument] of call.node.arguments.entries()) {
        if (index >= callee.values.length) continue;
        const values = valuesFor(argument, constants, ownerParameters);
        const before = callee.values[index].size;
        for (const value of values) callee.values[index].add(value);
        if (callee.values[index].size !== before) changed = true;
      }
    }
  }

  const found = [];
  const literals = [];
  const dynamicTemplates = [];
  const processInputInvocations = [];
  const isTypeLiteral = (node) => {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isLiteralTypeNode(current)) return true;
      if (ts.isStatement(current) || ts.isSourceFile(current)) return false;
    }
    return false;
  };
  const inspect = (node, owner = null, locals = new Map()) => {
    const declared = nameOf(node);
    const nextOwner = declared ?? owner;
    const definition = nextOwner ? functions.get(nextOwner) : null;
    const parameters = new Map(definition?.names.map((name, index) =>
      [name, definition.values[index]]).filter(([name]) => name) ?? []);
    let nextLocals = locals;
    if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer)
      && node.initializer.declarations.length === 1) {
      const declaration = node.initializer.declarations[0];
      let expression = node.expression;
      while (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)
        || ts.isParenthesizedExpression(expression)) expression = expression.expression;
      if (ts.isArrayBindingPattern(declaration.name) && ts.isArrayLiteralExpression(expression)) {
        nextLocals = new Map(locals);
        for (const [index, binding] of declaration.name.elements.entries()) {
          if (!ts.isBindingElement(binding) || !ts.isIdentifier(binding.name)) continue;
          const values = new Set();
          for (const tuple of expression.elements) {
            let item = tuple;
            while (ts.isAsExpression(item) || ts.isSatisfiesExpression(item)
              || ts.isParenthesizedExpression(item)) item = item.expression;
            if (!ts.isArrayLiteralExpression(item) || index >= item.elements.length) continue;
            for (const value of valuesFor(item.elements[index], constants,
              new Map([...parameters, ...locals]))) values.add(value);
          }
          if (values.size) nextLocals.set(binding.name.text, values);
        }
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)
      && ['Error', 'AggregateError'].includes(node.expression.text) && node.arguments?.length) {
      // Error(message) stores its message in argument 0. AggregateError(errors,
      // message) stores the stable code in argument 1.
      const messageIndex = node.expression.text === 'AggregateError' ? 1 : 0;
      const values = valuesFor(node.arguments[messageIndex], constants,
        new Map([...parameters, ...nextLocals]));
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      for (const value of values) {
        const code = stableCode(value);
        if (code) found.push({ code, file, line });
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'runProcessInput') {
      let options = node.arguments[2];
      while (options && (ts.isAsExpression(options) || ts.isSatisfiesExpression(options)
        || ts.isParenthesizedExpression(options))) options = options.expression;
      const scope = new Map([...parameters, ...nextLocals]);
      const propertyValues = (name) => {
        if (!options || !ts.isObjectLiteralExpression(options)) return new Set();
        const property = options.properties.find((candidate) => ts.isPropertyAssignment(candidate)
          && ((ts.isIdentifier(candidate.name) && candidate.name.text === name)
            || (ts.isStringLiteralLike(candidate.name) && candidate.name.text === name)));
        return property && ts.isPropertyAssignment(property)
          ? valuesFor(property.initializer, constants, scope) : new Set();
      };
      const hasProperty = (name) => options && ts.isObjectLiteralExpression(options)
        && options.properties.some((candidate) => ts.isPropertyAssignment(candidate)
          && ((ts.isIdentifier(candidate.name) && candidate.name.text === name)
            || (ts.isStringLiteralLike(candidate.name) && candidate.name.text === name)));
      processInputInvocations.push({ file,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        prefixes: propertyValues('prefix'), outputLimitErrors: propertyValues('outputLimitError'),
        hasOutputLimitError: hasProperty('outputLimitError') });
    }
    if (ts.isStringLiteralLike(node) && !isTypeLiteral(node)) {
      const code = stableCode(node.text);
      if (code) literals.push({ code, file,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
    } else if (ts.isTemplateExpression(node)) {
      const code = stableCode(node.head.text);
      if (code) literals.push({ code, file,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
      const template = node.getText(sourceFile).slice(1, -1);
      const skeleton = `${node.head.text}${node.templateSpans
        .map((span) => `\${}${span.literal.text}`).join('')}`;
      const codeSkeleton = skeleton.split(':', 1)[0];
      if (codeSkeleton.includes('${}') && stableCode(codeSkeleton.replaceAll('${}', 'DYNAMIC'))) {
        dynamicTemplates.push({ template, file,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
      }
    }
    for (const child of visitChildren(node)) inspect(child, nextOwner, nextLocals);
  };
  inspect(sourceFile);
  return { found, literals, dynamicTemplates, processInputInvocations, source };
}

const analysed = new Map(productionFiles.map((file) => [file, analyse(file)]));
const processInputInvocations = [...analysed.values()].flatMap((entry) => entry.processInputInvocations);
assert(processInputInvocations.length > 0, 'runProcessInput has no audited production call site');
for (const invocation of processInputInvocations) {
  assert(invocation.prefixes.size > 0,
    `runProcessInput prefix is not statically auditable: ${invocation.file}:${invocation.line}`);
  assert(!invocation.hasOutputLimitError || invocation.outputLimitErrors.size > 0,
    `runProcessInput output-limit code is not statically auditable: ${invocation.file}:${invocation.line}`);
}
const processInputPrefixes = [...new Set(processInputInvocations.flatMap((invocation) => [...invocation.prefixes]))].sort();
const defaultProcessOutputPrefixes = [...new Set(processInputInvocations
  .filter((invocation) => !invocation.hasOutputLimitError)
  .flatMap((invocation) => [...invocation.prefixes]))].sort();
const excludedLiteralCodes = new Map([
  ['BUSTER_READY', 'positive readiness result'],
  ['DEPENDENCY_OK', 'positive dependency-process result'],
  ['DURABLE_RECORD_IDEMPOTENCY_CONFLICT', 'internal store signal translated to BUSTER_REMOTE_JOB_CONFLICT'],
  ['KUBERNETES_FIXTURE_KUBECTL', 'prefix used to construct the documented kubectl error family'],
  ['MANIFEST_SIZE', 'label used to construct a documented Kubernetes fixture limit error'],
  ['NOT_FOUND', 'substring used only to map an existing error to HTTP 404'],
  ['PVC_SIZE', 'label used to construct a documented Kubernetes fixture limit error'],
  ['PVC_TOTAL_SIZE', 'label used to construct a documented Kubernetes fixture limit error'],
  ['REPORT_ADAPTER', 'prefix used to construct the documented report-adapter process family'],
  ['RESOURCE_COUNT', 'label used to construct a documented Kubernetes fixture limit error'],
  ['SIZE_EXCEEDED', 'substring used only to map an existing error to HTTP 413'],
  ['TAILSCALE_EXPOSURE_KUBECTL', 'prefix used to construct the documented kubectl error family'],
  ['TEST_PROVIDER_CLEANUP_COMPLETE', 'internal AbortController completion signal'],
  ['TEST_RUNNER_ADMISSION_STORE_ROOT', 'label used to construct documented store-root path errors'],
  ['TEST_RUNNER_ATTEMPT_REPOSITORY', 'label used to construct a documented workspace error'],
  ['TEST_RUNNER_ATTEMPT_STORE_ROOT', 'label used to construct documented store-root path errors'],
  ['TEST_RUNNER_OBSERVABILITY_ROOT', 'label used to construct documented store-root path errors'],
  ['TEST_RUNNER_REPOSITORY', 'label used to construct a documented workspace error'],
]);
const dynamicFamilies = [
  { file: 'skills/buster/engine/test-gates/process-input.ts', sentinel: '${options.prefix}_CANCELLED',
    prefixes: processInputPrefixes,
    suffixes: ['CANCELLED', 'TIMEOUT', 'STDIN_FAILED', 'STDOUT_FAILED', 'STDERR_FAILED'],
    sentinels: { CANCELLED: '${options.prefix}_CANCELLED', TIMEOUT: '${options.prefix}_TIMEOUT',
      STDIN_FAILED: '${options.prefix}_STDIN_FAILED', STDOUT_FAILED: '${options.prefix}_STDOUT_FAILED',
      STDERR_FAILED: '${options.prefix}_STDERR_FAILED' } },
  { file: 'skills/buster/engine/test-gates/process-input.ts', sentinel: '${prefix}_CLEANUP_FAILED',
    prefixes: processInputPrefixes,
    suffixes: ['CLEANUP_FAILED'] },
  { file: 'skills/buster/engine/test-gates/process-input.ts', sentinel: '${options.prefix}_OUTPUT_LIMIT',
    prefixes: defaultProcessOutputPrefixes, suffixes: ['OUTPUT_LIMIT'] },
  { file: 'skills/buster/engine/test-gates/report-adapter-runtime.ts', sentinel: 'REPORT_ADAPTER_RESULT_LIMIT',
    prefixes: ['REPORT_ADAPTER'], suffixes: ['RESULT_LIMIT'] },
  { file: 'skills/buster/engine/test-gates/container-build-runtime.ts', sentinel: 'CONTAINER_BUILD_${label}_LIMIT_INVALID',
    prefixes: ['CONTAINER_BUILD'], suffixes: ['LOG_LIMIT_INVALID', 'TIME_LIMIT_INVALID', 'MANIFEST_LIMIT_INVALID'],
    sourceResolved: true },
  { file: 'skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts', sentinel: 'KUBERNETES_FIXTURE_${label}_LIMIT_INVALID',
    prefixes: ['KUBERNETES_FIXTURE'], suffixes: ['MANIFEST_SIZE_LIMIT_INVALID', 'RESOURCE_COUNT_LIMIT_INVALID',
      'PVC_SIZE_LIMIT_INVALID', 'PVC_TOTAL_SIZE_LIMIT_INVALID', 'RETENTION_LIMIT_INVALID', 'EXECUTION_LIMIT_INVALID'],
    sourceResolved: true },
  { file: 'skills/buster/engine/test-gates/runner.ts', sentinel: '${label}_SYMLINK',
    prefixes: ['TEST_RUNNER_OBSERVABILITY_ROOT', 'TEST_RUNNER_ATTEMPT_STORE_ROOT', 'TEST_RUNNER_ADMISSION_STORE_ROOT'],
    suffixes: ['SYMLINK', 'NOT_DIRECTORY'],
    sentinels: { SYMLINK: '${label}_SYMLINK', NOT_DIRECTORY: '${label}_NOT_DIRECTORY' }, sourceResolved: true },
  { file: 'skills/buster/engine/test-gates/runner.ts', sentinel: '${label}_OUTSIDE_WORKSPACE',
    prefixes: ['TEST_RUNNER_REPOSITORY', 'TEST_RUNNER_ATTEMPT_REPOSITORY'], suffixes: ['OUTSIDE_WORKSPACE'],
    sourceResolved: true },
  { file: 'skills/buster/plugins/visual/src/provider.js', sentinel: '${code}_TOO_LARGE',
    prefixes: ['VISUAL_PROFILE_FILE_INVALID', 'VISUAL_MANIFEST_INVALID'], suffixes: ['TOO_LARGE'], sourceResolved: true },
];

const locations = new Map();
function addLocation(code, file, line) {
  const entries = locations.get(code) ?? new Map();
  entries.set(`${file}:${line}`, { file, line });
  locations.set(code, entries);
}
const literalLocations = new Map();
for (const entry of analysed.values()) for (const item of entry.literals) {
  const entries = literalLocations.get(item.code) ?? [];
  entries.push(item);
  literalLocations.set(item.code, entries);
  // A runtime diagnostic can cross the Buster boundary as an exception, HTTP
  // error, readiness code, result field, summary, or helper argument. Include
  // every production literal unless the audited list above excludes it.
  if (!excludedLiteralCodes.has(item.code)) addLocation(item.code, item.file, item.line);
}
for (const entry of analysed.values()) for (const item of entry.found) {
  if (!excludedLiteralCodes.has(item.code)) addLocation(item.code, item.file, item.line);
}
for (const family of dynamicFamilies) {
  const source = analysed.get(family.file)?.source;
  assert(source?.includes(family.sentinel), `dynamic error construction changed in ${family.file}: ${family.sentinel}`);
  if (family.sourceResolved) continue;
  for (const prefix of family.prefixes) for (const suffix of family.suffixes) {
    const sentinel = family.sentinels?.[suffix] ?? family.sentinel;
    assert(source.includes(sentinel), `dynamic error suffix changed in ${family.file}: ${sentinel}`);
    const line = source.slice(0, source.indexOf(sentinel)).split('\n').length;
    addLocation(`${prefix}_${suffix}`, family.file, line);
  }
}
const allowedDynamicTemplates = new Set(dynamicFamilies.flatMap((family) => [
  family.sentinel, ...Object.values(family.sentinels ?? {}),
]).filter((template) => template.includes('${')));
for (const entry of analysed.values()) for (const item of entry.dynamicTemplates) {
  assert(allowedDynamicTemplates.has(item.template),
    `dynamic production diagnostic is not an audited finite family: ${item.file}:${item.line} ${item.template}`);
}

for (const [code, reason] of excludedLiteralCodes) {
  assert(literalLocations.has(code), `excluded diagnostic literal disappeared; review the exclusion: ${code} (${reason})`);
  assert(!locations.has(code), `excluded non-error entered the generated inventory: ${code}`);
}
for (const code of literalLocations.keys()) {
  assert(locations.has(code) || excludedLiteralCodes.has(code),
    `production diagnostic literal is neither documented nor explicitly excluded: ${code}`);
}

for (const required of ['VISUAL_BASELINE_BROWSER_VERSION_MISMATCH', 'KUBERNETES_FIXTURE_MANIFEST_PARSE_FAILED',
  'SECURITY_SCAN_DATABASE_STALE', 'DIRECT_COMMAND_EXECUTABLE_DENIED', 'TEST_EVIDENCE_PATH_FORBIDDEN',
  'BUSTER_REMOTE_CONFIG_INVALID', 'REPORT_ADAPTER_TIMEOUT', 'TAILSCALE_EXPOSURE_ROLLBACK_FAILED',
  'BUSTER_REMOTE_TERMINAL_STATUS_UNREADABLE']) {
  assert(locations.has(required), `production error is absent from the generated inventory: ${required}`);
}
for (const forbidden of ['TEST_RUNNER_ADMISSION_STORE_ROOT', 'TEST_PROVIDER_CLEANUP_COMPLETE',
  'PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_JSON_OUTPUT_NAME', 'PLAYWRIGHT_TEST_BASE_URL',
  'REPORT_ADAPTER_OUTPUT_LIMIT']) {
  assert(!locations.has(forbidden), `non-error value entered the generated inventory: ${forbidden}`);
}

const groupDefinitions = [
  ['Unit Command And JUnit Report', ['DIRECT_COMMAND_', 'JUNIT_']], ['Coverage Budget', ['COVERAGE_']],
  ['Container Build', ['CONTAINER_BUILD_', 'BUSTER_CONTAINER_BUILD_']], ['Kubernetes Fixture', ['KUBERNETES_FIXTURE_']],
  ['HTTP', ['HTTP_']], ['Tailscale Exposure', ['TAILSCALE_EXPOSURE_', 'EXPOSURE_HANDOFF_']],
  ['API', ['API_FLOW_', 'OPENAPI_']], ['Accessibility', ['AXE_', 'BROWSER_AXE_']],
  ['Lighthouse Performance', ['LIGHTHOUSE_', 'BROWSER_LIGHTHOUSE_']], ['Visual', ['VISUAL_', 'BROWSER_VISUAL_']],
  ['End-To-End', ['PLAYWRIGHT_', 'BROWSER_PLAYWRIGHT_']],
  ['Security', ['SECURITY_', 'DEPENDENCY_SCAN_', 'IMAGE_SCAN_', 'KUBERNETES_POLICY_', 'KUBERNETES_RUNTIME_']],
  ['Size Budget', ['SIZE_BUDGET_']], ['Authenticated Demo Smoke Test', ['DEMO_AUTH_', 'DEMO_CREDENTIAL_']],
  ['Provider And Report Runtime', ['REPORT_ADAPTER_', 'TEST_PROVIDER_', 'TEST_REPORT_', 'TEST_RUNNER_', 'TEST_EVIDENCE_']],
  ['Remote Admission And Service', ['BUSTER_REMOTE_', 'REMOTE_PLAN_', 'BUSTER_READINESS_']],
  ['Fixture And Runtime Lifecycle', ['FIXTURE_', 'NATIVE_FIXTURE_', 'DEPENDENCY_', 'TERMINAL_WORKSPACE_']],
];
const groupFor = (code) => groupDefinitions.find(([, prefixes]) =>
  prefixes.some((prefix) => code.startsWith(prefix)))?.[0] ?? 'Shared Buster Runtime';

const componentPrefixes = [
  ['BROWSER_PLAYWRIGHT_RUNTIME_', 'Playwright runtime'], ['SECURITY_SCAN_REGISTRY_', 'security scan registry'],
  ['SECURITY_DATABASE_', 'security scanner'], ['SECURITY_HEADERS_', 'security headers provider'],
  ['SECURITY_SCANNER_', 'security scanner'], ['SECURITY_POLICY_', 'security policy'],
  ['HTTP_REGISTRY_HEALTH_', 'HTTP registry health check'], ['BUSTER_SOURCE_ATTESTATION_', 'Buster source attestation'],
  ['BUSTER_COMPACTION_', 'Buster compaction service'], ['BUSTER_FIXTURE_', 'Buster fixture authority'],
  ['BUSTER_REGISTRY_HEALTH_', 'HTTP registry health check'],
  ['BUSTER_REMOTE_CONFIG_', 'Buster remote service', 'configuration'], ['EXPOSURE_HANDOFF_', 'exposure handoff'],
  ['TEST_EVIDENCE_STORE_', 'test evidence store'], ['DEPENDENCY_PROCESS_', 'dependency process'],
  ['FIXTURE_AUTHORITY_', 'fixture authority', 'value'], ['DEMO_AUTH_', 'authenticated demo'],
  ['KUBERNETES_FIXTURE_KUBECTL_', 'Kubernetes fixture kubectl'], ['TAILSCALE_EXPOSURE_KUBECTL_', 'Tailscale exposure kubectl'],
  ['KUBERNETES_RUNTIME_SECURITY_', 'Kubernetes runtime security'], ['BROWSER_LIGHTHOUSE_', 'Lighthouse browser runtime'],
  ['BROWSER_PLAYWRIGHT_', 'Playwright browser runtime'], ['BROWSER_VISUAL_', 'visual browser runtime'],
  ['BROWSER_AXE_', 'accessibility browser runtime'], ['KUBERNETES_FIXTURE_', 'Kubernetes fixture'],
  ['TAILSCALE_EXPOSURE_', 'Tailscale exposure'], ['DIRECT_COMMAND_', 'direct command provider'],
  ['REPORT_ADAPTER_', 'report adapter'], ['REPORT_ARTIFACT_', 'report adapter'], ['TEST_PROVIDER_', 'test provider'],
  ['TEST_REPORT_', 'test report'], ['TEST_PLAN_', 'test runner'], ['TEST_RUNNER_', 'test runner'],
  ['TEST_EVIDENCE_', 'test evidence store'], ['BUSTER_REMOTE_', 'Buster remote service'],
  ['REMOTE_PLAN_', 'remote plan service'], ['API_FLOW_', 'API Flow'], ['OPENAPI_', 'OpenAPI provider'],
  ['CONTAINER_BUILD_', 'container build provider'], ['KUBERNETES_POLICY_', 'Kubernetes policy scanner'],
  ['DEPENDENCY_SCAN_', 'dependency scanner'], ['IMAGE_SCAN_', 'image scanner'], ['SECURITY_SCAN_', 'security scanner'],
  ['SIZE_BUDGET_', 'size-budget provider'], ['BROWSER_', 'browser runtime'], ['VISUAL_', 'visual provider'],
  ['PLAYWRIGHT_', 'Playwright provider'], ['LIGHTHOUSE_', 'Lighthouse provider'], ['AXE_', 'accessibility provider'],
  ['HTTP_', 'HTTP provider'], ['JUNIT_', 'JUnit adapter'], ['COVERAGE_', 'coverage provider'],
  ['OBSERVABILITY_', 'observability recorder'], ['PROCESS_INPUT_', 'process-input lifecycle'],
  ['WORKER_RUNTIME_', 'worker runtime'], ['WORKER_TERMINATION_', 'worker runtime'],
  ['FIXTURE_', 'fixture authority'], ['DEPENDENCY_', 'dependency process'], ['EXPOSURE_', 'exposure handoff'],
  ['DEMO_', 'demo smoke test'], ['BUSTER_', 'Buster runtime'],
];
const semanticSuffixes = ['CLEANUP_FAILED', 'RELEASE_FAILED', 'STDERR_FAILED', 'STDIN_FAILED', 'STDOUT_FAILED',
  'SOURCE_GIT_FAILED', 'REGISTRY_READ_FAILED', 'REGISTRY_ERROR', 'CONTROLLER_FAILED', 'LEASE_FAILED', 'PROXY_FAILED', 'SPAWN_FAILED',
  'EXIT_FAILED', 'TAR_FAILED', 'INITIALIZE_EXITED', 'PROCESS_EXITED', 'BROKEN_PIPE', 'NOT_ABSOLUTE', 'NOT_DIRECTORY',
  'NOT_FILE', 'NOT_FOUND', 'NOT_READY', 'OUTSIDE_PROVIDER_ROOTS', 'OUTSIDE_REPOSITORY', 'OUTSIDE_WORKSPACE',
  'OUTSIDE_ROOT', 'OVERLAPS_WORKSPACE', 'PATH_ESCAPE', 'TOO_LARGE', 'TOO_LOW', 'TOO_BROAD',
  'CLOSED_BEFORE_TEARDOWN', 'READINESS_BEFORE_ADMISSION', 'UNAWAITED_CAPABILITIES',
  'ALREADY_STARTED', 'ALREADY_TERMINAL', 'OWNED_BY_NOVA', 'NO_BYTE_SAVING', 'TRAILING_DATA',
  'TEARDOWN_PENDING', 'NOT_COMPLETED', 'NOT_DURABLE', 'NOT_PRIVATE', 'ZERO_CASES',
  'NO_EXECUTED_CASES', 'EXECUTION_INTERRUPTED', 'NOT_BOOTSTRAPPED',
  'SHUTTING_DOWN', 'BEFORE_ADMISSION', 'UNREADABLE', 'INCOMPATIBLE', 'GRANULARITY',
  'UNCERTAIN', 'IMMUTABLE', 'REPEATED', 'FENCED', 'DEADLOCK', 'IN_CASE', 'SHUTDOWN', 'TERMINAL',
  'LIMIT_EXCEEDS_CONTRACT', 'LIMIT_EXCEEDED', 'BUDGET_EXCEEDED',
  'CAPACITY_EXCEEDED', 'BYTES_EXCEEDED', 'OUTPUT_LIMIT', 'FILE_LIMIT', 'CANCELLED',
  'TIMEOUT_EXCEEDED', 'TIMEOUT', 'UNAVAILABLE', 'UNREACHABLE', 'MISSING', 'REQUIRED', 'DENIED',
  'FORBIDDEN', 'MISMATCH', 'CHANGED', 'EXPIRED', 'STALE', 'UNSUPPORTED', 'DUPLICATE',
  'UNKNOWN_FIELD', 'AMBIGUOUS', 'INCOMPLETE', 'UNKNOWN', 'INVALID', 'EXHAUSTED', 'TAMPERED',
  'NOT_AVAILABLE', 'NOT_DELEGATED', 'NOT_ISOLATED', 'NOT_RETAINED', 'NOT_RESOLVED', 'NOT_BUILT',
  'NOT_USED', 'REJECTED', 'RESERVED', 'SYMLINK', 'UNSAFE', 'CYCLE', 'TRUNCATED', 'TERMINATED',
  'CLOSED', 'CONFLICT', 'NESTED', 'ZERO_TESTS', 'REQUIRE_TLS', 'FUTURE', 'FULL', 'EXCEEDED',
  'FAILED', 'ERROR', 'EXITED', 'EMPTY', 'LIMIT'];
const exactObjects = new Map([
  ['BUSTER_SOURCE_ATTESTATION_INVALID', 'source snapshot attestation'],
  ['SECURITY_POLICY_INVALID', 'security policy'],
  ['TAILSCALE_EXPOSURE_KUBECTL_INVALID', 'kubectl executable'],
]);

function errorParts(code) {
  const [prefix, component, defaultObject = 'operation'] = componentPrefixes.find(([candidate]) => code.startsWith(candidate))
    ?? ['', 'Buster runtime', 'operation'];
  const remainder = code.slice(prefix.length);
  const suffix = semanticSuffixes.find((candidate) => remainder === candidate || remainder.endsWith(`_${candidate}`)) ?? '';
  const stem = suffix ? remainder.slice(0, -(suffix.length + (remainder === suffix ? 0 : 1))) : remainder;
  const replacements = { config: 'configuration', auth: 'authentication', env: 'environment',
    expect: 'expected-result rule', extract: 'extraction rule', stdin: 'standard input', stdout: 'standard output',
    stderr: 'standard error', url: 'URL', uri: 'URI', api: 'API', json: 'JSON', http: 'HTTP', git: 'Git',
    xml: 'XML', cpu: 'CPU', nova: 'Nova', junit: 'JUnit', id: 'ID', ids: 'IDs', bom: 'BOM', utf8: 'UTF-8',
    rbac: 'RBAC', tls: 'TLS', dns: 'DNS', oci: 'OCI', tar: 'TAR', buildkit: 'BuildKit', websocket: 'WebSocket',
    statefulset: 'StatefulSet', pvc: 'persistent volume claim', ref: 'reference', refs: 'references' };
  const words = (stem || defaultObject).toLowerCase().split('_').map((word) => replacements[word] ?? word);
  if (words.at(-1) === 'parse') words[words.length - 1] = 'parsing';
  return { component, object: exactObjects.get(code) ?? words.join(' '), stem, suffix };
}

function invalidRule(code) {
  const { stem } = errorParts(code);
  const tokens = new Set((stem || code).split('_'));
  const has = (...values) => values.some((value) => tokens.has(value));
  if (has('PATH', 'PATHS', 'FILE', 'FILES', 'DIRECTORY', 'DIRECTORIES', 'ROOT', 'ROOTS', 'WORKSPACE', 'SYMLINK')) {
    return 'A path breaks a syntax, file-type, or containment rule.';
  }
  if (has('LIMIT', 'LIMITS', 'MAXIMUM', 'MINIMUM', 'TIMEOUT', 'DURATION', 'INTERVAL', 'BYTE', 'BYTES', 'SIZE',
    'COUNT', 'COUNTS', 'QUANTITY', 'REPLICAS', 'CONCURRENCY', 'WORKER', 'WORKERS', 'PROCESS', 'PROCESSES',
    'MEMORY', 'CPU', 'PORT', 'PORTS', 'BUDGET')) {
    return 'A numeric value is not a safe integer or is outside its supported range.';
  }
  if (has('CREATED', 'TIMESTAMP', 'DATE')) {
    return 'A timestamp has the wrong syntax, precision, or allowed time range.';
  }
  if (has('DIGEST', 'CHECKSUM', 'IDENTITY', 'IDEMPOTENCY', 'PROVENANCE', 'REVISION', 'AUTHORITY', 'SIGNATURE',
    'RECEIPT', 'KEY', 'KEYS', 'TOKEN', 'POINTER', 'AUTH', 'AUTHENTICATION', 'CREDENTIAL', 'CREDENTIALS',
    'ATTESTATION', 'BINDING', 'CLAIM', 'ID')) {
    return 'An identity, digest, signature, or authority value has the wrong format or binding.';
  }
  if (has('CONFIG', 'CONFIGURATION', 'POLICY', 'SCHEMA', 'DECLARATION', 'OPTION', 'OPTIONS', 'PROFILE', 'SETTING',
    'SETTINGS', 'DEFINITION', 'PLATFORM', 'PLATFORMS', 'PREFIX', 'NAMESPACE', 'RETENTION', 'MODE', 'INTENT',
    'ENV', 'ENVIRONMENT', 'TARGET', 'TARGETS', 'CONTAINER', 'CONTAINERS', 'SECURITY', 'TEMPLATE', 'TEMPLATES',
    'CLASS', 'CLASSES', 'REFERENCE', 'REFERENCES', 'RULE', 'RULES', 'PURPOSE', 'RESOURCE', 'ROUTE', 'TAGS',
    'VIEWPORT', 'CAPTURE', 'COMBINATION', 'COMPARE', 'RUN', 'PATTERN', 'VERSION', 'EXCLUDE', 'ACCEPTANCE',
    'ACCEPTANCES', 'SCOPE')) {
    return 'A required field, field type, or allowed configuration value is not valid.';
  }
  if (has('URL', 'URI', 'ORIGIN', 'ORIGINS', 'HOST', 'HOSTS', 'METHOD', 'METHODS', 'HEADER', 'HEADERS', 'NETWORK',
    'ENDPOINT', 'REGISTRY', 'ADDRESS', 'API')) {
    return 'A network value breaks an accepted syntax, scheme, host, port, header, or policy rule.';
  }
  if (has('REPORT', 'REPORTS', 'EVIDENCE', 'RESULT', 'RESULTS', 'FINDING', 'FINDINGS', 'METRIC', 'METRICS',
    'OUTPUT', 'OUTPUTS', 'ARTIFACT', 'ARTIFACTS', 'RECORD', 'RECORDS', 'OUTCOME', 'COVERAGE')) {
    return 'Produced evidence has an invalid shape, identity, count, media type, or declared relationship.';
  }
  if (has('MANIFEST', 'ARCHIVE', 'TAR', 'IMAGE', 'BASELINE', 'SCREENSHOT', 'XML', 'JSON', 'JUNIT', 'LCOV',
    'COMPARISON', 'MASK', 'COOKIE', 'ENCODING', 'BOM', 'UTF8', 'DATABASE', 'METADATA', 'ENTRY', 'BLOB')) {
    return 'Document or artifact content breaks its required format, structure, or safety rule.';
  }
  if (has('STATE', 'STATUS', 'PHASE', 'TRANSITION', 'LIFECYCLE', 'ATTEMPT', 'JOB', 'PLAN', 'NODE', 'FIXTURE',
    'LEASE', 'PREDECESSOR', 'PREDECESSORS', 'ADMISSION', 'CONTROL', 'READINESS', 'ACK', 'TEARDOWN', 'TERMINAL')) {
    return 'Recorded execution state breaks an allowed identity, phase, or transition rule.';
  }
  if (has('COMMAND', 'EXECUTABLE', 'PROCESS', 'PROCESSES', 'SANDBOX', 'CGROUP', 'RUNTIME', 'BROWSER', 'PLAYWRIGHT',
    'CHROME', 'KUBECTL', 'DEPLOYMENT')) {
    return 'An execution value breaks an executable, isolation, runtime, or resource rule.';
  }
  if (has('REQUEST', 'RESPONSE', 'PAYLOAD', 'MESSAGE', 'MESSAGES', 'INPUT', 'INPUTS', 'ARGUMENT', 'ARGUMENTS', 'VARIABLE',
    'VARIABLES', 'PROTOCOL', 'OPERATION', 'SELECTOR', 'STEP', 'STEPS', 'EXPECT', 'EXTRACT', 'ASSERTION', 'CONTRACT',
    'SHAPE')) {
    return 'At least one supplied value has the wrong type, format, size, or allowed name.';
  }
  if (has('NAME', 'HOSTNAME', 'SUBJECT')) {
    return 'A name has the wrong syntax, length, or allowed value.';
  }
  return 'At least one value has the wrong type, format, range, or structure.';
}

const exactCauses = new Map([
  ['DIRECT_COMMAND_PATH_ESCAPE', 'Direct command provider received a path outside its approved root.'],
  ['CONTAINER_BUILD_PATH_ESCAPE', 'Container build provider received a path outside its approved root.'],
  ['TEST_PROVIDER_MISSING', 'Test runner cannot find the selected test provider contract in its registry snapshot.'],
  ['TEST_PROVIDER_TERMINATED', 'Test provider process stopped before it completed the request.'],
  ['TEST_REPORT_NO_EXECUTED_CASES', 'Test report contains skipped cases but no executed test case.'],
  ['TEST_REPORT_ZERO_CASES', 'Test report contains no test case.'],
  ['JUNIT_XML_TEXT_OUTSIDE_ROOT', 'JUnit adapter found text outside the XML root element.'],
  ['BUSTER_SOURCE_ATTESTATION_INVALID', 'Buster remote service could not verify the source snapshot attestation.'],
  ['BUSTER_REMOTE_EXECUTION_INTERRUPTED', 'Buster remote service found recorded execution that the previous process stop interrupted.'],
  ['BUSTER_COMPACTION_NO_BYTE_SAVING', 'Buster compaction service found that the compacted record would not use fewer bytes.'],
  ['BUSTER_FIXTURE_NOT_READY', 'Buster fixture authority received a provider result that does not prove fixture readiness.'],
  ['BUSTER_FIXTURE_READINESS_BEFORE_ADMISSION', 'Buster fixture authority received a readiness timestamp earlier than the recorded admission time.'],
  ['SECURITY_POLICY_INVALID', 'Security scanner received a policy with an unsupported profile or field.'],
  ['TAILSCALE_EXPOSURE_KUBECTL_INVALID', 'Tailscale exposure received a kubectl path that is not a regular file.'],
  ['TAILSCALE_EXPOSURE_PREDECESSORS_EXHAUSTED', 'Tailscale exposure found no predecessor lease that it can safely resume.'],
  ['VISUAL_MANIFEST_INVALID_TOO_LARGE', 'Visual provider rejected the manifest file because its byte size exceeds the limit.'],
  ['VISUAL_PROFILE_FILE_INVALID_TOO_LARGE', 'Visual provider rejected the profile file because its byte size exceeds the limit.'],
  ['BUSTER_REMOTE_CONCURRENCY_EXCEEDS_SERVICE_LIMIT', 'Buster remote service rejected the requested concurrency because it exceeds the service limit.'],
  ['BUSTER_REMOTE_ADMISSION_FULL', 'Buster remote service rejected a new job because its admission queue is full.'],
  ['TERMINATION_FAILED', 'Dependency process could not stop its child process cleanly.'],
  ['WORKER_TERMINATION_FAILED', 'Worker runtime could not stop the worker process cleanly.'],
]);

function naturalCause(code) {
  const { component, object, suffix } = errorParts(code);
  const lead = `${component[0].toUpperCase()}${component.slice(1)}`;
  if (exactCauses.has(code)) return exactCauses.get(code);
  if (suffix === 'CANCELLED') return object === 'operation'
    ? `${lead} stopped its current work after a cancellation request.`
    : `${lead} stopped ${object} after a cancellation request.`;
  if (suffix === 'TIMEOUT' || suffix === 'TIMEOUT_EXCEEDED') return object === 'operation'
    ? `${lead} did not finish its current work before the time limit.`
    : `${lead} did not complete ${object} before its time limit.`;
  if (suffix === 'CLEANUP_FAILED' || suffix === 'RELEASE_FAILED') return object === 'operation'
    ? `${lead} could not complete cleanup or release.`
    : `${lead} could not complete cleanup or release for ${object}.`;
  if (suffix === 'MISMATCH' || suffix === 'CHANGED') return `${lead} observed ${object} that differs from the admitted value.`;
  if (suffix === 'NOT_FOUND') return `${lead} cannot find the selected ${object}.`;
  if (['UNAVAILABLE', 'UNREACHABLE', 'NOT_READY'].includes(suffix)) return `${lead} cannot use ${object} because it is not ready or available.`;
  if (suffix === 'MISSING') return `${lead} did not receive required ${object}.`;
  if (suffix === 'REQUIRED') return `${lead} requires ${object}.`;
  if (suffix === 'DENIED' || suffix === 'FORBIDDEN') return `${lead} policy does not permit ${object}.`;
  if (suffix === 'NOT_ABSOLUTE') return `${lead} received ${object} that is not an absolute path.`;
  if (suffix === 'NOT_DIRECTORY') return `${lead} received ${object} that is not a directory.`;
  if (suffix === 'NOT_FILE') return `${lead} received ${object} that is not a regular file.`;
  if (suffix === 'OVERLAPS_WORKSPACE') return `${lead} detected ${object} that overlaps the protected workspace.`;
  if (suffix === 'SYMLINK') return `${lead} received ${object} that is a symbolic link.`;
  if (['OUTSIDE_PROVIDER_ROOTS', 'OUTSIDE_REPOSITORY', 'OUTSIDE_WORKSPACE', 'OUTSIDE_ROOT',
    'PATH_ESCAPE'].includes(suffix)) return `${lead} detected ${object} outside its approved filesystem boundary.`;
  if (suffix === 'OUTPUT_LIMIT') return `${lead} stopped process output because it exceeds the configured byte limit.`;
  if (['TOO_LARGE', 'LIMIT_EXCEEDED', 'BUDGET_EXCEEDED', 'CAPACITY_EXCEEDED',
    'BYTES_EXCEEDED', 'FILE_LIMIT', 'EXHAUSTED', 'EXCEEDED', 'FULL', 'LIMIT'].includes(suffix)) return `${lead} rejected ${object}. The measured resource use exceeds the configured limit.`;
  if (suffix === 'LIMIT_EXCEEDS_CONTRACT' || suffix === 'TOO_LOW' || suffix === 'TOO_BROAD') return `${lead} rejected ${object}. The configured value is outside the safe range.`;
  if (suffix === 'EXPIRED' || suffix === 'STALE') return `${lead} rejected ${object}. The value is no longer current.`;
  if (suffix === 'UNSUPPORTED') return `${lead} does not support the selected ${object}.`;
  if (suffix === 'DUPLICATE') return `${lead} received more than one ${object} with the same identity.`;
  if (suffix === 'AMBIGUOUS') return `${lead} cannot select one unambiguous ${object}.`;
  if (suffix === 'INCOMPLETE') return `${lead} received incomplete ${object}.`;
  if (suffix === 'UNKNOWN') return `${lead} does not recognize ${object}.`;
  if (suffix === 'UNKNOWN_FIELD') return `${lead} does not recognize a field in ${object}.`;
  if (suffix === 'INVALID') return `${lead} rejected ${object}. ${invalidRule(code)}`;
  if (suffix === 'EMPTY') return `${lead} received no usable value for ${object}.`;
  if (suffix === 'TAMPERED') return `${lead} detected a change to ${object} outside its owner.`;
  if (suffix === 'UNSAFE') return `${lead} rejected ${object} because it violates the safety policy.`;
  if (suffix === 'CYCLE') return `${lead} detected a reference cycle in ${object}.`;
  if (suffix === 'TRUNCATED') return `${lead} received incomplete ${object}.`;
  if (suffix === 'REJECTED') return `${lead} policy rejected ${object}.`;
  if (suffix === 'RESERVED') return `${lead} received a reserved ${object}.`;
  if (['NOT_AVAILABLE', 'NOT_BUILT', 'NOT_RESOLVED'].includes(suffix)) return `${lead} cannot use ${object} because it is not available.`;
  if (suffix === 'NOT_DELEGATED' || suffix === 'NOT_ISOLATED') return `The ${component} ${object} does not provide the required isolation.`;
  if (suffix === 'NOT_RETAINED') return `${lead} cannot find retained ${object}.`;
  if (suffix === 'NOT_USED') return `${lead} did not use the supplied ${object}.`;
  if (suffix === 'CLOSED' || suffix === 'TERMINATED') return `${lead} stopped ${object} before completion.`;
  if (suffix === 'CONFLICT') return `${lead} detected ${object} that conflicts with recorded state.`;
  if (suffix === 'NESTED') return `${lead} rejected ${object} because its nested structure is invalid.`;
  if (suffix === 'IN_CASE') return `${lead} found ${object} inside a case element.`;
  if (suffix === 'TRAILING_DATA') return `${lead} found data after the complete ${object}.`;
  if (suffix === 'GRANULARITY') return `${lead} rejected ${object} because it does not use a supported increment.`;
  if (suffix === 'INCOMPATIBLE') return `${lead} rejected ${object} because it is incompatible with the selected runtime.`;
  if (suffix === 'UNAWAITED_CAPABILITIES') return `${lead} finished while capability requests were still pending.`;
  if (suffix === 'ZERO_CASES') return `${lead} found no test cases in ${object}.`;
  if (suffix === 'DEADLOCK') return `${lead} found no runnable node while unfinished work remained.`;
  if (suffix === 'OWNED_BY_NOVA') return `${lead} rejected ${object} because Nova owns this recovery decision.`;
  if (suffix === 'ALREADY_STARTED') return `${lead} rejected ${object} because it had already started.`;
  if (suffix === 'ALREADY_TERMINAL' || suffix === 'TERMINAL') return `${lead} found ${object} in a terminal state.`;
  if (suffix === 'SHUTTING_DOWN') return `${lead} rejected new work because shutdown is in progress.`;
  if (suffix === 'SHUTDOWN') return `${lead} rejected new work because shutdown has started.`;
  if (suffix === 'UNREADABLE') return `${lead} could not read ${object}.`;
  if (suffix === 'UNCERTAIN') return `${lead} cannot prove the final state of ${object}.`;
  if (suffix === 'NOT_COMPLETED') return `${lead} found ${object} before completion.`;
  if (suffix === 'NO_BYTE_SAVING') return `${lead} rejected ${object} because compaction would not reduce stored bytes.`;
  if (suffix === 'CLOSED_BEFORE_TEARDOWN') return `${lead} found ${object} closed before teardown completed.`;
  if (suffix === 'NOT_PRIVATE') return `${lead} rejected ${object} because other users can access it.`;
  if (suffix === 'READINESS_BEFORE_ADMISSION' || suffix === 'BEFORE_ADMISSION') return `${lead} received ${object} before admission completed.`;
  if (suffix === 'FENCED') return `${lead} rejected ${object} because a newer owner fenced it.`;
  if (suffix === 'IMMUTABLE') return `${lead} rejected a change to immutable ${object}.`;
  if (suffix === 'REPEATED') return `${lead} rejected a repeated transition for ${object}.`;
  if (suffix === 'TEARDOWN_PENDING') return `${lead} found unfinished teardown for ${object}.`;
  if (suffix === 'NOT_DURABLE') return `${lead} could not confirm durable ${object}.`;
  if (suffix === 'NO_EXECUTED_CASES') return `${lead} found no executed test case in ${object}.`;
  if (suffix === 'EXECUTION_INTERRUPTED') return `${lead} found ${object} interrupted by the previous process stop.`;
  if (suffix === 'NOT_BOOTSTRAPPED') return `${lead} received a readiness request before durable recovery completed.`;
  if (suffix === 'ZERO_TESTS') return `${lead} did not execute a test.`;
  if (suffix === 'REQUIRE_TLS') return `${lead} requires TLS for ${object}.`;
  if (suffix === 'FUTURE') return `${lead} rejected ${object} because its timestamp is in the future.`;
  if (suffix === 'STDIN_FAILED') return `${lead} could not write data to the child process standard input.`;
  if (suffix === 'STDOUT_FAILED') return `${lead} could not read complete data from the child process standard output.`;
  if (suffix === 'STDERR_FAILED') return `${lead} could not read complete data from the child process standard error.`;
  if (suffix === 'SPAWN_FAILED') return `${lead} could not start the child process.`;
  if (suffix === 'EXIT_FAILED') return `${lead} received an unsuccessful exit from the child process.`;
  if (suffix === 'REGISTRY_ERROR') return `${lead} received an error while it accessed the container registry.`;
  if (suffix === 'REGISTRY_READ_FAILED') return `${lead} could not read the required response from the container registry.`;
  if (suffix === 'PROXY_FAILED') return `${lead} could not start or use the local proxy.`;
  if (suffix === 'CONTROLLER_FAILED') return `${lead} controller failed before it completed the requested change.`;
  if (suffix === 'LEASE_FAILED') return `${lead} could not acquire or maintain the required lease.`;
  if (suffix === 'TAR_FAILED') return `${lead} could not create or read the source archive.`;
  if (suffix === 'SOURCE_GIT_FAILED') return `${lead} could not read or verify the Git source.`;
  if (suffix === 'INITIALIZE_EXITED') return `${lead} exited before initialization completed.`;
  if (suffix === 'PROCESS_EXITED') return `${lead} process exited before it returned a complete result.`;
  if (suffix === 'BROKEN_PIPE') return `${lead} lost the data channel to its child process.`;
  if (suffix === 'FAILED' || suffix === 'ERROR' || suffix === 'EXITED') return object === 'operation'
    ? `${lead} failed before it produced a complete result.`
    : `${lead} could not complete ${object}.`;
  return `${lead} detected an invalid state while processing ${object}.`;
}
function diagnosis(code) {
  const cause = naturalCause(code);
  const { object, suffix } = errorParts(code);
  if (/_CANCELLED$/u.test(code)) return [cause, 'The operation stopped before complete evidence existed.', 'Confirm who requested cancellation. Check retained resources and partial evidence.', 'Start a new attempt only after cleanup or an intentional retention decision.'];
  if (/(?:_TIMEOUT|_TIMEOUT_EXCEEDED)$/u.test(code)) return [cause, 'The boundary did not produce complete trusted evidence.', 'Check dependency health and compare the limit with normal duration.', 'Retry after readiness is confirmed and the interrupted action is known to be retry-safe.'];
  if (/(?:_CLEANUP_FAILED|_RELEASE_FAILED)$/u.test(code)) return [cause, 'A resource, lease, or process can remain.', 'Use the recorded identity to inspect and finish cleanup. Keep the failure evidence.', 'Do not rerun until ownership and retained state are known.'];
  if (/(?:DIGEST|CHECKSUM|IDENTITY|PROVENANCE).*_MISMATCH|_CHANGED$/u.test(code)) return [cause, 'Buster rejects evidence that can belong to different input or state.', 'Restore the admitted object or submit a new attempt with the new identity.', 'Do not retry the same attempt with changed input.'];
  if (/_MISMATCH$/u.test(code)) return [cause, 'Buster cannot trust the object or result.', 'Compare the recorded expected and actual values. Restore one authoritative value.', 'Retry only after both sides use the same value.'];
  if (['NOT_ABSOLUTE', 'NOT_FILE', 'NOT_DIRECTORY', 'OUTSIDE_PROVIDER_ROOTS', 'OUTSIDE_REPOSITORY',
    'OUTSIDE_WORKSPACE', 'OVERLAPS_WORKSPACE', 'PATH_ESCAPE', 'SYMLINK'].includes(suffix)
    || (['DENIED', 'FORBIDDEN'].includes(suffix) && /(?:PATH|FILE|DIRECTORY|ROOT|WORKSPACE|SYMLINK)/u.test(code))) {
    return [cause, 'Buster did not cross its approved filesystem boundary.',
      'Use a regular file or directory inside the documented workspace or evidence root.',
      'Retry after the path and every parent link pass containment checks.'];
  }
  if (/(?:_DENIED|_FORBIDDEN)$/u.test(code)) return [cause, 'The requested capability, value, or target was not used.', 'Select an allowed value or change the owning policy through review.', 'An unchanged retry will fail again.'];
  if (code === 'TAILSCALE_EXPOSURE_PREDECESSORS_EXHAUSTED') return [cause,
    'The service cannot select an earlier lease without risking conflicting ownership.',
    'Keep all lease records. Inspect their owners, generations, states, and expiry times before recovery.',
    'Retry only after one authoritative lease can be selected or a new handoff is admitted.'];
  if (code === 'BUSTER_REMOTE_ADMISSION_FULL') return [cause,
    'Buster did not admit or start the new job.',
    'Wait for a queued job to start or cancel a job that is no longer required. Increase queue capacity only after a service-capacity review.',
    'Retry when the service has a free queue slot.'];
  if (code === 'BUSTER_REMOTE_CONCURRENCY_EXCEEDS_SERVICE_LIMIT') return [cause,
    'Buster did not admit the job with an unenforceable concurrency request.',
    'Reduce the job maximum concurrency to the published service limit.',
    'Retry with the corrected concurrency value.'];
  if (/(?:TOO_LARGE|LIMIT|LIMIT_EXCEEDED|BUDGET_EXCEEDED|CAPACITY_EXCEEDED|BYTES_EXCEEDED|FILE_LIMIT|OUTPUT_LIMIT|EXHAUSTED|EXCEEDED|FULL)$/u.test(code)) return [cause, 'Buster stopped before the named resource could exceed worker or service capacity.', 'Reduce the named input, output, concurrency, or resource use. Increase the limit only after a capacity review.', 'Retry with smaller work or an approved larger limit.'];
  if (code === 'BUSTER_FIXTURE_NOT_READY') return [cause,
    'Buster does not publish fixture readiness or start dependent tests.',
    'Inspect the provider outcome and case counts. Correct the fixture preparation failure first.',
    'Retry readiness only after the fixture provider returns a complete passing result.'];
  if (/(?:NOT_FOUND|UNAVAILABLE|NOT_READY|UNREACHABLE|MISSING|NOT_AVAILABLE|NOT_BUILT|NOT_RESOLVED|NOT_RETAINED)$/u.test(code)) return [cause, 'The dependent operation cannot produce trusted evidence.', 'Restore the named dependency or input and verify its identity and readiness.', 'Retry after an independent readiness check succeeds.'];
  if (/(?:EXPIRED|STALE)$/u.test(code)) return [cause, 'The old value cannot authorize this attempt.', 'Ask the owning component for fresh authority or evidence.', 'Retry only with the fresh value.'];
  if (suffix === 'FUTURE') return [cause, 'Buster cannot use evidence whose recorded time is not yet valid.',
    'Check the producing host clock and the source timestamp. Do not change the allowed age to hide clock drift.',
    'Retry with a correct clock and newly produced evidence.'];
  if (/_INVALID$/u.test(code)) {
    return [cause, 'Execution stopped before it could use invalid or ambiguous data.',
      `Read the diagnostic detail after the code. Compare ${object} with the exact constraint at the linked source line.`,
      'Retry only after the rejected value passes the same validation.'];
  }
  if (/(?:REQUIRED|UNSUPPORTED|DUPLICATE|AMBIGUOUS|INCOMPLETE|UNKNOWN|UNKNOWN_FIELD)$/u.test(code)) return [cause, 'Execution did not continue with ambiguous or unsafe data.', 'Correct the named field, input, or policy. Keep validation enabled.', 'Retry after the value passes the same contract check.'];
  if (/(?:FAILED|ERROR|EXITED|BROKEN_PIPE|TAMPERED)$/u.test(code)) return [cause, 'Buster cannot claim a complete trusted result.', 'Read the preserved cause and source. Inspect side effects before recovery.', 'Follow the provider retry rule only after side effects are known.'];
  if (['UNREADABLE', 'NOT_DURABLE', 'NOT_PRIVATE', 'TRAILING_DATA'].includes(suffix)) return [cause,
    'Buster cannot trust the stored or parsed state.',
    'Preserve the affected bytes and diagnostic detail. Restore the record from its authoritative owner.',
    'Retry only after an integrity check can read the complete authoritative state.'];
  if (['ALREADY_STARTED', 'ALREADY_TERMINAL', 'TERMINAL', 'SHUTTING_DOWN', 'SHUTDOWN', 'CONFLICT',
    'OWNED_BY_NOVA', 'NOT_COMPLETED', 'BEFORE_ADMISSION', 'READINESS_BEFORE_ADMISSION',
    'FENCED', 'IMMUTABLE', 'REPEATED', 'TEARDOWN_PENDING', 'CLOSED_BEFORE_TEARDOWN',
    'EXECUTION_INTERRUPTED'].includes(suffix)) return [cause,
    'The requested operation conflicts with the recorded lifecycle state.',
    'Keep the existing record. Identify its current owner and complete or reconcile that lifecycle first.',
    'Do not repeat the transition until the authoritative state permits it.'];
  if (suffix === 'NO_EXECUTED_CASES') return [cause,
    'The report cannot prove that the test command executed a case.',
    'Check test discovery, filters, prerequisites, and the original report before changing the requirement.',
    'Retry after the same command produces at least one executed case.'];
  if (suffix === 'ZERO_CASES') return [cause,
    'The report cannot prove that the test command discovered a case.',
    'Check test discovery, filters, report paths, and report-adapter input.',
    'Retry after the same command produces a report with at least one case.'];
  if (suffix === 'NOT_BOOTSTRAPPED') return [cause,
    'Buster is not ready to accept work.',
    'Keep the service out of traffic. Inspect durable recovery and configured dependency readiness.',
    'Retry readiness after recovery completes; do not submit a job before BUSTER_READY.'];
  if (code === 'BUSTER_COMPACTION_NO_BYTE_SAVING') return [cause,
    'Buster keeps the complete job record because compaction gives no storage benefit.',
    'Keep the original record. Inspect archive and metadata sizes only if unexpected growth requires investigation.',
    'Do not retry unchanged input. Retry only after record content or compaction rules change.'];
  if (suffix === 'EMPTY') return [cause,
    'The provider has no usable input for the requested check.',
    'Supply the required catalogue, selection, search path, or evidence content named by the code.',
    'Retry only after the input contains a usable value.'];
  if (['NESTED', 'IN_CASE'].includes(suffix) || code === 'JUNIT_XML_TEXT_OUTSIDE_ROOT') return [cause,
    'The document structure is ambiguous or violates the accepted format.',
    'Correct the source document structure at the linked validation boundary.',
    'Retry after the same parser accepts the corrected document.'];
  if (suffix === 'REQUIRE_TLS') return [cause,
    'Buster did not send registry credentials over an unencrypted connection.',
    'Use an HTTPS registry endpoint with a trusted certificate, or remove credentials from this request.',
    'Retry only after the endpoint uses TLS or the request no longer carries credentials.'];
  if (suffix === 'NOT_USED') return [cause,
    'The declared input did not affect the prepared fixture.',
    'Correct the manifest or remove the unused declaration so that evidence matches actual use.',
    'Retry after the prepared resource uses the declared input.'];
  if (suffix === 'REJECTED') return [cause,
    'The owning controller did not accept the requested lease or state transition.',
    'Read the retained controller status and correct the stated policy, ownership, or readiness condition.',
    'Retry only after the rejection condition changes.'];
  if (suffix === 'CYCLE') return [cause,
    'Buster stopped before recursive references could produce ambiguous or unbounded input.',
    'Remove the reference or alias cycle. Keep each dependency chain finite.',
    'Retry after validation confirms that the graph has no cycle.'];
  if (suffix === 'UNSAFE') return [cause,
    'The selected value would weaken an enforced safety or isolation boundary.',
    'Select a value that meets the policy. Change the policy only through an explicit review.',
    'An unchanged retry will fail again.'];
  if (suffix === 'ZERO_TESTS') return [cause,
    'The test run produced no test execution evidence.',
    'Check test discovery, filters, projects, and prerequisites.',
    'Retry after the same test command discovers and runs at least one test.'];
  if (suffix === 'TRUNCATED') return [cause,
    'Buster cannot trust an incomplete archive or evidence object.',
    'Produce the object again and verify its size and digest before submission.',
    'Retry only with a complete object.'];
  if (['GRANULARITY', 'LIMIT_EXCEEDS_CONTRACT', 'INCOMPATIBLE', 'TOO_LOW', 'TOO_BROAD'].includes(suffix)) return [cause,
    'The runtime cannot enforce the requested setting safely.',
    'Choose a documented value within the supported range and runtime constraints.',
    'Retry after configuration validation accepts the new value.'];
  if (['NOT_DELEGATED', 'NOT_ISOLATED'].includes(suffix)) return [cause,
    'The runtime did not start the test without the required operating-system isolation.',
    'Restore cgroup delegation or select an execution environment that provides the required isolation.',
    'Retry only after the isolation preflight succeeds.'];
  if (suffix === 'RESERVED') return [cause,
    'The supplied identity can conflict with an identity that Buster owns.',
    'Choose a non-reserved identity that follows the documented naming contract.',
    'Retry with the new identity.'];
  if (['CLOSED', 'TERMINATED', 'UNAWAITED_CAPABILITIES'].includes(suffix)) return [cause,
    'The provider process ended before all requested work and evidence were complete.',
    'Inspect retained process output, capability requests, and possible side effects before recovery.',
    'Retry only after cleanup completes and the interrupted operation is known to be retry-safe.'];
  if (suffix === 'DEADLOCK') return [cause,
    'The plan still has unfinished nodes, but no node can become runnable.',
    'Inspect predecessor outcomes, link conditions, and concurrency groups. Correct the blocked plan graph.',
    'Retry with a plan that gives every unfinished node a reachable state.'];
  if (suffix === 'UNCERTAIN') return [cause,
    'Buster cannot prove whether the external or durable operation completed.',
    'Preserve all records and reconcile the authoritative external state before any new action.',
    'Do not retry until reconciliation proves that repetition is safe.'];
  return [cause, 'The boundary did not produce a trusted result.', 'Use the preserved cause and source link to inspect the named condition.', 'Confirm attempt state and retry safety before a new attempt.'];
}

const sourceLink = ({ file, line }) => `[${path.basename(file)}:${line}](https://github.com/datrab/kubeclaw/blob/${revision}/${file}#L${line})`;
const grouped = new Map();
for (const code of [...locations.keys()].sort()) {
  const title = groupFor(code); const codes = grouped.get(title) ?? []; codes.push(code); grouped.set(title, codes);
}
const groupOrder = [...groupDefinitions.map(([title]) => title), 'Shared Buster Runtime'];
const lines = [
  '# Buster Error Code Reference', '', 'Status: generated reference',
  'Audience: pipeline author, operator, test maintainer', 'Owner: buster',
  'Evidence: scripts/generate-buster-error-reference.mjs',
  'Source inventory: production files under `skills/buster/engine` and `skills/buster/plugins/*/src`',
  `Evidence revision: \`${revision}\``,
  'Applies to: stable uppercase error codes constructed by the shipped Buster engine, providers, and execution adapters',
  'Last verified: generated from the complete production source inventory on 2026-09-20', '',
  '## How To Use This Reference', '',
  'Find the stable code at the start of the error message. Text after the first',
  'colon is diagnostic detail and is not part of the code. The table separates the',
  'cause, effect, corrective action, and retry rule. Keep the complete message,',
  'preserved cause, attempt identity, and attempt state with the code.', '',
  'A failed test assertion is a normal provider result with findings. These codes',
  'identify rejected contracts, unavailable authority, interrupted execution,',
  'unsafe output, or failed evidence handling. Do not convert them into findings.', '',
  'The generator discovers production source files. It inventories every stable',
  'uppercase diagnostic literal in runtime code. This includes exceptions, HTTP',
  'errors, negative readiness codes, result fields, summaries, and helper arguments.',
  'It also follows local `Error` and `AggregateError` helpers and expands finite',
  'dynamic process, limit, path, and file-size families.', '',
  'A literal is absent only when the audited exclusion table identifies it as a',
  'success value, an internal control signal, a construction label, or an HTTP',
  'classifier. A generator assertion requires every runtime literal to be in the',
  'reference or in that table. Tests, declarations, CLI usage text, and diagnostic',
  'text after the first colon remain outside the inventory.', '',
  '## Audited Non-Error Literals', '',
  'These production literals match the code syntax but are not emitted error',
  'identities. The generator verifies that each literal still exists and remains',
  'excluded from the error tables.', '',
  '| Literal | Exclusion reason | Source |',
  '| --- | --- | --- |',
];
for (const [code, reason] of [...excludedLiteralCodes].sort(([a], [b]) => a.localeCompare(b))) {
  const evidence = (literalLocations.get(code) ?? []).slice(0, 3).map(sourceLink).join('<br>');
  lines.push(`| \`${code}\` | ${reason} | ${evidence} |`);
}
lines.push('');
for (const title of groupOrder) {
  const codes = grouped.get(title); if (!codes?.length) continue;
  lines.push(`## ${title}`, '', '| Stable code | Likely cause | Effect | Safe action | Retry rule | Source |',
    '| --- | --- | --- | --- | --- | --- |');
  for (const code of codes) {
    const evidence = [...locations.get(code).values()].slice(0, 3).map(sourceLink).join('<br>');
    lines.push(`| \`${code}\` | ${diagnosis(code).join(' | ')} | ${evidence} |`);
  }
  lines.push('');
}
lines.push('## Errors Outside This Inventory', '',
  'A dependency can include diagnostic text in its message. A separately installed',
  'plugin can also return a private failure. Those values are not shipped Buster',
  'codes unless production source in the scope above constructs them. Plan',
  'resolution, Worker Core, Nova evidence import, and namespace reconciliation have',
  'separate authorities. Use the family table in the',
  '[suite reference](buster-suites.md#error-codes-and-safe-actions).', '',
  '## Maintenance Rule', '', 'Change the implementation first. Then run',
  '`node scripts/generate-buster-error-reference.mjs --write`. The generator finds',
  'new production files automatically and fails when a known dynamic family changes.',
  'Review each changed code, diagnosis class, and source before publication.', '');

const output = `${lines.join('\n')}\n`;
assert(output.includes('`TAILSCALE_EXPOSURE_ROLLBACK_FAILED`'),
  'the generated reference must include AggregateError rollback failures');
assert(output.includes('`BUSTER_REMOTE_TERMINAL_STATUS_UNREADABLE`'),
  'the generated reference must include AggregateError terminal-read failures');
assert(!output.includes('does not satisfy its contract'),
  'generated causes must explain the invalid condition without a generic contract restatement');
assert(!/\b(?:arguments|bytes|counts|credentials|fields|files|headers|limits|paths|predecessors|prefixes|steps|workers) does\b/u.test(output),
  'generated causes contain a plural-subject grammar error');
assert(!/\b(?:arguments|bytes|counts|credentials|details|entries|fields|files|findings|headers|limits|links|methods|operations|origins|outputs|paths|ports|predecessors|prefixes|profiles|reports|resources|results|routes|roots|steps|tests|values|workers) because (?:it|its)\b/u.test(output),
  'generated causes contain a plural-object pronoun error');
assert(!output.includes('because its value, type, or structure is invalid'),
  'generated invalid-value causes must name the applicable validation class');
const unclassifiedInvalidCodes = [...output.matchAll(/\| `([^`]+)` \| [^|]*At least one value has the wrong type, format, range, or structure\./gu)]
  .map((match) => match[1]);
assert.equal(unclassifiedInvalidCodes.length, 0,
  `every current INVALID code must map to a specific validation class: ${unclassifiedInvalidCodes.join(', ')}`);
assert(!output.includes('detected an invalid state while processing'),
  'every current nonstandard diagnostic suffix must have an explicit explanation');
assert(!output.includes('The boundary did not produce a trusted result.'),
  'every current diagnostic must have a specific effect, action, and retry class');
const awkwardFailurePhrases = output.match(/could not complete (?:registry|standard error|standard input|standard output|controller|proxy|exit|spawn|tar|initialize|process)[^.|]*/gu) ?? [];
assert.equal(awkwardFailurePhrases.length, 0,
  `generated causes must describe the failed operation in natural language: ${[...new Set(awkwardFailurePhrases)].join(', ')}`);
assert(!output.includes('rejected operation because it exceeds'),
  'generated limit causes must identify the limited resource');
if (process.argv.includes('--write')) {
  fs.writeFileSync(target, output);
  console.log(`wrote ${path.relative(root, target)} (${locations.size} stable codes from ${productionFiles.length} production files)`);
} else {
  assert(fs.existsSync(target), 'generated Buster error reference is missing');
  assert.equal(fs.readFileSync(target, 'utf8'), output,
    'generated Buster error reference is stale; run node scripts/generate-buster-error-reference.mjs --write');
  console.log(`Buster error reference verified: ${grouped.size} groups, ${locations.size} stable codes, ${productionFiles.length} production files`);
}
