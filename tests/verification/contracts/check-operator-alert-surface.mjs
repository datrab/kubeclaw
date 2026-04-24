import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();

const moduleRunnerSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner.js'), 'utf8');
const pipelineRunnerSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner.js'), 'utf8');
const telemetrySource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/telemetry.js'), 'utf8');

assert.equal(moduleRunnerSource.includes("emitOperatorAlert(_telemetryCtx(config), 'module.operator_alert'"), true, 'module-runner should route operator-only alerts through emitOperatorAlert');
assert.equal(pipelineRunnerSource.includes("emitOperatorAlert(ctx, 'pipeline.operator_alert'"), true, 'pipeline-runner should route terminal pipeline alerts through emitOperatorAlert');
assert.equal(telemetrySource.includes('operatorFallback'), true, 'telemetry notification compatibility path should include an operator-alert fallback');

const telemetryMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/services/telemetry.js')).href);

const directCalls = [];
await telemetryMod.emitOperatorAlert({
  config: {
    project: 'behavior-operator-alert',
    _runId: 'run-operator-alert-1',
    run_id: 'run-operator-alert-1',
    _testOverrides: {
      moduleRunner: {
        discord: async (_config, level, title, description, fields = []) => {
          directCalls.push({ level, title, description, fields });
        },
      },
    },
  },
}, 'module.operator_alert', {
  module_id: '01',
  phase: 'forge',
  attempt: 1,
}, {
  hookId: 'module.completed',
  moduleId: '01',
  attempt: 1,
  presentation: {
    discord: {
      level: 'WARN',
      title: 'Module 01 — Forge no changes',
      description: 'Forge completed without file changes',
      fields: [{ name: 'Module', value: '01' }],
    },
  },
});

assert.equal(directCalls.length, 1, 'emitOperatorAlert should dispatch exactly one operator alert');
assert.equal(directCalls[0].title, 'Module 01 — Forge no changes');
assert.equal(directCalls[0].description, 'Forge completed without file changes');
assert.equal(directCalls[0].fields[0].name, 'Module');
assert.equal(directCalls[0].fields[0].value, '01');

const fallbackCalls = [];
await telemetryMod.onGateFail({
  config: {
    project: 'behavior-operator-fallback',
    telemetry: { enabled: false },
    _runId: 'run-operator-fallback-1',
    run_id: 'run-operator-fallback-1',
    _testOverrides: {
      busterGate: {
        discord: async (_config, level, title, description, fields = []) => {
          fallbackCalls.push({ level, title, description, fields });
        },
      },
    },
  },
}, 'gate:buster', {
  gate_type: 'buster',
  reason: "Gate 'gate:buster' spawn failed: spawn unavailable",
  presentation: {
    discord: {
      level: 'CRITICAL',
      title: "Gate 'gate:buster' Spawn Failed",
      description: 'Buster agent could not be spawned: spawn unavailable',
      fields: [{ name: 'Gate', value: 'gate:buster' }],
    },
  },
});

assert.equal(fallbackCalls.length, 1, 'onGateFail should fallback to the canonical operator alert sink when no notification listeners are present');
assert.equal(fallbackCalls[0].title, "Gate 'gate:buster' Spawn Failed");
assert.equal(fallbackCalls[0].fields[0].name, 'Gate');
assert.equal(fallbackCalls[0].fields[0].value, 'gate:buster');

console.log(JSON.stringify({ ok: true, checked: 5 }));
