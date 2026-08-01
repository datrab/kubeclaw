#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  listFailureMatrixSuiteIds,
  listRealE2EScenarioIds,
  resolveFailureMatrixSuite,
  resolveRealE2EScenario,
} from './failure-scenarios.mts';
import { probeCapabilities, sendMatrixDiscordSummary } from './capabilities.mts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const resultRoot = path.join(repositoryRoot, '.swarm', 'real-e2e', 'results');
const reportRoot = path.join(repositoryRoot, '.swarm', 'real-e2e', 'failure-matrix-reports');

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

const mode = value('--mode') ?? 'full';
if (!['fast', 'full'].includes(mode)) throw new Error('--mode must be fast or full');
const onlyScenario = value('--scenario');
const suite = value('--suite');
const continueOnFailure = process.argv.includes('--continue-on-failure');
const disableDiscord = process.argv.includes('--disable-matrix-discord');
const selected = onlyScenario
  ? [resolveRealE2EScenario(onlyScenario)]
  : suite
    ? [...resolveFailureMatrixSuite(suite)]
    : listRealE2EScenarioIds().filter((id) => id !== 'success').map(resolveRealE2EScenario);
fs.mkdirSync(resultRoot, { recursive: true });
fs.mkdirSync(reportRoot, { recursive: true });

const requiredCapabilities = [...new Set(selected.flatMap((scenario) => scenario.requires))];
const capabilityResults = await probeCapabilities(requiredCapabilities, {
  announceDiscord: !disableDiscord,
});
const capabilityFailures = capabilityResults.filter((result) => !result.ok);
const records: Array<Record<string, unknown>> = [];
const prerequisites: Array<Record<string, unknown>> = [];

const packageProof = (relative: string): { command: readonly string[]; cwd: string } => ({
  command: ['npm', 'test'],
  cwd: path.join(repositoryRoot, relative),
});
const suiteProofs: Readonly<Record<string, readonly {
  readonly name: string;
  readonly command: readonly string[];
  readonly cwd: string;
}[]>> = Object.freeze({
  'human-gates': [
    { name: 'human-approval', ...packageProof('skills/nova/plugins/human-approval') },
    { name: 'review', ...packageProof('skills/nova/plugins/review') },
  ],
  'module-failure-retry': [
    { name: 'implementation-agent', ...packageProof('skills/nova/plugins/implementation-agent') },
    { name: 'test-agent', ...packageProof('skills/buster/plugins/test-agent') },
    { name: 'review', ...packageProof('skills/nova/plugins/review') },
  ],
  'final-deployment-buster': [
    { name: 'buster-quality-gate', ...packageProof('skills/nova/plugins/buster-quality-gate') },
    { name: 'command-runner', ...packageProof('skills/common/plugins/command-runner') },
  ],
  'infrastructure-observability': [
    { name: 'notification-observer', ...packageProof('skills/common/plugins/notification-observer') },
    { name: 'redis-transport', ...packageProof('skills/common/plugins/redis-transport') },
  ],
  'git-authority': [
    { name: 'git-workspace', ...packageProof('skills/common/plugins/git-workspace') },
  ],
  'module-graph': [{
    name: 'generic-v2-graph',
    command: ['node', 'tests/verification/contracts/check-plugin-system-v2-phase6.mjs'],
    cwd: repositoryRoot,
  }],
  'crash-resume': [{
    name: 'durable-v2-effects-and-recovery',
    command: ['node', 'tests/verification/contracts/check-plugin-system-v2-phase7.mjs'],
    cwd: repositoryRoot,
  }],
});

function acceptedProofLevels(
  scenario: ReturnType<typeof resolveRealE2EScenario>,
): readonly string[] {
  if (
    scenario.suite === 'module-graph'
    || scenario.suite === 'crash-resume'
    || scenario.id === 'pipeline-cancelled'
  ) {
    return ['v2-lifecycle-fault-injection'];
  }
  return ['production-plugin-fault-injection', 'real-agent-backed-pipeline'];
}

for (const suiteId of [...new Set(selected.map((scenario) => scenario.suite))]) {
  for (const proof of suiteProofs[suiteId] ?? []) {
    const result = spawnSync(proof.command[0], proof.command.slice(1), {
      cwd: proof.cwd,
      env: process.env,
      encoding: 'utf8',
      timeout: 15 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    prerequisites.push({
      suite: suiteId,
      proof: proof.name,
      ok: result.status === 0,
      exitCode: result.status,
      stdoutTail: result.stdout.slice(-8_192),
      stderrTail: result.stderr.slice(-8_192),
    });
    process.stdout.write(
      `${result.status === 0 ? 'PASS' : 'FAIL'} prerequisite=${suiteId}/${proof.name}\n`,
    );
    if (result.status !== 0 && !continueOnFailure) break;
  }
}

for (const scenario of selected) {
    const blockers = capabilityResults.filter(
      (result) => scenario.requires.includes(result.capability) && !result.ok,
    );
    if (blockers.length > 0) {
      const record = {
        schemaVersion: 'real-e2e-matrix-scenario.v2',
        scenario: scenario.id,
        suite: scenario.suite,
        checkpoint: scenario.checkpoint,
        faultSurface: scenario.faultSurface,
        expectedEvidence: scenario.expectedEvidence,
        ok: false,
        blocked: true,
        blockers: blockers.map((entry) => entry.reason),
        exitCode: null,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        stdoutTail: '',
        stderrTail: '',
      };
      records.push(record);
      process.stdout.write(`FAIL scenario=${scenario.id} reason=${blockers.map((entry) => entry.reason).join(',')}\n`);
      if (!continueOnFailure) break;
      continue;
    }
    const startedAt = new Date().toISOString();
    const resultPath = path.join(resultRoot, `${Date.now()}-${scenario.id}.json`);
    const command = scenario.id === 'success'
      ? [
          process.execPath,
          'tests/verification/e2e/run-real-pipeline-e2e.mts',
          '--mode', mode,
          '--result-path', resultPath,
        ]
      : [
          process.execPath,
          'tests/verification/e2e/scenario-proof.mts', scenario.id,
        ];
    const result = spawnSync(command[0], command.slice(1), {
      cwd: repositoryRoot,
      env: process.env,
      encoding: 'utf8',
      timeout: scenario.suite === 'crash-resume' ? 90 * 60_000 : 40 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    let proof: Record<string, unknown> | null = null;
    try {
      proof = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}');
    } catch {
      proof = null;
    }
    const proofLevel = typeof proof?.proofLevel === 'string' ? proof.proofLevel : null;
    const acceptedLevels = acceptedProofLevels(scenario);
    const proofAccepted = result.status === 0
      && proofLevel !== null
      && acceptedLevels.includes(proofLevel);
    const record = {
      schemaVersion: 'real-e2e-matrix-scenario.v2',
      scenario: scenario.id,
      suite: scenario.suite,
      checkpoint: scenario.checkpoint,
      faultSurface: scenario.faultSurface,
      expectedEvidence: scenario.expectedEvidence,
      ok: proofAccepted,
      exitCode: result.status,
      startedAt,
      finishedAt: new Date().toISOString(),
      stdoutTail: result.stdout.slice(-16_384),
      stderrTail: result.stderr.slice(-16_384),
      proof,
      proofAccepted,
      acceptedProofLevels: acceptedLevels,
    };
    fs.writeFileSync(resultPath, `${JSON.stringify(record, null, 2)}\n`);
    records.push(record);
    process.stdout.write(`${record.ok ? 'PASS' : 'FAIL'} scenario=${scenario.id} artifact=${resultPath}\n`);
    if (!record.ok && !continueOnFailure) break;
}

const failures = records.filter((record) => !record.ok);
const prerequisiteFailures = prerequisites.filter((record) => !record.ok);
const ok = capabilityFailures.length === 0
  && prerequisiteFailures.length === 0
  && failures.length === 0
  && records.length === selected.length;
const reportPath = path.join(reportRoot, `${new Date().toISOString().replace(/[:.]/gu, '-')}-${mode}.md`);
fs.writeFileSync(reportPath, [
  '# KubeClaw v2 real E2E failure matrix',
  '',
  `- Mode: ${mode}`,
  `- Requested: ${selected.length}`,
  `- Completed: ${records.length}`,
  `- Passed: ${records.length - failures.length}`,
  `- Failed: ${failures.length}`,
  `- Capability blockers: ${capabilityFailures.length}`,
  `- Failed suite prerequisites: ${prerequisiteFailures.length}`,
  '',
  '## Capability probe',
  '',
  ...capabilityResults.map((entry) => `- ${entry.capability}: ${entry.ok ? 'PASS' : `FAIL (${entry.reason})`}`),
  '',
  '## Production package prerequisites',
  '',
  ...prerequisites.map((entry) => `- ${entry.suite}/${entry.proof}: ${entry.ok ? 'PASS' : 'FAIL'}`),
  '',
  '## Scenarios',
  '',
  ...records.map((entry) => {
    const proof = entry.proof as { proofLevel?: unknown } | null;
    return `- ${entry.scenario}: ${entry.ok ? 'PASS' : 'FAIL'} — ${entry.expectedEvidence}`
      + `${typeof proof?.proofLevel === 'string' ? ` [${proof.proofLevel}]` : ''}`;
  }),
  '',
].join('\n'));
process.stdout.write(`SUMMARY requested=${selected.length} completed=${records.length} failed=${failures.length} blockers=${capabilityFailures.length} prerequisite_failures=${prerequisiteFailures.length} report=${reportPath}\n`);
if (!disableDiscord) {
  await sendMatrixDiscordSummary(
    `KubeClaw v2 E2E matrix ${ok ? 'passed' : 'failed'} — requested ${selected.length}, completed ${records.length}, failures ${failures.length}, blockers ${capabilityFailures.length}, prerequisite failures ${prerequisiteFailures.length}.`,
  ).catch(() => undefined);
}
if (!ok) process.exitCode = 1;

export { listFailureMatrixSuiteIds };
