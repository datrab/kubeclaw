import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const legacy = await import(pathToFileURL(path.join(repository, 'skills/nova/pipeline/services/validation.ts')).href);
const replacement = await import(pathToFileURL(path.resolve('dist/stage.js')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-preflight-parity-'));
const modules = path.join(temporary, 'modules');

function legacyCodes(content: string, input: {
  readonly ownedPaths: readonly string[];
  readonly serveDockerfile: string | null;
  readonly apiSpecFile: string | null;
}): readonly string[] {
  const moduleDir = 'fixture';
  fs.mkdirSync(path.join(modules, moduleDir), { recursive: true });
  fs.writeFileSync(path.join(modules, moduleDir, 'FORGE.md'), content);
  return legacy.runPreflightValidation({
    dir: moduleDir,
    owned_paths: [...input.ownedPaths],
    test_config: {
      serve: input.serveDockerfile ? { dockerfile: input.serveDockerfile } : {},
      api: input.apiSpecFile ? { spec_file: input.apiSpecFile } : {},
    },
  }, moduleDir, { paths: { modules_dir: modules } }).failures.map((failure: { code: string }) => failure.code);
}

function replacementCodes(content: string, input: {
  readonly ownedPaths: readonly string[];
  readonly serveDockerfile: string | null;
  readonly apiSpecFile: string | null;
}): readonly string[] {
  return replacement.validateDeclarations(input, content).map((failure: { code: string }) => failure.code);
}

const cases = [
  {
    name: 'declared artifacts pass',
    content: 'Deliver Dockerfile and openapi.yaml.\n',
    input: { ownedPaths: ['docker/Dockerfile'], serveDockerfile: 'docker/Dockerfile', apiSpecFile: 'api/openapi.yaml' },
    legacy: [],
    replacement: [],
  },
  {
    name: 'owned Dockerfile remains required',
    content: 'Deliver the API.\n',
    input: { ownedPaths: ['docker/Dockerfile'], serveDockerfile: 'docker/Dockerfile', apiSpecFile: null },
    legacy: ['SERVE_DOCKERFILE_NOT_DECLARED'],
    replacement: ['preflight_contract.serve_dockerfile_not_declared'],
  },
  {
    name: 'runtime-only Dockerfile remains optional',
    content: 'No container deliverable.\n',
    input: { ownedPaths: [], serveDockerfile: 'runtime/Dockerfile', apiSpecFile: null },
    legacy: [],
    replacement: [],
  },
  {
    name: 'API specification remains required',
    content: 'Deliver the service.\n',
    input: { ownedPaths: [], serveDockerfile: null, apiSpecFile: 'api/openapi.yaml' },
    legacy: ['API_SPEC_NOT_DECLARED'],
    replacement: ['preflight_contract.api_spec_not_declared'],
  },
] as const;

try {
  for (const scenario of cases) {
    assert.deepEqual(legacyCodes(scenario.content, scenario.input), scenario.legacy, `${scenario.name}: legacy`);
    assert.deepEqual(replacementCodes(scenario.content, scenario.input), scenario.replacement, `${scenario.name}: replacement`);
    assert.equal(
      legacyCodes(scenario.content, scenario.input).length === 0,
      replacementCodes(scenario.content, scenario.input).length === 0,
      `${scenario.name}: pass/fail parity`,
    );
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.preflight-contract', suite: 'legacy-parity' }));
