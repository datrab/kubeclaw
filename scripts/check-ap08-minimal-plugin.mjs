#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const fixtureRoot = path.join(root, 'docs/site/extend/examples/minimal-stage');
const guidePath = path.join(root, 'docs/site/extend/first-plugin.md');
const guide = fs.readFileSync(guidePath, 'utf8');
const core = await import(pathToFileURL(path.join(root, 'skills/nova/core/src/index.ts')).href);
const { prepareRuntime } = await import(pathToFileURL(path.join(root, 'skills/nova/core/execution/engine-runtime.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ap08-minimal-plugin-'));
const installationRoot = path.join(temporary, 'plugins');
const installedPackage = path.join(installationRoot, 'minimal-stage');
const storageRoot = path.join(temporary, 'state');

for (const text of [
  '## Objective',
  '## Scope Boundary',
  '## Prerequisites',
  '## Procedure',
  '## Expected Result',
  '## Verification',
  '## Common Failures',
  '## Recovery',
  '### 2. Observe The Missing Role Ownership Failure',
  '### 4. Build And Inspect A Nova Runtime Bundle',
  '### 5. Run The Complete Local Activation Journey',
  'nova omits its plugin: example.greeting',
  '"roleOmission":"rejected"',
  '"successFact":"Hello, KubeClaw!"',
  '"intentionalFailure":"failed"',
  '"removal":"stage-owner-missing"',
  'Do not remove a released bundle that a nonterminal run still needs for recovery.',
  'It does not explain `.swarm/pipeline.json`',
  'It is not a project file, a reusable pipeline example, or',
  'Do not copy the in-memory test definition as a `.swarm/pipeline.json` file.',
]) assert(guide.includes(text), `minimal-plugin guide lacks required content: ${text}`);

for (const relative of [
  'examples/minimal-stage/plugin.json',
  'examples/minimal-stage/package.json',
  'examples/minimal-stage/schemas/config.schema.json',
  'examples/minimal-stage/schemas/input.schema.json',
  'examples/minimal-stage/schemas/result.schema.json',
  'examples/minimal-stage/src/stage.js',
  'examples/minimal-stage/tests/stage.test.mjs',
]) assert(guide.includes(`](${relative})`), `minimal-plugin guide lacks fixture link: ${relative}`);

const manifestBlocks = [...guide.matchAll(/```json\n([\s\S]+?)\n```/gu)];
assert.equal(manifestBlocks.length, 1, 'minimal-plugin guide must contain one canonical JSON manifest block');
assert.deepEqual(JSON.parse(manifestBlocks[0][1]), JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'plugin.json'), 'utf8')),
  'minimal-plugin guide manifest differs from the executable fixture');

const revision = guide.match(/^Evidence revision: `([0-9a-f]{40})`$/mu)?.[1];
assert(revision, 'minimal-plugin guide lacks a full evidence revision');
const sourceLinks = [...guide.matchAll(/https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^#)]+)#L([0-9]+)-L([0-9]+)/gu)];
assert(sourceLinks.length >= 9, `minimal-plugin guide has only ${sourceLinks.length} pinned source links`);
for (const match of sourceLinks) {
  const [, linkRevision, repositoryPath, firstValue, lastValue] = match;
  assert.equal(linkRevision, revision, `minimal-plugin source revision differs: ${repositoryPath}`);
  const pinned = execFileSync('git', ['-C', root, 'show', `${linkRevision}:${repositoryPath}`], { encoding: 'utf8' });
  const lineCount = pinned.split('\n').length;
  const first = Number(firstValue);
  const last = Number(lastValue);
  assert(first >= 1 && last >= first && last <= lineCount, `minimal-plugin source range is invalid: ${repositoryPath}`);
}

class MemoryJournal {
  #records = [];

  transact(operation) {
    return operation(Object.freeze([...this.#records]), (entry) => {
      const record = Object.freeze({
        sequence: this.#records.length + 1,
        previousHash: null,
        hash: `memory:${this.#records.length + 1}`,
        entry: structuredClone(entry),
      });
      this.#records.push(record);
      return record;
    });
  }

  appendSequenced(create) {
    return this.transact((records, append) => append(create(records.length + 1)));
  }

  records() {
    return Object.freeze([...this.#records]);
  }

  refresh() {
    return this.records();
  }
}

function definition(input) {
  return {
    schemaVersion: 'pipeline-definition.v2',
    id: 'pipeline:ap08-minimal-plugin',
    maxConcurrency: 1,
    stages: [{
      id: 'greet',
      type: 'example.greeting.say',
      dependsOn: [],
      config: { prefix: 'Hello' },
      input,
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5_000 },
    }],
  };
}

const platform = {
  schemaVersion: 'pipeline-platform.v2',
  installationRoots: [installationRoot],
  trustedBuiltinRoots: [installationRoot],
  externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
  providers: {},
  grants: { 'example.greeting:say': {} },
  adapters: {},
  activeAdapters: [],
  observers: {},
  storageRoot,
  shutdownTimeoutMs: 1_000,
  orchestratorIssuerId: 'nova',
  administrativeDecisionIssuers: [],
};

async function run(definitionValue, runId, selectedPlatform = platform) {
  const runtime = await prepareRuntime(selectedPlatform, definitionValue);
  const adapters = new core.AdapterRuntime({
    granted: runtime.granted,
    activated: runtime.activated,
    configs: new Map(),
    effects: {},
    shutdownTimeoutMs: selectedPlatform.shutdownTimeoutMs,
    async emitDomainEvent() {},
  });
  const journal = new MemoryJournal();
  await adapters.start();
  try {
    const runner = new core.PipelineRunner({
      definition: definitionValue,
      registry: runtime.granted,
      activated: runtime.activated,
      adapters,
      journal,
      orchestratorIssuerId: selectedPlatform.orchestratorIssuerId,
    });
    return { result: await runner.run(runId), journal };
  } finally {
    await adapters.shutdown();
  }
}

try {
  fs.mkdirSync(installationRoot, { recursive: true });
  fs.cpSync(fixtureRoot, installedPackage, { recursive: true });

  const packageTest = spawnSync('npm', ['test', '--prefix', fixtureRoot], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(packageTest.status, 0, packageTest.stderr || packageTest.stdout);

  // A separate probe identity allows this check while the tutorial is installed.
  const roleProbe = path.join(temporary, 'role-probe');
  fs.cpSync(fixtureRoot, roleProbe, { recursive: true });
  const probeManifest = JSON.parse(fs.readFileSync(path.join(roleProbe, 'plugin.json'), 'utf8'));
  probeManifest.id = 'example.ap08-role-probe';
  fs.writeFileSync(path.join(roleProbe, 'plugin.json'), JSON.stringify(probeManifest));
  const probePackage = JSON.parse(fs.readFileSync(path.join(roleProbe, 'package.json'), 'utf8'));
  probePackage.name = '@example/ap08-role-probe';
  fs.writeFileSync(path.join(roleProbe, 'package.json'), JSON.stringify(probePackage));

  const omittedRoleCheck = spawnSync(process.execPath, [
    path.join(root, 'scripts/check-runtime-role-manifests.mjs'),
    '--additional-plugin', `nova=${path.join(roleProbe, 'plugin.json')}`,
  ], { cwd: root, encoding: 'utf8' });
  assert.notEqual(omittedRoleCheck.status, 0, 'role check must reject an owned plugin before Nova selects it');
  assert.match(omittedRoleCheck.stderr, /nova omits its plugin: example\.ap08-role-probe/u);

  const roleCheck = spawnSync(process.execPath, [
    path.join(root, 'scripts/check-runtime-role-manifests.mjs'),
    '--additional-plugin', `nova=${path.join(roleProbe, 'plugin.json')}`,
    '--role-addition', 'nova=example.ap08-role-probe',
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(roleCheck.status, 0, roleCheck.stderr || roleCheck.stdout);
  const roleResult = JSON.parse(roleCheck.stdout.trim());
  assert.equal(roleResult.simulatedRoleAdditions, 1);

  const activated = await core.validatePipelineRuntimeV2(platform, definition({ name: 'KubeClaw' }));
  assert.deepEqual(activated, { packageCount: 1, stageCount: 1, observerCount: 0, adapterCount: 0 });

  const success = await run(definition({ name: 'KubeClaw' }), 'run:ap08-success');
  assert.equal(success.result.status, 'succeeded');
  assert.equal(success.result.stages.get('greet')?.status, 'succeeded');
  assert.equal(success.result.stages.get('greet')?.facts?.['tutorial.greeting'], 'Hello, KubeClaw!');

  const failure = await run(definition({ name: 'KubeClaw', fail: true }), 'run:ap08-failure');
  assert.equal(failure.result.status, 'failed');
  assert.equal(failure.result.stages.get('greet')?.status, 'failed');

  await assert.rejects(
    run(definition({ name: '' }), 'run:ap08-invalid-input'),
    /Value failed schema/u,
  );

  // An unrequested grant is denied before activation; the stage still declares
  // no capabilities and no state provider is selected or invoked.
  const baselineRuntime = await prepareRuntime(platform, definition({ name: 'KubeClaw' }));
  assert.deepEqual([...baselineRuntime.snapshot.packages.keys()], ['example.greeting']);
  assert.deepEqual([...baselineRuntime.snapshot.stages.keys()], ['example.greeting.say']);
  assert.deepEqual(baselineRuntime.snapshot.stages.get('example.greeting.say').registration.requiredCapabilities, []);
  await assert.rejects(prepareRuntime({ ...platform, grants: {
    'example.greeting:say': { 'state.read': {} },
  } }, definition({ name: 'KubeClaw' })), error => error?.code === 'REGISTRY_CAPABILITY_UNREQUESTED');
  const restoredRuntime = await prepareRuntime(platform, definition({ name: 'KubeClaw' }));
  assert.equal(restoredRuntime.snapshot.snapshotDigest, baselineRuntime.snapshot.snapshotDigest);

  // Same manifest/registration identity, different owned path and module bytes.
  // Never edit a released package or discover old and new copies together.
  const replacementRoot = path.join(temporary, 'replacement-plugins');
  const replacementPackage = path.join(replacementRoot, 'minimal-stage-v2');
  fs.mkdirSync(replacementRoot);
  fs.cpSync(fixtureRoot, replacementPackage, { recursive: true });
  const replacementManifestPath = path.join(replacementPackage, 'plugin.json');
  const replacementManifest = JSON.parse(fs.readFileSync(replacementManifestPath, 'utf8'));
  replacementManifest.packageVersion = '2.0.0';
  fs.writeFileSync(replacementManifestPath, JSON.stringify(replacementManifest));
  const replacementModulePath = path.join(replacementPackage, 'src/stage.js');
  const originalModule = fs.readFileSync(replacementModulePath, 'utf8');
  const greeting = '${context.contract.config.prefix}, ${input.name}!';
  assert.equal(originalModule.split(greeting).length - 1, 1, 'replacement greeting anchor must be unique');
  fs.writeFileSync(replacementModulePath, originalModule.replace(greeting,
    '${context.contract.config.prefix}-v2, ${input.name}!'));
  const replacementPlatform = { ...platform,
    installationRoots: [replacementRoot], trustedBuiltinRoots: [replacementRoot] };
  const replacementRuntime = await prepareRuntime(replacementPlatform, definition({ name: 'KubeClaw' }));
  assert.deepEqual([...replacementRuntime.snapshot.packages.keys()], ['example.greeting']);
  assert.deepEqual([...replacementRuntime.snapshot.stages.keys()], ['example.greeting.say']);
  assert.equal(replacementRuntime.activated.stages.size, 1);
  assert.equal(replacementRuntime.snapshot.packages.get('example.greeting').manifest.packageVersion, '2.0.0');
  assert.equal(replacementRuntime.snapshot.packages.get('example.greeting').root, replacementPackage);
  assert.notEqual(replacementRuntime.snapshot.snapshotDigest, baselineRuntime.snapshot.snapshotDigest);
  const replacement = await run(definition({ name: 'KubeClaw' }), 'run:ap08-replacement', replacementPlatform);
  assert.equal(replacement.result.status, 'succeeded');
  assert.equal(replacement.result.stages.get('greet')?.facts?.['tutorial.greeting'], 'Hello-v2, KubeClaw!');
  const rollback = await run(definition({ name: 'KubeClaw' }), 'run:ap08-rollback');
  assert.equal(rollback.result.stages.get('greet')?.facts?.['tutorial.greeting'], 'Hello, KubeClaw!');
  assert.equal((await prepareRuntime(platform, definition({ name: 'KubeClaw' }))).snapshot.snapshotDigest,
    baselineRuntime.snapshot.snapshotDigest);

  const disabledRoot = path.join(temporary, 'disabled-plugins');
  fs.mkdirSync(disabledRoot);
  const disabledPlatform = { ...platform, installationRoots: [disabledRoot], trustedBuiltinRoots: [disabledRoot] };
  const disabledRegistry = core.buildRegistry(core.discoverPackages({ installationRoots: [disabledRoot],
    trustPolicy: { trustedBuiltinRoots: [disabledRoot], allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(), verifierId: 'ap08-disabled-fixture' } }));
  assert.equal(disabledRegistry.packages.has('example.greeting'), false);
  assert.equal(disabledRegistry.stages.has('example.greeting.say'), false);
  await assert.rejects(prepareRuntime(disabledPlatform, definition({ name: 'KubeClaw' })),
    /PIPELINE_STAGE_OWNER_MISSING:example\.greeting\.say/u);
  const retainedBeforeRemoval = [success, failure, replacement, rollback]
    .map(run => JSON.stringify(run.journal.records()));
  fs.rmSync(replacementPackage, { recursive: true });
  await assert.rejects(prepareRuntime(replacementPlatform, definition({ name: 'KubeClaw' })),
    /PIPELINE_STAGE_OWNER_MISSING:example\.greeting\.say/u);

  fs.rmSync(installedPackage, { recursive: true, force: true });
  await assert.rejects(
    core.validatePipelineRuntimeV2(platform, definition({ name: 'KubeClaw' })),
    /PIPELINE_STAGE_OWNER_MISSING:example\.greeting\.say/u,
  );

  const retainedJournals = [success.journal.records(), failure.journal.records(),
    replacement.journal.records(), rollback.journal.records()];
  assert(retainedJournals.every((records) => records.length > 0), 'successful and failed run evidence must remain after package removal');
  assert.deepEqual(retainedJournals.map(records => JSON.stringify(records)), retainedBeforeRemoval,
    'package removal must preserve the complete original run journals');

  console.log(JSON.stringify({
    ok: true,
    journey: 'ap08-minimal-pipeline-plugin',
    packageTest: 'passed',
    roleOmission: 'rejected',
    roleInclusion: 'passed',
    activatedStages: 1,
    successFact: 'Hello, KubeClaw!',
    intentionalFailure: 'failed',
    invalidInput: 'rejected',
    undeclaredGrant: 'REGISTRY_CAPABILITY_UNREQUESTED',
    grantRestored: true,
    replacement: { packageId: 'example.greeting', registrationId: 'example.greeting:say',
      packageVersion: '2.0.0', activatedStages: replacementRuntime.activated.stages.size,
      baselineSnapshotDigest: baselineRuntime.snapshot.snapshotDigest,
      replacementSnapshotDigest: replacementRuntime.snapshot.snapshotDigest,
      successFact: 'Hello-v2, KubeClaw!' },
    rollback: 'original-snapshot-and-behavior',
    disabled: 'package-and-stage-absent',
    replacementRemoval: 'stage-owner-missing',
    removal: 'stage-owner-missing',
    retainedRunJournals: retainedJournals.length,
    persistenceBoundary: 'in-memory journal; persistent recovery requires separate checks',
  }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
