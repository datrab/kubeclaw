import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { validateDeclarations } = await import(pathToFileURL(path.resolve('dist/stage.js')).href);
const base = {
  moduleId: 'web',
  modulePath: 'modules/web',
  ownedPaths: ['docker/Dockerfile', 'api/openapi.yaml'],
  serveDockerfile: 'docker/Dockerfile',
  apiSpecFile: 'api/openapi.yaml',
};
assert.deepEqual(validateDeclarations(base, 'Deliver Dockerfile and openapi.yaml'), []);
assert.deepEqual(
  validateDeclarations({ ...base, ownedPaths: [], serveDockerfile: 'runtime/Dockerfile' }, 'Deliver openapi.yaml'),
  [],
);
assert.deepEqual(
  validateDeclarations(base, 'No declared outputs').map(({ code }) => code),
  ['preflight_contract.serve_dockerfile_not_declared', 'preflight_contract.api_spec_not_declared'],
);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.preflight-contract', suite: 'unit' }));
