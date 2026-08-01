import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { buildArchitectureRequest } = await import(pathToFileURL(path.resolve('dist/protocol.js')).href);
const { parseArchitectureOutput } = await import(pathToFileURL(path.resolve('dist/output.js')).href);
const request = buildArchitectureRequest('architect', { task: 'validate' }, null);
assert.equal(request.protocol, 'kubeclaw.architecture-validation.v2');
assert.match(request.task, /Judge only software architecture/);
assert.match(request.task, /domain models and integration boundaries/);
assert.match(request.task, /validated by core and deterministic preflight stages/);

assert.equal(parseArchitectureOutput({ result: {
  verdict: 'passed', summary: 'valid', findings: [], checkedFiles: ['docs/architecture.md'],
} }).verdict, 'passed');

const warning = {
  id: 'ARCHITECTURE_BOUNDARY_RISK',
  severity: 'warn',
  scope: 'integration_boundary',
  paths: ['src/api.ts'],
  explanation: 'The integration boundary is unclear.',
  remediation: 'Declare the API owner.',
};
assert.equal(parseArchitectureOutput({ result: {
  verdict: 'passed', summary: 'needs operator review', findings: [warning], checkedFiles: ['src/api.ts'],
} }).findings[0].scope, 'integration_boundary');
assert.equal(parseArchitectureOutput({ result: {
  verdict: 'passed',
  summary: 'requires operator decision',
  findings: [{ ...warning, severity: 'error' }],
  checkedFiles: ['src/api.ts'],
} }).verdict, 'passed');

assert.throws(() => parseArchitectureOutput({ result: {
  verdict: 'passed', summary: 'contradiction', findings: [{ ...warning, severity: 'blocking' }], checkedFiles: ['x'],
} }), /contradicts/);
assert.throws(() => parseArchitectureOutput({ result: {
  verdict: 'request_fix', summary: 'missing', findings: [], checkedFiles: [],
} }), /verdict is invalid/);
assert.throws(() => parseArchitectureOutput({ result: {
  verdict: 'blocked',
  summary: 'invented scope',
  findings: [{ ...warning, severity: 'blocking', scope: 'execution_metadata' }],
  checkedFiles: ['x'],
} }), /scope is invalid/);
assert.throws(() => parseArchitectureOutput({ result: {
  verdict: 'blocked',
  summary: 'not blocking',
  findings: [{ ...warning, severity: 'error' }],
  checkedFiles: ['x'],
} }), /requires a blocking finding/);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.architecture-validator', suite: 'protocol-unit' }));
