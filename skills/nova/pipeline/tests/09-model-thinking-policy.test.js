// tests/09-model-thinking-policy.test.js
// Module 09 — Model and Thinking Override Policy
//
// Verifies:
//   1. override-precedence-matrix  — runtime > scope > project > config > null
//   2. cli-runtime-override        — runtime model/thinking beats all lower-precedence values
//   3. thinking-boundary           — redis dispatch path yields not_supported, acp path supports it
//   4. invalid-thinking-fails      — unknown thinking level throws clearly
//   5. policy-artifact-visibility  — logEffectivePolicy writes correct fields to model-policy.jsonl
//   6. resolveModel-compat         — updated resolveModel still works correctly via resolvePolicy
//   7. thinking-validation-inputs  — validateThinkingLevel covers all valid/invalid cases

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  resolvePolicy,
  logEffectivePolicy,
  validateThinkingLevel,
  VALID_THINKING_LEVELS,
  THINKING_SUPPORTED_PATHS,
  THINKING_UNSUPPORTED_PATHS,
} from '../core/policy.js';

import { resolveModel } from '../core/config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'policy-test-'));
}

function makeConfig(overrides = {}) {
  return {
    project: 'test-proj',
    repo_root: '/tmp/test-repo',
    models: {},
    agents: {},
    ...overrides,
  };
}

function makeProgress(overrides = {}) {
  return {
    project: 'test-proj',
    execution_order: [],
    modules: {},
    defaults: {},
    ...overrides,
  };
}

// ── 1. Override precedence matrix ─────────────────────────────────────────────

describe('override-precedence-matrix', () => {
  it('runtime_override beats all lower-precedence model values', () => {
    const config = makeConfig({
      _runtimeOverrides: { model: 'runtime-model', thinking: null },
      models: { forge: 'config-model' },
    });
    const progress = makeProgress({
      defaults: { models: { forge: 'project-model' } },
    });

    const result = resolvePolicy(config, progress, 'forge', {
      scopeModel: 'scope-model',
      dispatchPath: 'acp',
    });

    assert.equal(result.model, 'runtime-model');
    assert.equal(result.model_source, 'runtime_override');
  });

  it('scope_policy beats project_default and config_default when no runtime override', () => {
    const config = makeConfig({ models: { forge: 'config-model' } });
    const progress = makeProgress({
      defaults: { models: { forge: 'project-model' } },
    });

    const result = resolvePolicy(config, progress, 'forge', {
      scopeModel: 'scope-model',
      dispatchPath: 'acp',
    });

    assert.equal(result.model, 'scope-model');
    assert.equal(result.model_source, 'scope_policy');
  });

  it('project_default beats config_default when no runtime or scope override', () => {
    const config = makeConfig({ models: { forge: 'config-model' } });
    const progress = makeProgress({
      defaults: { models: { forge: 'project-model' } },
    });

    const result = resolvePolicy(config, progress, 'forge', { dispatchPath: 'acp' });

    assert.equal(result.model, 'project-model');
    assert.equal(result.model_source, 'project_default');
  });

  it('config_default is used when no higher-precedence model is set', () => {
    const config = makeConfig({ models: { forge: 'config-model' } });
    const progress = makeProgress();

    const result = resolvePolicy(config, progress, 'forge', { dispatchPath: 'acp' });

    assert.equal(result.model, 'config-model');
    assert.equal(result.model_source, 'config_default');
  });

  it('returns null model with source none when nothing is configured', () => {
    const result = resolvePolicy(makeConfig(), makeProgress(), 'forge', { dispatchPath: 'acp' });

    assert.equal(result.model, null);
    assert.equal(result.model_source, 'none');
  });

  it('thinking resolution follows the same precedence as model', () => {
    const config = makeConfig({
      _runtimeOverrides: { model: null, thinking: 'high' },
      agents: { forge: { thinking_level: 'low' } },
    });
    const progress = makeProgress({
      defaults: { thinking: { forge: 'medium' } },
    });

    const result = resolvePolicy(config, progress, 'forge', {
      scopeThinking: 'xhigh',
      dispatchPath: 'acp',
    });

    // runtime beats scope/project/config
    assert.equal(result.thinking, 'high');
    assert.equal(result.thinking_source, 'runtime_override');
  });

  it('scope thinking beats project/config defaults', () => {
    const config = makeConfig({ agents: { forge: { thinking_level: 'low' } } });
    const progress = makeProgress({ defaults: { thinking: { forge: 'medium' } } });

    const result = resolvePolicy(config, progress, 'forge', {
      scopeThinking: 'xhigh',
      dispatchPath: 'acp',
    });

    assert.equal(result.thinking, 'xhigh');
    assert.equal(result.thinking_source, 'scope_policy');
  });

  it('project thinking default beats config default', () => {
    const config = makeConfig({ agents: { forge: { thinking_level: 'low' } } });
    const progress = makeProgress({ defaults: { thinking: { forge: 'medium' } } });

    const result = resolvePolicy(config, progress, 'forge', { dispatchPath: 'acp' });

    assert.equal(result.thinking, 'medium');
    assert.equal(result.thinking_source, 'project_default');
  });

  it('config agent thinking_level is used when no higher-precedence thinking is set', () => {
    const config = makeConfig({ agents: { forge: { thinking_level: 'low' } } });
    const progress = makeProgress();

    const result = resolvePolicy(config, progress, 'forge', { dispatchPath: 'acp' });

    assert.equal(result.thinking, 'low');
    assert.equal(result.thinking_source, 'config_default');
  });
});

// ── 2. CLI runtime override ───────────────────────────────────────────────────

describe('cli-runtime-override', () => {
  it('runtime model override applies when config._runtimeOverrides.model is set', () => {
    const config = makeConfig({
      _runtimeOverrides: { model: 'openai/gpt-5.4', thinking: null },
      models: { forge: 'fallback-model' },
    });

    const result = resolvePolicy(config, makeProgress(), 'forge', { dispatchPath: 'acp' });

    assert.equal(result.model, 'openai/gpt-5.4');
    assert.equal(result.model_source, 'runtime_override');
  });

  it('runtime thinking override applies on acp dispatch path', () => {
    const config = makeConfig({
      _runtimeOverrides: { model: null, thinking: 'xhigh' },
      agents: { forge: { thinking_level: 'low' } },
    });

    const result = resolvePolicy(config, makeProgress(), 'forge', { dispatchPath: 'acp' });

    assert.equal(result.thinking, 'xhigh');
    assert.equal(result.thinking_source, 'runtime_override');
  });

  it('runtime thinking override is ignored on redis dispatch path', () => {
    const config = makeConfig({
      _runtimeOverrides: { model: null, thinking: 'xhigh' },
    });

    const result = resolvePolicy(config, makeProgress(), 'buster', { dispatchPath: 'redis' });

    assert.equal(result.thinking, null);
    assert.equal(result.thinking_source, 'not_supported_on_redis');
    assert.equal(result.thinking_supported, false);
  });

  it('no _runtimeOverrides key on config is treated as no override (no throw)', () => {
    const config = makeConfig({ models: { forge: 'some-model' } });
    assert.doesNotThrow(() => resolvePolicy(config, makeProgress(), 'forge'));
    const result = resolvePolicy(config, makeProgress(), 'forge');
    assert.equal(result.model, 'some-model');
    assert.equal(result.model_source, 'config_default');
  });
});

// ── 3. Thinking dispatch boundary ─────────────────────────────────────────────

describe('thinking-boundary', () => {
  it('thinking_supported is true for acp dispatch path', () => {
    const result = resolvePolicy(makeConfig(), makeProgress(), 'forge', { dispatchPath: 'acp' });
    assert.equal(result.thinking_supported, true);
  });

  it('thinking_supported is true for subagent dispatch path', () => {
    const result = resolvePolicy(makeConfig(), makeProgress(), 'forge', { dispatchPath: 'subagent' });
    assert.equal(result.thinking_supported, true);
  });

  it('thinking_supported is false for redis dispatch path', () => {
    const result = resolvePolicy(makeConfig(), makeProgress(), 'buster', { dispatchPath: 'redis' });
    assert.equal(result.thinking_supported, false);
  });

  it('thinking is null on redis even when config.agents.buster.thinking_level is set', () => {
    const config = makeConfig({ agents: { buster: { thinking_level: 'high' } } });
    const result = resolvePolicy(config, makeProgress(), 'buster', { dispatchPath: 'redis' });
    assert.equal(result.thinking, null);
    assert.equal(result.thinking_source, 'not_supported_on_redis');
  });

  it('thinking_source records dispatch path name for unsupported paths', () => {
    const result = resolvePolicy(makeConfig(), makeProgress(), 'buster', { dispatchPath: 'redis' });
    assert.equal(result.thinking_source, 'not_supported_on_redis');
  });

  it('thinking is resolved normally when dispatchPath is omitted', () => {
    const config = makeConfig({ agents: { forge: { thinking_level: 'medium' } } });
    const result = resolvePolicy(config, makeProgress(), 'forge');
    assert.equal(result.thinking, 'medium');
    assert.equal(result.thinking_source, 'config_default');
    assert.equal(result.thinking_supported, true);
  });

  it('THINKING_SUPPORTED_PATHS and THINKING_UNSUPPORTED_PATHS are disjoint sets', () => {
    for (const p of THINKING_SUPPORTED_PATHS) {
      assert.ok(!THINKING_UNSUPPORTED_PATHS.includes(p), `${p} must not be in both sets`);
    }
  });
});

// ── 4. Invalid thinking fails clearly ────────────────────────────────────────

describe('invalid-thinking-fails', () => {
  it('throws on unknown thinking level in runtime override', () => {
    const config = makeConfig({ _runtimeOverrides: { model: null, thinking: 'turbo' } });
    assert.throws(
      () => resolvePolicy(config, makeProgress(), 'forge', { dispatchPath: 'acp' }),
      /invalid thinking level 'turbo'/
    );
  });

  it('throws on unknown thinking level in scope override', () => {
    assert.throws(
      () => resolvePolicy(makeConfig(), makeProgress(), 'forge', { scopeThinking: 'extreme', dispatchPath: 'acp' }),
      /invalid thinking level 'extreme'/
    );
  });

  it('throws on invalid thinking in config agent config', () => {
    const config = makeConfig({ agents: { forge: { thinking_level: 'INVALID' } } });
    assert.throws(
      () => resolvePolicy(config, makeProgress(), 'forge', { dispatchPath: 'acp' }),
      /invalid thinking level 'INVALID'/
    );
  });

  it('does NOT throw for null thinking value', () => {
    assert.doesNotThrow(() => validateThinkingLevel(null));
    assert.doesNotThrow(() => validateThinkingLevel(undefined));
    assert.doesNotThrow(() => validateThinkingLevel(''));
  });

  it('does NOT throw for all VALID_THINKING_LEVELS', () => {
    for (const level of VALID_THINKING_LEVELS) {
      assert.doesNotThrow(
        () => validateThinkingLevel(level),
        `Level '${level}' should be valid`
      );
    }
  });

  it('error message includes context label when provided', () => {
    assert.throws(
      () => validateThinkingLevel('bad', 'runtime --thinking'),
      /runtime --thinking/
    );
  });

  it('error message lists all valid values', () => {
    let msg = '';
    try { validateThinkingLevel('bad'); } catch (e) { msg = e.message; }
    for (const v of VALID_THINKING_LEVELS) {
      assert.ok(msg.includes(v), `Error should mention valid value '${v}'`);
    }
  });
});

// ── 5. Policy artifact visibility ─────────────────────────────────────────────

describe('policy-artifact-visibility', () => {
  it('writes a model-policy.jsonl record with all required fields', () => {
    const tmpDir = mkTmp();
    const pipelineLogDir = path.join(tmpDir, 'pipeline');
    fs.mkdirSync(pipelineLogDir, { recursive: true });

    const config = makeConfig({ _logDir: tmpDir, project: 'test-proj' });

    logEffectivePolicy(config, {
      scope:              'module_forge',
      agent:              'forge',
      moduleId:           'test-mod',
      model:              'openai/gpt-5.4',
      model_source:       'runtime_override',
      thinking:           'high',
      thinking_source:    'scope_policy',
      thinking_supported: true,
    });

    const logFile = path.join(tmpDir, 'pipeline', 'model-policy.jsonl');
    assert.ok(fs.existsSync(logFile), 'model-policy.jsonl should exist');

    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);

    assert.equal(record.scope,              'module_forge');
    assert.equal(record.agent,              'forge');
    assert.equal(record.module_id,          'test-mod');
    assert.equal(record.model,              'openai/gpt-5.4');
    assert.equal(record.model_source,       'runtime_override');
    assert.equal(record.thinking,           'high');
    assert.equal(record.thinking_source,    'scope_policy');
    assert.equal(record.thinking_supported, true);
    assert.ok(record.ts,                    'ts field required');
    assert.ok(record.project,              'project field required');
  });

  it('appends multiple records (one per spawn) without overwriting', () => {
    const tmpDir = mkTmp();
    fs.mkdirSync(path.join(tmpDir, 'pipeline'), { recursive: true });
    const config = makeConfig({ _logDir: tmpDir });

    logEffectivePolicy(config, { scope: 'module_forge', agent: 'forge', model: 'A', model_source: 'runtime_override', thinking: null, thinking_source: 'none', thinking_supported: true });
    logEffectivePolicy(config, { scope: 'module_buster', agent: 'buster', model: 'B', model_source: 'project_default', thinking: null, thinking_source: 'not_supported_on_redis', thinking_supported: false });

    const lines = fs.readFileSync(path.join(tmpDir, 'pipeline', 'model-policy.jsonl'), 'utf8')
      .trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 2);

    const records = lines.map(l => JSON.parse(l));
    assert.equal(records[0].scope, 'module_forge');
    assert.equal(records[1].scope, 'module_buster');
    assert.equal(records[1].thinking_supported, false);
  });

  it('gate_id field appears in record when provided', () => {
    const tmpDir = mkTmp();
    fs.mkdirSync(path.join(tmpDir, 'pipeline'), { recursive: true });
    const config = makeConfig({ _logDir: tmpDir });

    logEffectivePolicy(config, { scope: 'gate_buster', agent: 'buster', gateId: 'gate-01', model: null, model_source: 'none', thinking: null, thinking_source: 'not_supported_on_redis', thinking_supported: false });

    const record = JSON.parse(fs.readFileSync(path.join(tmpDir, 'pipeline', 'model-policy.jsonl'), 'utf8').trim());
    assert.equal(record.gate_id, 'gate-01');
    assert.ok(!record.module_id, 'module_id should not appear when not provided');
  });

  it('does not throw when config._logDir is missing', () => {
    const config = makeConfig(); // no _logDir
    assert.doesNotThrow(() => logEffectivePolicy(config, { scope: 'test', agent: 'forge', model: null, model_source: 'none', thinking: null, thinking_source: 'none', thinking_supported: true }));
  });

  it('full pipeline: resolvePolicy output can be fed directly into logEffectivePolicy', () => {
    const tmpDir = mkTmp();
    fs.mkdirSync(path.join(tmpDir, 'pipeline'), { recursive: true });

    const config = makeConfig({
      _logDir: tmpDir,
      _runtimeOverrides: { model: 'claude-sonnet-4-6', thinking: null },
      models: { forge: 'fallback' },
    });

    const policy = resolvePolicy(config, makeProgress(), 'forge', { dispatchPath: 'acp' });
    logEffectivePolicy(config, { scope: 'module_forge', agent: 'forge', moduleId: 'mod-01', ...policy });

    const record = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'pipeline', 'model-policy.jsonl'), 'utf8').trim()
    );
    assert.equal(record.model, 'claude-sonnet-4-6');
    assert.equal(record.model_source, 'runtime_override');
    assert.equal(record.module_id, 'mod-01');
  });
});

// ── 6. resolveModel backward-compat ──────────────────────────────────────────

describe('resolveModel-compat', () => {
  it('explicit model parameter is treated as scope_policy and wins over project/config defaults', () => {
    const config = makeConfig({ models: { forge: 'config-forge' } });
    const progress = makeProgress({ defaults: { models: { forge: 'project-forge' } } });

    const result = resolveModel(config, progress, 'forge', 'explicit-model');
    assert.equal(result, 'explicit-model');
  });

  it('null explicit model falls through to project default', () => {
    const config = makeConfig({ models: { forge: 'config-forge' } });
    const progress = makeProgress({ defaults: { models: { forge: 'project-forge' } } });

    const result = resolveModel(config, progress, 'forge', null);
    assert.equal(result, 'project-forge');
  });

  it('returns null when nothing is configured', () => {
    const result = resolveModel(makeConfig(), makeProgress(), 'forge', null);
    assert.equal(result, null);
  });

  it('runtime override in config._runtimeOverrides is respected by resolveModel', () => {
    const config = makeConfig({
      _runtimeOverrides: { model: 'runtime-model', thinking: null },
      models: { forge: 'config-model' },
    });

    const result = resolveModel(config, makeProgress(), 'forge', null);
    assert.equal(result, 'runtime-model');
  });

  it('object-shaped model value is normalized to its .model property', () => {
    const config = makeConfig({ models: { forge: { model: 'object-model', extra: true } } });
    const result = resolveModel(config, makeProgress(), 'forge', null);
    assert.equal(result, 'object-model');
  });
});

// ── 7. validateThinkingLevel edge cases ──────────────────────────────────────

describe('thinking-validation-inputs', () => {
  it('accepts all documented valid levels', () => {
    const valid = ['none', 'low', 'medium', 'high', 'xhigh'];
    for (const v of valid) {
      assert.doesNotThrow(() => validateThinkingLevel(v), `'${v}' must be valid`);
    }
  });

  it('rejects levels not in the documented list', () => {
    const invalid = ['ultra', 'max', 'XHIGH', 'HIGH', '1', 'turbo', 'fast'];
    for (const v of invalid) {
      assert.throws(() => validateThinkingLevel(v), /invalid thinking level/, `'${v}' must be invalid`);
    }
  });

  it('treats null, undefined, empty string as no-op', () => {
    assert.doesNotThrow(() => validateThinkingLevel(null));
    assert.doesNotThrow(() => validateThinkingLevel(undefined));
    assert.doesNotThrow(() => validateThinkingLevel(''));
  });

  it('VALID_THINKING_LEVELS export matches validation logic', () => {
    for (const v of VALID_THINKING_LEVELS) {
      assert.doesNotThrow(() => validateThinkingLevel(v), `exported level '${v}' must pass own validator`);
    }
    // spot-check a non-member
    assert.throws(() => validateThinkingLevel('notvalid'));
  });
});
