import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../../../..');
const config = path.join(repoRoot, 'charts/kubeclaw/files/config/eslint-type-evidence-config.mjs');
const testConfig = path.join(repoRoot, 'charts/kubeclaw/files/config/eslint-type-evidence-tests-config.mjs');
const auditConfig = (await import(pathToFileURL(config).href)).default;
const testAuditConfig = (await import(pathToFileURL(testConfig).href)).default;

assert.deepEqual(Object.keys(auditConfig[0]), ['ignores'], 'audit exclusions must remain global flat-config ignores');
assert.deepEqual(Object.keys(testAuditConfig[0]), ['ignores'], 'test audit exclusions must remain global flat-config ignores');

function lint(filename, source, selectedConfig = config) {
  const directory = fs.mkdtempSync(path.join(packageRoot, 'src/eslint-type-evidence-fixture-'));
  const file = path.join(directory, filename);
  fs.writeFileSync(file, source);
  try {
    const result = childProcess.spawnSync('eslint', ['--format', 'json', '--config', selectedConfig, file], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
    });
    assert.notEqual(result.error?.code, 'ENOENT', 'eslint must be installed for type-evidence verification');
    assert.equal(result.status, 0, result.stderr || `unexpected eslint status ${result.status}`);
    return JSON.parse(result.stdout)[0].messages.map((message) => message.ruleId);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function evidenceRules(filename, source) {
  return lint(filename, source).filter((ruleId) => ruleId?.startsWith('type-evidence/'));
}

assert.deepEqual(evidenceRules('chained.ts', 'interface User { id: string }\ndeclare const input: unknown;\nconst user = input as object as User;\n'), [
  'type-evidence/no-chained-type-assertions',
]);
assert.deepEqual(evidenceRules('single-assertion.ts', 'interface User { id: string }\ndeclare const input: unknown;\nconst user = input as User;\n'), []);
assert.deepEqual(
  lint('chained.test.ts', 'interface User { id: string }\ndeclare const input: unknown;\nconst user = input as object as User;\n', testConfig),
  ['type-evidence/no-chained-type-assertions'],
);

assert.deepEqual(evidenceRules('object-parameter.ts', 'export function save(value: object): void { void value; }\n'), [
  'type-evidence/no-object-parameters',
]);
assert.deepEqual(evidenceRules('object-method.ts', 'interface Store { save(value: object): void }\n'), [
  'type-evidence/no-object-parameters',
]);
assert.deepEqual(evidenceRules('object-constructor.ts', 'interface Service {}\ninterface Factory { new (options: object): Service }\n'), [
  'type-evidence/no-object-parameters',
]);
assert.deepEqual(evidenceRules('typed-parameter.ts', 'interface Value { id: string }\nexport function save(value: Value): void { void value; }\n'), []);

assert.deepEqual(evidenceRules('module-mock.ts', 'vi.mock("./store.js");\n'), ['type-evidence/no-module-mocking']);
assert.deepEqual(evidenceRules('module-do-mock.ts', 'jest.doMock("./store.js");\n'), ['type-evidence/no-module-mocking']);
assert.deepEqual(evidenceRules('function-mock.ts', 'const operation = vi.fn();\nvoid operation;\n'), []);
assert.deepEqual(evidenceRules('domain-mock.ts', 'store.mock("entry");\n'), []);
assert.deepEqual(evidenceRules('local-vi.ts', 'const vi = { mock(value: string) { return value; } };\nvi.mock("entry");\n'), []);
assert.deepEqual(evidenceRules('imported-vi.ts', 'import { vi as testApi } from "vitest";\ntestApi.mock("./store.js");\n'), [
  'type-evidence/no-module-mocking',
]);

assert.deepEqual(evidenceRules('known-value.ts', 'type Handler = () => void;\nconst handlers: Record<string, Handler> = { start() {} };\n'), [
  'type-evidence/no-known-value-widening',
]);
assert.deepEqual(evidenceRules('known-readonly-value.ts', 'type Handler = () => void;\nconst handlers: Readonly<Record<string, Handler>> = { start() {} };\n'), [
  'type-evidence/no-known-value-widening',
]);
assert.deepEqual(evidenceRules('hybrid-dictionary.ts', 'type Handler = () => void;\nconst handlers: { start: Handler; [key: string]: Handler } = { start() {} };\nhandlers.start();\n'), []);
assert.deepEqual(evidenceRules('numeric-dictionary.ts', 'type Handler = () => void;\nconst handlers: { [key: number]: Handler } = { 0() {} };\nhandlers[0]();\n'), []);
assert.deepEqual(evidenceRules('known-satisfies.ts', 'type Handler = () => void;\nconst handlers = { start() {} } satisfies Record<string, Handler>;\n'), []);
assert.deepEqual(evidenceRules('exported-return.ts', 'type Handler = () => void;\nexport function handlers(): Record<string, Handler> { return { start() {} }; }\n'), []);
assert.deepEqual(evidenceRules('exported-dictionary.ts', 'type Handler = () => void;\nexport const handlers: Record<string, Handler> = { start() {} };\n'), []);
assert.deepEqual(evidenceRules('separately-exported-dictionary.ts', 'type Handler = () => void;\nconst handlers: Record<string, Handler> = { start() {} };\nexport { handlers };\n'), []);
assert.deepEqual(evidenceRules('undeclared-static-read.ts', 'const handlers: Record<string, () => void> = { start() {} };\nhandlers.stop();\n'), []);
assert.deepEqual(evidenceRules('empty-accumulator.ts', 'const handlers: Record<string, () => void> = {};\nhandlers.start = () => {};\n'), []);
assert.deepEqual(evidenceRules('dynamic-accumulator.ts', 'const handlers: Record<string, () => void> = { start() {} };\ndeclare const name: string;\nhandlers[name] = () => {};\n'), []);
assert.deepEqual(evidenceRules('property-accumulator.ts', 'const handlers: Record<string, () => void> = { start() {} };\nhandlers.stop = () => {};\n'), []);
assert.deepEqual(evidenceRules('dynamic-read.ts', 'const handlers: Record<string, () => void> = { start() {} };\ndeclare const name: string;\nhandlers[name]?.();\n'), []);
assert.deepEqual(evidenceRules('assigned-accumulator.ts', 'const handlers: Record<string, () => void> = { start() {} };\nObject.assign(handlers, { stop() {} });\n'), []);
assert.deepEqual(evidenceRules('reflected-accumulator.ts', 'const handlers: Record<string, () => void> = { start() {} };\nReflect.set(handlers, "stop", () => {});\n'), []);
assert.deepEqual(evidenceRules('aliased-accumulator.ts', 'const handlers: Record<string, () => void> = { start() {} };\nconst alias = handlers;\nalias.stop = () => {};\n'), []);

assert.deepEqual(evidenceRules('unknown-return.ts', 'export function load(): unknown { return {}; }\n'), [
  'type-evidence/no-unknown-returns',
]);
assert.deepEqual(evidenceRules('unknown-promise.ts', 'export async function load(): Promise<unknown> { return {}; }\n'), [
  'type-evidence/no-unknown-returns',
]);
assert.deepEqual(evidenceRules('unknown-constructor.ts', 'type Factory = new () => unknown;\n'), [
  'type-evidence/no-unknown-returns',
]);
assert.deepEqual(evidenceRules('unknown-input.ts', 'export function parse(input: unknown): string { return String(input); }\n'), []);

assert.deepEqual(evidenceRules('unknown-alias.ts', 'type ExternalValue = unknown;\n'), [
  'type-evidence/no-unknown-type-aliases',
]);
assert.deepEqual(evidenceRules('named-contract.ts', 'interface ExternalValue { id: string }\n'), []);

assert.deepEqual(evidenceRules('widen-assert.ts', 'interface User { id: string }\nconst loaded: User = { id: "1" };\nconst stored: unknown = loaded;\nconst user = stored as User;\n'), [
  'type-evidence/no-widen-then-assert',
]);
assert.deepEqual(evidenceRules('widen-angle-assert.ts', 'interface User { id: string }\nconst loaded: User = { id: "1" };\nconst stored: unknown = loaded;\nconst user = <User>stored;\n'), [
  'type-evidence/no-widen-then-assert',
]);
assert.deepEqual(evidenceRules('widen-no-assert.ts', 'interface User { id: string }\nconst loaded: User = { id: "1" };\nconst stored: unknown = loaded;\nvoid stored;\n'), []);
assert.deepEqual(evidenceRules('direct-value.ts', 'interface User { id: string }\nconst loaded: User = { id: "1" };\nconst user: User = loaded;\nvoid user;\n'), []);

assert.ok(lint('unsafe-assertion.ts', 'interface User { id: string }\ndeclare const input: unknown;\nconst user = input as User;\n').includes(
  '@typescript-eslint/no-unsafe-type-assertion',
));

const emptyRepository = fs.mkdtempSync(path.join(packageRoot, 'src/eslint-type-evidence-empty-'));
try {
  const { TOOL_ADAPTERS } = await import('../src/engine/tool-registry.ts');
  const adapter = TOOL_ADAPTERS.find(({ id }) => id === 'eslint-type-evidence-tests');
  const emptyResult = adapter.run({
    repoRoot: emptyRepository,
    modulePath: null,
    changedFilesRequested: false,
    policyProject: { root: '.' },
    policy: { global_exclusions: [] },
    tool: {
      id: 'eslint-type-evidence-tests',
      config_path: testConfig,
      targets: ['.'],
      include: ['**/*.ts'],
      exclude: [],
      timeout_ms: 120_000,
    },
  });
  assert.deepEqual(emptyResult, { errors: 0, warnings: 0, findings: [] });
} finally {
  fs.rmSync(emptyRepository, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, suite: 'eslint-type-evidence-rules' }));
