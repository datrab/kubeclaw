import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'container-build-provider-'));
try {
  const repository = path.join(root, 'repository');
  const scratch = path.join(root, 'scratch');
  const evidence = path.join(root, 'evidence');
  for (const directory of [repository, scratch, evidence]) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(repository, 'Dockerfile'), 'FROM scratch\n');
  const invocation: any = { attemptId: 'attempt:aaaaaaaa', moduleId: 'app', nodeId: 'build',
    workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' },
    configuration: { values: { buildContext: '.', definition: { type: 'dockerfile', dockerfile: 'Dockerfile' } } },
    limits: { logBytes: 1024 }, timeoutMs: 1000 };
  const guard = { workspaceRoot: root, log() {}, async invoke() {
    throw new Error('negative validation reached the capability boundary');
  } };

  assert.equal(typeof provider().execute, 'function');
  // Observe original consumer selection, then stop at the capability boundary.
  // This does not execute BuildKit or return a synthetic image result.
  const selected: any[] = [];
  const observe = { ...guard, async invoke(capability: string, request: any) {
    assert.equal(capability, 'container.build');
    selected.push(request);
    throw new Error('CONTAINER_BUILD_SELECTION_PROBE_STOP');
  } };
  await assert.rejects(() => provider().execute({ ...invocation, moduleId: 'Module / Alpha' }, observe),
    /CONTAINER_BUILD_SELECTION_PROBE_STOP/u);
  assert.equal(selected[0].payload.platform, 'linux/amd64');
  assert.equal(selected[0].payload.outputName, 'module---alpha');
  await assert.rejects(() => provider().execute({ ...invocation, moduleId: undefined, nodeId: 'Node / Beta' }, observe),
    /CONTAINER_BUILD_SELECTION_PROBE_STOP/u);
  assert.equal(selected[1].payload.outputName, 'node---beta');
  await assert.rejects(() => provider().execute({ ...invocation, configuration: { values: {
    ...invocation.configuration.values, outputName: 'selected-name', platform: 'linux/arm64',
  } } }, observe), /CONTAINER_BUILD_SELECTION_PROBE_STOP/u);
  assert.equal(selected[2].payload.outputName, 'selected-name');
  assert.equal(selected[2].payload.platform, 'linux/arm64');
  await assert.rejects(() => provider().execute({ ...invocation, configuration: { values: {
    ...invocation.configuration.values, outputName: '',
  } } }, guard), /CONTAINER_BUILD_OUTPUT_NAME_INVALID/u);
  await assert.rejects(() => provider().execute({ ...invocation, configuration: { values: {
    ...invocation.configuration.values, platform: '',
  } } }, guard), /CONTAINER_BUILD_PLATFORM_INVALID/u);
  await assert.rejects(() => provider().execute({ ...invocation,
    configuration: { values: { buildContext: '..', definition: { type: 'dockerfile', dockerfile: 'Dockerfile' } } } },
  guard), /CONTAINER_BUILD_PATH_INVALID/u);
  await assert.rejects(() => provider().execute({ ...invocation,
    configuration: { values: { buildContext: '.', definition: { type: 'template', template: 'unknown@1' } } } },
  guard), /CONTAINER_BUILD_TEMPLATE_UNKNOWN/u);
  for (const name of ['password', 'api_key', 'apiKey', 'CREDENTIAL']) {
    const protectedArgument = { ...invocation, configuration: { values: { buildContext: '.',
      definition: { type: 'dockerfile', dockerfile: 'Dockerfile', buildArgs: { [name]: 'not-allowed' } } } } };
    await assert.rejects(() => provider().execute(protectedArgument, guard), /CONTAINER_BUILD_ARGUMENT_INVALID/u);
  }
  const source = fs.readFileSync(path.join(import.meta.dirname, '../src/provider.js'), 'utf8');
  assert.match(source, /context\.invoke\('container\.build'/u);
  assert.match(source, /schemaVersion: 'container-image\.v1'/u);
  assert.match(source, /'node-static@1'/u);
  assert.doesNotMatch(source, /mock|fake|emulator/iu);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, provider: 'container-build', validation: 'real-files',
  acceptance: 'verify:test-gate:container-build-live', mocks: 0, emulators: 0 }));
