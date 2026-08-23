import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'container-build-provider-'));
try {
  const repository = path.join(root, 'repository'); const scratch = path.join(root, 'scratch'); const evidence = path.join(root, 'evidence');
  for (const directory of [repository, scratch, evidence]) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(repository, 'Dockerfile'), 'FROM scratch\n');
  const invocation: any = { attemptId: 'attempt:aaaaaaaa', moduleId: 'app', nodeId: 'build', workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' },
    configuration: { values: { buildContext: '.', definition: { type: 'dockerfile', dockerfile: 'Dockerfile' } } },
    limits: { logBytes: 1024 }, timeoutMs: 1000 };
  let request: any;
  const result = await provider().execute(invocation, { workspaceRoot: root, log() {}, async invoke(capability: string, value: any) {
    assert.equal(capability, 'container.build'); request = value;
    return { ok: true, registryImage: 'registry.local/apps/app:run', immutableImage: `registry.local/apps/app@sha256:${'a'.repeat(64)}`,
      digest: `sha256:${'a'.repeat(64)}`, durationMs: 4, stdout: 'built\n', stderr: '' };
  } });
  assert.equal(result.outcome, 'passed'); assert.equal(result.outputs[0].name, 'image');
  assert.equal(request.payload.definitionIdentity, 'dockerfile:Dockerfile');
  const template = await provider().execute({ ...invocation, configuration: { values: { buildContext: '.', definition: { type: 'template', template: 'node-static@1' } } } },
    { workspaceRoot: root, log() {}, async invoke(_capability: string, value: any) { assert.match(value.payload.definitionIdentity, /^template:node-static@1:sha256:/u);
      return { ok: false, errorCode: 'BUILD_FAILED', message: 'expected', durationMs: 1 }; } });
  assert.equal(template.outcome, 'failed');
  await assert.rejects(() => provider().execute({ ...invocation, configuration: { values: { buildContext: '..', definition: { type: 'dockerfile', dockerfile: 'Dockerfile' } } } },
    { workspaceRoot: root, log() {}, async invoke() { return {}; } }), /CONTAINER_BUILD_PATH_INVALID/u);
  for (const name of ['password', 'api_key', 'apiKey', 'CREDENTIAL']) {
    const protectedArgument = { ...invocation, configuration: { values: { buildContext: '.',
      definition: { type: 'dockerfile', dockerfile: 'Dockerfile', buildArgs: { [name]: 'not-allowed' } } } } };
    await assert.rejects(() => provider().execute(protectedArgument,
      { workspaceRoot: root, log() {}, async invoke() { return {}; } }), /CONTAINER_BUILD_ARGUMENT_INVALID/u);
  }
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, provider: 'container-build', definitions: ['dockerfile', 'node-static@1'] }));
