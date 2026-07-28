import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { buildArchitectureRequest } = await import(pathToFileURL(path.resolve('dist/protocol.js')).href);
const { parseArchitectureOutput } = await import(pathToFileURL(path.resolve('dist/output.js')).href);
assert.equal(buildArchitectureRequest('architect', { task: 'validate' }, null).protocol, 'kubeclaw.architecture-validation.v2');
assert.equal(parseArchitectureOutput({ result: {
  verdict: 'passed', summary: 'valid', findings: [], checkedFiles: ['docs/architecture.md'],
} }).verdict, 'passed');
assert.throws(() => parseArchitectureOutput({ result: {
  verdict: 'passed', summary: 'contradiction', findings: ['bad'], checkedFiles: ['x'],
} }), /contradicts/);
assert.throws(() => parseArchitectureOutput({ result: {
  verdict: 'request_fix', summary: 'missing', findings: [], checkedFiles: [],
} }), /requires findings/);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.architecture-validator', suite: 'protocol-unit' }));
