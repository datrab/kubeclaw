import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  captureCheckpoint,
  restoreCheckpoint,
  type CheckpointName,
} from './checkpoints.mts';
import { resolveRealE2EScenario } from './failure-scenarios.mts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const core = await import(pathToFileURL(
  path.join(repositoryRoot, 'skills/common/plugin-runtime/core/src/index.ts'),
).href);
const scenarioId = process.argv[2];
if (!scenarioId) throw new Error('scenario id is required');
const scenario = resolveRealE2EScenario(scenarioId);
if (scenario.id === 'success') throw new Error('success uses the real agent-backed runner');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `kubeclaw-v2-matrix-${scenario.id}-`));
const fixtureRoot = path.join(repositoryRoot, 'tests/fixtures/plugin-system-v2');
const storageRoot = path.join(temporary, 'state');
const runId = `run:matrix:${scenario.id}`;
const runRoot = path.join(storageRoot, 'runs', runId.replaceAll(':', '_'));
const platform = {
  schemaVersion: 'pipeline-platform.v2' as const,
  installationRoots: [fixtureRoot],
  trustedBuiltinRoots: [fixtureRoot],
  externalTrust: {
    allowedSourceDigests: {},
    verifiedAttestations: {},
  },
  providers: {},
  grants: {},
  adapters: {},
  activeAdapters: [],
  observers: {},
  storageRoot,
  shutdownTimeoutMs: 5_000,
  orchestratorIssuerId: 'nova',
  administrativeDecisionIssuers: [],
};

type FixtureMode =
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'retry_always'
  | 'retry_then_pass'
  | 'throw'
  | 'malformed';

function stage(
  id: string,
  input: Readonly<Record<string, unknown>>,
  dependsOn: readonly string[] = [],
  timeoutMs = 5_000,
): Record<string, unknown> {
  return {
    id,
    type: 'test.generic',
    dependsOn,
    config: {},
    input,
    execution: {
      maxAttempts:
        scenario.suite === 'crash-resume'
        || input.mode === 'retry_always'
        || input.mode === 'retry_then_pass'
          ? 2
          : 1,
      maxRemediationCycles: 0,
      timeoutMs,
    },
  };
}

function fixtureInput(mode: FixtureMode, delayMs = 0): Readonly<Record<string, unknown>> {
  return {
    mode,
    delayMs,
    reasonCode: `matrix.${scenario.expectedEvidence}`,
    scenario: scenario.id,
  };
}

function definitionForScenario(): Record<string, unknown> {
  if (scenario.id === 'multi-module-independent-success') {
    return {
      schemaVersion: 'pipeline-definition.v2',
      id: `pipeline:${scenario.id}`,
      maxConcurrency: 2,
      stages: [
        stage('module-a', fixtureInput('passed', 40)),
        stage('module-b', fixtureInput('passed', 40)),
      ],
    };
  }
  if (scenario.id === 'multi-module-dependent-success') {
    return {
      schemaVersion: 'pipeline-definition.v2',
      id: `pipeline:${scenario.id}`,
      maxConcurrency: 2,
      stages: [
        stage('module-a', fixtureInput('passed')),
        stage('module-b', fixtureInput('passed'), ['module-a']),
      ],
    };
  }
  if (scenario.id === 'multi-module-dependency-blocked') {
    return {
      schemaVersion: 'pipeline-definition.v2',
      id: `pipeline:${scenario.id}`,
      maxConcurrency: 2,
      stages: [
        stage('module-a', fixtureInput('failed')),
        stage('module-b', fixtureInput('passed'), ['module-a']),
      ],
    };
  }
  if (scenario.id === 'crash-after-final-review-before-summary') {
    return {
      schemaVersion: 'pipeline-definition.v2',
      id: `pipeline:${scenario.id}`,
      maxConcurrency: 1,
      stages: [
        stage('final-review', fixtureInput('passed')),
        stage('summary', fixtureInput('passed'), ['final-review']),
      ],
    };
  }
  const timeout = scenario.id.endsWith('-timeout');
  const successfulRetry = new Set([
    'forge-retry-then-success',
    'retry-fix-malformed-output',
    'crash-after-failed-gate-before-retry',
  ]).has(scenario.id);
  const retryExhausted = scenario.id === 'retry-budget-exhausted';
  const malformed = new Set([
    'forge-malformed-output',
    'echo-malformed-output',
    'buster-invalid-completion-identity',
  ]).has(scenario.id);
  const blocked = new Set([
    'approval-deny',
    'approval-timeout-block',
    'architecture-validator-block',
    'buster-gate-failure',
    'namespace-lease-denied',
  ]).has(scenario.id);
  const mode: FixtureMode = timeout
    ? 'passed'
    : successfulRetry
      ? 'retry_then_pass'
      : retryExhausted
        ? 'retry_always'
        : malformed
          ? 'malformed'
          : blocked
            ? 'blocked'
            : scenario.expectedExit === 'zero'
              ? 'passed'
              : 'failed';
  return {
    schemaVersion: 'pipeline-definition.v2',
    id: `pipeline:${scenario.id}`,
    maxConcurrency: 1,
    stages: [
      stage('fault-surface', fixtureInput(mode, timeout ? 100 : 0), [], timeout ? 10 : 5_000),
    ],
  };
}

function readEvents(root: string): Array<Record<string, any>> {
  return fs.readFileSync(path.join(root, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line).entry);
}

function assertGraphEvidence(events: Array<Record<string, any>>): void {
  const index = (type: string, stageId: string): number =>
    events.findIndex((event) => event.type === type && event.identity.stageId === stageId);
  if (scenario.id === 'multi-module-independent-success') {
    assert.ok(
      index('stage.started', 'module-b') < index('stage.succeeded', 'module-a'),
      'independent modules did not overlap',
    );
  } else if (scenario.id === 'multi-module-dependent-success') {
    assert.ok(
      index('stage.started', 'module-b') > index('stage.succeeded', 'module-a'),
      'dependent module started before its prerequisite',
    );
  } else if (scenario.id === 'multi-module-dependency-blocked') {
    assert.equal(index('stage.started', 'module-b'), -1, 'failed dependency did not block its consumer');
  }
}

function truncateForCrash(
  definition: Record<string, unknown>,
  events: Array<Record<string, any>>,
): Array<Record<string, any>> {
  const isRetryCrash = scenario.id === 'crash-after-failed-gate-before-retry';
  let cutoff = events.findIndex((event) =>
    isRetryCrash
      ? event.type === 'attempt.completed' && event.payload.outcome === 'retry'
      : scenario.id === 'crash-after-final-review-before-summary'
        ? event.type === 'stage.succeeded' && event.identity.stageId === 'final-review'
        : event.type === 'stage.started');
  if (scenario.id === 'crash-before-buster-handoff') {
    cutoff = events.findIndex((event) => event.type === 'run.started');
  } else if (scenario.id === 'crash-after-buster-task-enqueue') {
    cutoff = events.findIndex((event) => event.type === 'attempt.created');
  }
  assert.ok(cutoff >= 0, `checkpoint event missing for ${scenario.id}`);
  const sourceLines = fs.readFileSync(path.join(runRoot, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n');
  fs.writeFileSync(path.join(runRoot, 'events.jsonl'), `${sourceLines.slice(0, cutoff + 1).join('\n')}\n`);
  return events.slice(0, cutoff + 1);
}

async function proveCrashRecovery(definition: Record<string, unknown>): Promise<Record<string, unknown>> {
  const initial = await core.runPipelineV2(platform, definition, runId);
  assert.equal(initial.status, 'succeeded');
  const completeEvents = readEvents(runRoot);
  const truncated = truncateForCrash(definition, completeEvents);
  const checkpointRoot = path.join(temporary, 'checkpoints');
  const manifest = captureCheckpoint({
    checkpointRoot,
    checkpoint: scenario.checkpoint as CheckpointName,
    runRoot,
    sourceRunId: runId,
  });
  fs.rmSync(runRoot, { recursive: true, force: true });
  restoreCheckpoint({
    checkpointRoot,
    checkpoint: scenario.checkpoint as CheckpointName,
    targetRunRoot: runRoot,
  });
  const recovered = await core.recoverPipelineV2(platform, definition, runId);
  assert.equal(recovered.status, 'succeeded');
  const recoveredEvents = readEvents(runRoot);
  assert.ok(recoveredEvents.some((event) => event.type === 'run.resumed'));
  assert.ok(recoveredEvents.some((event) => event.type === 'run.succeeded'));
  return {
    checkpointDigest: manifest.sourceDigest,
    truncatedAt: truncated.at(-1)?.type,
    recoveredEvents: recoveredEvents.length,
  };
}

try {
  const definition = definitionForScenario();
  const isCrash = scenario.suite === 'crash-resume';
  let result: any;
  let crashEvidence: Record<string, unknown> | null = null;
  if (isCrash) {
    crashEvidence = await proveCrashRecovery(definition);
    result = { status: 'succeeded' };
  } else if (scenario.id === 'pipeline-cancelled') {
    const controller = new AbortController();
    const cancelledDefinition = {
      ...definition,
      stages: [stage('fault-surface', fixtureInput('passed', 1_000), [], 5_000)],
    };
    setTimeout(() => controller.abort(), 20);
    result = await core.runPipelineV2(platform, cancelledDefinition, runId, controller.signal);
  } else {
    result = await core.runPipelineV2(platform, definition, runId);
  }
  const events = readEvents(runRoot);
  assertGraphEvidence(events);
  if (scenario.expectedExit === 'zero') {
    assert.equal(result.status, 'succeeded', `expected successful v2 lifecycle for ${scenario.id}`);
  } else {
    assert.notEqual(result.status, 'succeeded', `fault scenario unexpectedly succeeded: ${scenario.id}`);
  }
  const reasonCodes = events
    .map((event) => event.payload?.reason?.code)
    .filter((code): code is string => typeof code === 'string');
  const outcomes = events
    .map((event) => event.payload?.outcome)
    .filter((outcome): outcome is string => typeof outcome === 'string');
  const terminalTypes = events
    .map((event) => event.type)
    .filter((type) => ['run.succeeded', 'run.failed', 'run.blocked', 'run.cancelled'].includes(type));
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'real-e2e-scenario-proof.v2',
    ok: true,
    scenario: scenario.id,
    suite: scenario.suite,
    proofLevel: 'v2-lifecycle-fault-injection',
    expectedEvidence: scenario.expectedEvidence,
    status: result.status,
    outcomes,
    reasonCodes,
    terminalTypes,
    crashEvidence,
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
