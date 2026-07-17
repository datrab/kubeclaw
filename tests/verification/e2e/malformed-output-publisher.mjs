#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertScenarioMutationChannel } from './failure-scenarios.mjs';

const SCENARIO_CONFIG = Object.freeze({
  'forge-malformed-output': Object.freeze({
    trigger: path.join('logs', 'modules', '01-nginx', 'forge-prompt-attempt-1.md'),
    target: path.join('modules', '01-nginx', 'forge-completion.json'),
    raw: '{"artifact_type":"not_forge_completion","status":"BROKEN"}\n',
    artifactType: 'forge_completion',
    invalidJson: false,
    targetMayBeRewritten: true,
  }),
  'retry-fix-malformed-output': Object.freeze({
    trigger: path.join('logs', 'modules', '01-nginx', 'forge-prompt-attempt-2.md'),
    target: path.join('modules', '01-nginx', 'forge-completion.json'),
    raw: '{"status":"READY_FOR_TESTING","summary":"retry output has a repairable missing envelope","evidence":{"inspected_files":["Projects/real-pipeline-e2e/src/index.html"],"consulted_contracts":[".swarm/contracts/module-outputs/01-nginx.json"],"implementation_notes":"the retry output is intentionally missing only canonical envelope identity fields"},"completed_at":"2026-07-15T00:00:00Z"}\n',
    artifactType: 'forge_completion',
    invalidJson: false,
    normalizable: true,
    expectedJson: Object.freeze({
      status: 'READY_FOR_TESTING',
      summary: 'retry output has a repairable missing envelope',
    }),
  }),
  'echo-malformed-output': Object.freeze({
    trigger: path.join('logs', 'gates', 'module-review', 'echo-prompt-attempt-1.md'),
    target: path.join('logs', 'echo-review', 'echo-codex-REAL-E2E-MODULE-REVIEW.json'),
    raw: '{ "status": "PASS", "critical_issues": [',
    artifactType: 'echo_review_output',
    invalidJson: true,
  }),
});

function parseArgs(argv) {
  const args = {
    timeoutMs: 10 * 60 * 1000,
    pollMs: 500,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--scenario') {
      args.scenario = argv[++index] || '';
    } else if (arg === '--swarm-dir') {
      args.swarmDir = argv[++index] || '';
    } else if (arg === '--run-id') {
      args.runId = argv[++index] || '';
    } else if (arg === '--project') {
      args.project = argv[++index] || '';
    } else if (arg === '--timeout-ms') {
      args.timeoutMs = Number(argv[++index] || '');
    } else if (arg === '--poll-ms') {
      args.pollMs = Number(argv[++index] || '');
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (args.help) return args;
  if (!SCENARIO_CONFIG[args.scenario]) throw new Error(`unsupported malformed output scenario: ${args.scenario || '(missing)'}`);
  if (!args.swarmDir) throw new Error('--swarm-dir is required');
  if (!args.runId) throw new Error('--run-id is required');
  if (!args.project) throw new Error('--project is required');
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) throw new Error('--timeout-ms must be positive');
  if (!Number.isFinite(args.pollMs) || args.pollMs <= 0) throw new Error('--poll-ms must be positive');
  return args;
}

function usage() {
  return [
    'Usage: node tests/verification/e2e/malformed-output-publisher.mjs --scenario <forge-malformed-output|retry-fix-malformed-output|echo-malformed-output> --swarm-dir <path> --run-id <id> --project <name>',
    '',
  ].join('\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function malformedOutputScenarioConfig(scenario) {
  const config = SCENARIO_CONFIG[scenario] || null;
  if (config) assertScenarioMutationChannel(scenario, 'malformed-output');
  return config;
}

export async function publishMalformedOutput(args) {
  const config = malformedOutputScenarioConfig(args.scenario);
  if (!config) throw new Error(`unsupported malformed output scenario: ${args.scenario}`);

  const swarmDir = path.resolve(args.swarmDir);
  const triggerPath = path.join(swarmDir, config.trigger);
  const targetPath = path.join(swarmDir, config.target);
  const manifestPath = path.join(swarmDir, 'logs', 'real-e2e', `malformed-output-publisher-${args.scenario}.json`);
  const startedAt = Date.now();

  while (!exists(triggerPath)) {
    if (Date.now() - startedAt > args.timeoutMs) {
      throw new Error(`timed out waiting for malformed output trigger: ${triggerPath}`);
    }
    await sleep(args.pollMs);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, config.raw);

  const manifest = {
    artifact_type: 'real_e2e_malformed_output_publication',
    scenario: args.scenario,
    run_id: args.runId,
    project: args.project,
    trigger: config.trigger,
    target: config.target,
    target_artifact_type: config.artifactType,
    raw_base64: Buffer.from(config.raw).toString('base64'),
    raw_sha256: sha256(config.raw),
    raw_bytes: Buffer.byteLength(config.raw, 'utf8'),
    published_at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(usage());
    } else {
      const manifest = await publishMalformedOutput(args);
      process.stdout.write(`${JSON.stringify({ ok: true, ...manifest })}\n`);
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
