import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

import {
  materializeRuntimeTree,
  importRuntimeModule,
} from '../../lib/lifecycle-audit-lib.mjs';

async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.js');
  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

function withStubbedGeneratorStages(registry) {
  return {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'generator.run': {
        ...registry.stageOwners['generator.run'],
        'generator:project_summary': {
          ...registry.stageOwners['generator.run']['generator:project_summary'],
          implementation: {
            run: async ({ input }) => ({
              schemaVersion: 'v1',
              producerKind: 'generator',
              producerType: input?.ids?.generatorType || 'project_summary',
              outputs: { status: 'ok' },
            }),
          },
        },
        'generator:pipeline_review': {
          ...registry.stageOwners['generator.run']['generator:pipeline_review'],
          implementation: {
            run: async ({ input }) => ({
              schemaVersion: 'v1',
              producerKind: 'generator',
              producerType: input?.ids?.generatorType || 'pipeline_review',
              outputs: { status: 'ok' },
            }),
          },
        },
        'generator:case_study': {
          ...registry.stageOwners['generator.run']['generator:case_study'],
          implementation: {
            run: async ({ input }) => ({
              schemaVersion: 'v1',
              producerKind: 'generator',
              producerType: input?.ids?.generatorType || 'case_study',
              outputs: { status: 'ok' },
            }),
          },
        },
      },
    },
  };
}

function getFieldValue(fields = [], name) {
  return fields.find((field) => field.name === name)?.value;
}

export async function registerSummariesArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  flushAsync,
  xaddEvents,
}) {
  await record('pipeline review rate-limit exhaustion emits authoritative pause telemetry and explicit operator failure', async () => {
    const { runtimeRoot: summaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(summaryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const summaryMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const rateLimitMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/services/rate-limit.js');
    const runtimeCoreMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pipeline-review-rate-limit-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const sessionKey = 'agent:main:acp:pipeline-review-rate-limit';
    const exhaustedSessionKey = 'agent:main:acp:pipeline-review-rate-limit-exhausted';
    const dispatchId = 'dispatch-pipeline-review-rate-limit-1';
    const attempt = 7;
    const discordCalls = [];
    let pollCount = 0;
    let exhaustedResult = null;
  
    const config = {
      project: 'behavior-pipeline-review-rate-limit',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: 'run-pipeline-review-rate-limit-1',
      run_id: 'run-pipeline-review-rate-limit-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 },
      _testOverrides: {
        pipelineReview: {
          spawnSession: async () => ({ childSessionKey: sessionKey, streamLogPath: null, attempt }),
          killSession: async () => true,
          trackAgent: () => {},
          untrackAgent: () => {},
          pollForFile: async () => {
            pollCount++;
            if (pollCount === 1) {
              return { ok: false, reason: 'rate_limited', status: { attempt, reason: 'provider overloaded', provider: 'anthropic', dispatch_id: dispatchId } };
            }
            exhaustedResult = {
              ok: false,
              reason: 'rate_limit_exhausted',
              rate_limit_exhausted: true,
              status: { attempt, reason: 'provider overloaded', provider: 'anthropic' },
              rate_limit_status: { attempt, reason: 'provider overloaded', provider: 'anthropic', session_key: exhaustedSessionKey, max_rate_limit_pauses: 1 },
              rate_limit_pauses: 1,
            };
            return exhaustedResult;
          },
          sleep: async () => {},
          discord: async (_config, _level, title, description, fields) => { discordCalls.push({ title, description, fields }); },
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    };

    const reviewRateLimitExit = await summaryMod.generatePipelineReview(config, { pipeline_review: { attempt } });
    await flushAsync();

    assert.equal(pollCount, 2);
    assert.equal(exhaustedResult?.max_rate_limit_pauses, undefined);
    assert.equal(exhaustedResult?.rate_limit_status?.max_rate_limit_pauses, 1);
    assert.equal(reviewRateLimitExit?.ok, false);
    assert.equal(reviewRateLimitExit?.reason, 'rate_limit_exhausted');
    assert.equal(reviewRateLimitExit?.attempt, attempt);
    assert.equal(reviewRateLimitExit?.run_id, config._runId);
    assert.equal(reviewRateLimitExit?.dispatch_id, dispatchId);
    assert.equal(reviewRateLimitExit?.gateway_label, dispatchId);
    assert.equal(reviewRateLimitExit?.session_key, exhaustedSessionKey);
    assert.equal(reviewRateLimitExit?.max_rate_limit_pauses, 1);
    assert.deepEqual(reviewRateLimitExit?.rate_limit_status, {
      attempt,
      reason: 'provider overloaded',
      provider: 'anthropic',
      status: 'RATE_LIMITED',
      module_id: 'pipeline-review',
      agent_type: 'echo',
      run_id: config._runId,
      dispatch_id: dispatchId,
      gateway_label: dispatchId,
      session_key: exhaustedSessionKey,
      max_rate_limit_pauses: 1,
    });
    assert.deepEqual(discordCalls.map((call) => call.title), [
      '📋 Pipeline Review Spawned',
      '⏳ Rate Limited — Pause 1/1',
      'Rate limit cooldown complete',
      '📋 Pipeline Review Rate Limit Exhausted',
    ]);
    assert.equal(getFieldValue(discordCalls[0].fields, 'Attempt'), `${attempt}`);
    assert.equal(getFieldValue(discordCalls[1].fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(discordCalls[1].fields, 'Session'), sessionKey);
    assert.equal(getFieldValue(discordCalls[1].fields, 'Label'), dispatchId);
    assert.equal(getFieldValue(discordCalls[2].fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(discordCalls[2].fields, 'Session'), sessionKey);
    assert.equal(getFieldValue(discordCalls[2].fields, 'Label'), dispatchId);
    assert.equal(getFieldValue(discordCalls[3].fields, 'Attempt'), `${attempt}`);
    assert.equal(getFieldValue(discordCalls[3].fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(discordCalls[3].fields, 'Session'), exhaustedSessionKey);
    assert.equal(getFieldValue(discordCalls[3].fields, 'Label'), dispatchId);
    assert.equal(discordCalls[3].description, `Pipeline review attempt ${attempt} exceeded max ACP rate limit pauses (1).`);

    const streamKey = 'pipeline:telemetry:behavior-pipeline-review-rate-limit:run-pipeline-review-rate-limit-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['summary.started', 'rate_limit.detected', 'retry.exhausted', 'summary.completed']);
    assert.equal(events[0].summary_type, 'pipeline_review');
    assert.equal(events[0].attempt, attempt);
    assert.equal(typeof events[0].gateway_label, 'string');
    assert.equal(events[0].gateway_label.startsWith('pipeline-review-'), true);
    assert.equal(events[0].model, 'openai-codex/gpt-5.4');
    assert.equal(events[0].runtime, 'subagent');
    assert.equal(events[1].module_id, 'pipeline-review');
    assert.equal(events[1].dispatch_id, dispatchId);
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].agent_type, 'echo');
    assert.equal(events[1].attempt, attempt);
    assert.equal(events[1].pause_count, 1);
    assert.equal(events[2].module_id, 'pipeline-review');
    assert.equal(events[2].attempt, attempt);
    assert.equal(events[2].dispatch_id, dispatchId);
    assert.equal(events[2].gateway_label, dispatchId);
    assert.equal(events[2].phase, 'pipeline_review');
    assert.equal(events[2].session_key, exhaustedSessionKey);
    assert.equal(events[2].reason, 'Pipeline review exceeded max ACP rate limit pauses');
    assert.equal(events[2].max_attempts, 1);
    assert.equal(events[2].max_fails, 1);
    assert.equal(events[3].summary_type, 'pipeline_review');
    assert.equal(events[3].attempt, attempt);
    assert.equal(events[3].status, 'failed');
    assert.equal(events[3].reason, 'Pipeline review exceeded max ACP rate limit pauses');
    assert.equal(events[3].dispatch_id, dispatchId);
    assert.equal(events[3].session_key, exhaustedSessionKey);
    assert.equal(events[3].gateway_label, dispatchId);
    assert.equal(events[3].model, 'openai-codex/gpt-5.4');
    assert.equal(events[3].runtime, 'subagent');

    const canonical = rateLimitMod.buildSessionRateLimitExhaustedResult(
      { attempt, reason: 'provider overloaded', provider: 'anthropic', session_key: sessionKey },
      1,
      1,
    );
    assert.equal(canonical.rate_limit_exhausted, true);
    assert.equal(canonical.reason, 'rate_limit_exhausted');
    assert.deepEqual(canonical.rate_limit_status, { attempt, reason: 'provider overloaded', provider: 'anthropic', session_key: sessionKey });
  });
  
  await record('pipeline review no-output failure emits authoritative summary failure telemetry', async () => {
    const { runtimeRoot: summaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(summaryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const summaryMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const runtimeCoreMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pipeline-review-no-output-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const sessionKey = 'agent:main:acp:pipeline-review-no-output';
    const attempt = 8;
    const discordCalls = [];
  
    const config = {
      project: 'behavior-pipeline-review-no-output',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: 'run-pipeline-review-no-output-1',
      run_id: 'run-pipeline-review-no-output-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineReview: {
          spawnSession: async () => ({ childSessionKey: sessionKey, streamLogPath: null, attempt }),
          killSession: async () => true,
          trackAgent: () => {},
          untrackAgent: () => {},
          pollForFile: async () => ({ ok: false, reason: 'timeout', status: { attempt, session_key: sessionKey } }),
          sleep: async () => {},
          discord: async (_config, _level, title, description, fields) => { discordCalls.push({ title, description, fields }); },
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    };

    await summaryMod.generatePipelineReview(config, { pipeline_review: { attempt } });
    await flushAsync();

    assert.deepEqual(discordCalls.map((call) => call.title), [
      '📋 Pipeline Review Spawned',
      '📋 Pipeline Review: No Output',
      '📋 Pipeline Review Failed',
    ]);
    assert.equal(getFieldValue(discordCalls[0].fields, 'Attempt'), `${attempt}`);
    assert.equal(getFieldValue(discordCalls[1].fields, 'Attempt'), `${attempt}`);
    assert.equal(getFieldValue(discordCalls[2].fields, 'Attempt'), `${attempt}`);

    const streamKey = 'pipeline:telemetry:behavior-pipeline-review-no-output:run-pipeline-review-no-output-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['summary.started', 'summary.completed']);
    assert.equal(events[0].summary_type, 'pipeline_review');
    assert.equal(events[0].attempt, attempt);
    assert.equal(typeof events[0].gateway_label, 'string');
    assert.equal(events[0].gateway_label.startsWith('pipeline-review-'), true);
    assert.equal(events[0].model, 'openai-codex/gpt-5.4');
    assert.equal(events[0].runtime, 'subagent');
    assert.equal(events[1].summary_type, 'pipeline_review');
    assert.equal(events[1].attempt, attempt);
    assert.equal(events[1].status, 'failed');
    assert.equal(events[1].reason, 'Pipeline review failed: timeout');
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].gateway_label, events[0].gateway_label);
    assert.equal(events[1].model, 'openai-codex/gpt-5.4');
    assert.equal(events[1].runtime, 'subagent');
  });

  await record('pipeline review no-output failure preserves terminal detail in failure surfaces', async () => {
    const { runtimeRoot: summaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(summaryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const summaryMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const runtimeCoreMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pipeline-review-terminal-detail-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const sessionKey = 'agent:main:acp:pipeline-review-terminal-detail';
    const discordCalls = [];

    const config = {
      project: 'behavior-pipeline-review-terminal-detail',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: 'run-pipeline-review-terminal-detail-1',
      run_id: 'run-pipeline-review-terminal-detail-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineReview: {
          spawnSession: async () => ({ childSessionKey: sessionKey, streamLogPath: null }),
          killSession: async () => true,
          trackAgent: () => {},
          untrackAgent: () => {},
          pollForFile: async () => ({
            ok: false,
            reason: 'session_ended_no_output',
            status: { session_key: sessionKey, detail: 'adapter command missing', state: 'error' },
          }),
          sleep: async () => {},
          discord: async (_config, _level, title, description) => { discordCalls.push({ title, description }); },
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    };

    await summaryMod.generatePipelineReview(config, {});
    await flushAsync();

    assert.equal(discordCalls[1].title, '📋 Pipeline Review: No Output');
    assert.equal(discordCalls[1].description.includes('adapter command missing'), true);
    assert.equal(discordCalls[2].title, '📋 Pipeline Review Failed');
    assert.equal(discordCalls[2].description.includes('adapter command missing'), true);

    const streamKey = 'pipeline:telemetry:behavior-pipeline-review-terminal-detail:run-pipeline-review-terminal-detail-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['summary.started', 'summary.completed']);
    assert.equal(events[1].summary_type, 'pipeline_review');
    assert.equal(events[1].status, 'failed');
    assert.equal(events[1].reason, 'Pipeline review failed: session_ended_no_output (adapter command missing)');
    assert.equal(events[1].session_key, sessionKey);
  });
  
  await record('case study rate-limit exhaustion emits authoritative pause telemetry and explicit operator failure', async () => {
    const { runtimeRoot: caseStudyRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(caseStudyRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const caseStudyMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/services/case-study.js');
    const rateLimitMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/services/rate-limit.js');
    const runtimeCoreMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-case-study-rate-limit-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const sessionKey = 'agent:main:acp:case-study-rate-limit';
    const exhaustedSessionKey = 'agent:main:acp:case-study-rate-limit-exhausted';
    const dispatchId = 'dispatch-case-study-rate-limit-1';
    const attempt = 5;
    const discordCalls = [];
    let pollCount = 0;
    let exhaustedResult = null;
  
    const config = {
      project: 'behavior-case-study-rate-limit',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: 'run-case-study-rate-limit-1',
      run_id: 'run-case-study-rate-limit-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 },
      case_study: { enabled: true },
      _testOverrides: {
        caseStudy: {
          spawnSession: async () => ({ childSessionKey: sessionKey, streamLogPath: null, attempt }),
          killSession: async () => true,
          trackAgent: () => {},
          untrackAgent: () => {},
          emitEvent: async () => {},
          pollForFile: async () => {
            pollCount++;
            if (pollCount === 1) {
              return { ok: false, reason: 'rate_limited', status: { attempt, reason: 'provider overloaded', provider: 'anthropic', dispatch_id: dispatchId } };
            }
            exhaustedResult = {
              ok: false,
              reason: 'rate_limit_exhausted',
              rate_limit_exhausted: true,
              status: { attempt, reason: 'provider overloaded', provider: 'anthropic' },
              rate_limit_status: { attempt, reason: 'provider overloaded', provider: 'anthropic', session_key: exhaustedSessionKey, max_rate_limit_pauses: 1 },
              rate_limit_pauses: 1,
            };
            return exhaustedResult;
          },
          sleep: async () => {},
          discord: async (_config, _level, title, description, fields) => { discordCalls.push({ title, description, fields }); },
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    };

    const caseStudyRateLimitExit = await caseStudyMod.generateCaseStudy(config, { case_study: { enabled: true, attempt } });
    await flushAsync();

    assert.equal(pollCount, 2);
    assert.equal(exhaustedResult?.max_rate_limit_pauses, undefined);
    assert.equal(exhaustedResult?.rate_limit_status?.max_rate_limit_pauses, 1);
    assert.equal(caseStudyRateLimitExit?.ok, false);
    assert.equal(caseStudyRateLimitExit?.reason, 'rate_limit_exhausted');
    assert.equal(caseStudyRateLimitExit?.attempt, attempt);
    assert.equal(caseStudyRateLimitExit?.run_id, config._runId);
    assert.equal(caseStudyRateLimitExit?.dispatch_id, dispatchId);
    assert.equal(caseStudyRateLimitExit?.gateway_label, dispatchId);
    assert.equal(caseStudyRateLimitExit?.session_key, exhaustedSessionKey);
    assert.equal(caseStudyRateLimitExit?.max_rate_limit_pauses, 1);
    assert.deepEqual(caseStudyRateLimitExit?.rate_limit_status, {
      attempt,
      reason: 'provider overloaded',
      provider: 'anthropic',
      status: 'RATE_LIMITED',
      module_id: 'case-study',
      agent_type: 'echo',
      run_id: config._runId,
      dispatch_id: dispatchId,
      gateway_label: dispatchId,
      session_key: exhaustedSessionKey,
      max_rate_limit_pauses: 1,
    });
    assert.deepEqual(discordCalls.map((call) => call.title), [
      '📝 Case Study Agent Spawned',
      '⏳ Rate Limited — Pause 1/1',
      'Rate limit cooldown complete',
      '📝 Case Study Rate Limit Exhausted',
    ]);
    assert.equal(getFieldValue(discordCalls[0].fields, 'Attempt'), `${attempt}`);
    assert.equal(getFieldValue(discordCalls[1].fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(discordCalls[1].fields, 'Session'), sessionKey);
    assert.equal(getFieldValue(discordCalls[1].fields, 'Label'), dispatchId);
    assert.equal(getFieldValue(discordCalls[2].fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(discordCalls[2].fields, 'Session'), sessionKey);
    assert.equal(getFieldValue(discordCalls[2].fields, 'Label'), dispatchId);
    assert.equal(getFieldValue(discordCalls[3].fields, 'Attempt'), `${attempt}`);
    assert.equal(getFieldValue(discordCalls[3].fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(discordCalls[3].fields, 'Session'), exhaustedSessionKey);
    assert.equal(getFieldValue(discordCalls[3].fields, 'Label'), dispatchId);
    assert.equal(discordCalls[3].description, `Case study attempt ${attempt} exceeded max ACP rate limit pauses (1).`);

    const streamKey = 'pipeline:telemetry:behavior-case-study-rate-limit:run-case-study-rate-limit-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['summary.started', 'rate_limit.detected', 'retry.exhausted', 'summary.completed']);
    assert.equal(events[0].summary_type, 'case_study');
    assert.equal(events[0].attempt, attempt);
    assert.equal(typeof events[0].gateway_label, 'string');
    assert.equal(events[0].gateway_label.startsWith('case-study-'), true);
    assert.equal(events[0].model, 'anthropic/claude-sonnet-4-6');
    assert.equal(events[0].runtime, 'acp');
    assert.equal(events[1].module_id, 'case-study');
    assert.equal(events[1].dispatch_id, dispatchId);
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].agent_type, 'echo');
    assert.equal(events[1].attempt, attempt);
    assert.equal(events[1].pause_count, 1);
    assert.equal(events[2].module_id, 'case-study');
    assert.equal(events[2].attempt, attempt);
    assert.equal(events[2].dispatch_id, dispatchId);
    assert.equal(events[2].gateway_label, dispatchId);
    assert.equal(events[2].phase, 'case_study');
    assert.equal(events[2].session_key, exhaustedSessionKey);
    assert.equal(events[2].reason, 'Case study generation exceeded max ACP rate limit pauses');
    assert.equal(events[2].max_attempts, 1);
    assert.equal(events[2].max_fails, 1);
    assert.equal(events[3].summary_type, 'case_study');
    assert.equal(events[3].attempt, attempt);
    assert.equal(events[3].status, 'failed');
    assert.equal(events[3].reason, 'Case study generation exceeded max ACP rate limit pauses');
    assert.equal(events[3].dispatch_id, dispatchId);
    assert.equal(events[3].session_key, exhaustedSessionKey);
    assert.equal(events[3].gateway_label, dispatchId);
    assert.equal(events[3].model, 'anthropic/claude-sonnet-4-6');
    assert.equal(events[3].runtime, 'acp');

    const canonical = rateLimitMod.buildSessionRateLimitExhaustedResult(
      { attempt, reason: 'provider overloaded', provider: 'anthropic', session_key: sessionKey },
      1,
      1,
    );
    assert.equal(canonical.rate_limit_exhausted, true);
    assert.equal(canonical.reason, 'rate_limit_exhausted');
    assert.deepEqual(canonical.rate_limit_status, { attempt, reason: 'provider overloaded', provider: 'anthropic', session_key: sessionKey });
  });
  
  await record('case study no-output failure emits authoritative summary failure telemetry', async () => {
    const { runtimeRoot: caseStudyRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(caseStudyRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const caseStudyMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/services/case-study.js');
    const runtimeCoreMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-case-study-no-output-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const sessionKey = 'agent:main:acp:case-study-no-output';
    const attempt = 6;
    const discordCalls = [];

    const config = {
      project: 'behavior-case-study-no-output',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: 'run-case-study-no-output-1',
      run_id: 'run-case-study-no-output-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      case_study: { enabled: true },
      _testOverrides: {
        caseStudy: {
          spawnSession: async () => ({ childSessionKey: sessionKey, streamLogPath: null, attempt }),
          killSession: async () => true,
          trackAgent: () => {},
          untrackAgent: () => {},
          emitEvent: async () => {},
          pollForFile: async () => ({ ok: false, reason: 'timeout', status: { attempt, session_key: sessionKey } }),
          sleep: async () => {},
          discord: async (_config, _level, title, _description, fields) => { discordCalls.push({ title, fields }); },
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    };

    await caseStudyMod.generateCaseStudy(config, { case_study: { enabled: true, attempt } });
    await flushAsync();

    assert.deepEqual(discordCalls.map((call) => call.title), [
      '📝 Case Study Agent Spawned',
      '📝 Case Study: No Output',
      '📝 Case Study Failed',
    ]);
    assert.equal(getFieldValue(discordCalls[0].fields, 'Attempt'), `${attempt}`);
    assert.equal(getFieldValue(discordCalls[1].fields, 'Attempt'), `${attempt}`);
    assert.equal(getFieldValue(discordCalls[2].fields, 'Attempt'), `${attempt}`);

    const streamKey = 'pipeline:telemetry:behavior-case-study-no-output:run-case-study-no-output-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['summary.started', 'summary.completed']);
    assert.equal(events[0].summary_type, 'case_study');
    assert.equal(events[0].attempt, attempt);
    assert.equal(typeof events[0].gateway_label, 'string');
    assert.equal(events[0].gateway_label.startsWith('case-study-'), true);
    assert.equal(events[0].model, 'anthropic/claude-sonnet-4-6');
    assert.equal(events[0].runtime, 'acp');
    assert.equal(events[1].summary_type, 'case_study');
    assert.equal(events[1].attempt, attempt);
    assert.equal(events[1].status, 'failed');
    assert.equal(events[1].reason, 'Case study generation failed: timeout');
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].gateway_label, events[0].gateway_label);
    assert.equal(events[1].model, 'anthropic/claude-sonnet-4-6');
    assert.equal(events[1].runtime, 'acp');
  });

  await record('case study no-output failure preserves terminal detail in failure surfaces', async () => {
    const { runtimeRoot: caseStudyRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(caseStudyRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const caseStudyMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/services/case-study.js');
    const runtimeCoreMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-case-study-terminal-detail-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const sessionKey = 'agent:main:acp:case-study-terminal-detail';
    const discordCalls = [];

    const config = {
      project: 'behavior-case-study-terminal-detail',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: 'run-case-study-terminal-detail-1',
      run_id: 'run-case-study-terminal-detail-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      case_study: { enabled: true },
      _testOverrides: {
        caseStudy: {
          spawnSession: async () => ({ childSessionKey: sessionKey, streamLogPath: null }),
          killSession: async () => true,
          trackAgent: () => {},
          untrackAgent: () => {},
          emitEvent: async () => {},
          pollForFile: async () => ({
            ok: false,
            reason: 'session_ended_no_output',
            status: { session_key: sessionKey, detail: 'adapter command missing', state: 'error' },
          }),
          sleep: async () => {},
          discord: async (_config, _level, title, description) => { discordCalls.push({ title, description }); },
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    };

    await caseStudyMod.generateCaseStudy(config, {});
    await flushAsync();

    assert.equal(discordCalls[1].title, '📝 Case Study: No Output');
    assert.equal(discordCalls[1].description.includes('adapter command missing'), true);
    assert.equal(discordCalls[2].title, '📝 Case Study Failed');
    assert.equal(discordCalls[2].description.includes('adapter command missing'), true);

    const streamKey = 'pipeline:telemetry:behavior-case-study-terminal-detail:run-case-study-terminal-detail-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['summary.started', 'summary.completed']);
    assert.equal(events[1].summary_type, 'case_study');
    assert.equal(events[1].status, 'failed');
    assert.equal(events[1].reason, 'Case study generation failed: session_ended_no_output (adapter command missing)');
    assert.equal(events[1].session_key, sessionKey);
  });

  await record('case study success uses only canonical summary lifecycle events', async () => {
    const { runtimeRoot: caseStudyRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(caseStudyRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const caseStudyMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/services/case-study.js');
    const runtimeCoreMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-case-study-success-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const sessionKey = 'agent:main:acp:case-study-success';
    const outputFilePath = path.join(swarmDir, 'logs', 'pipeline', 'case-study.md');

    const config = {
      project: 'behavior-case-study-success',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: 'run-case-study-success-1',
      run_id: 'run-case-study-success-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      case_study: { enabled: true },
      _testOverrides: {
        caseStudy: {
          spawnSession: async () => ({ childSessionKey: sessionKey, streamLogPath: null }),
          killSession: async () => true,
          trackAgent: () => {},
          untrackAgent: () => {},
          pollForFile: async () => {
            fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
            fs.writeFileSync(outputFilePath, '# Case Study\n');
            return { ok: true, status: { session_key: sessionKey } };
          },
          sleep: async () => {},
          discord: async () => {},
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    };

    await caseStudyMod.generateCaseStudy(config, {});
    await flushAsync();

    const streamKey = 'pipeline:telemetry:behavior-case-study-success:run-case-study-success-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['summary.started', 'summary.completed']);
    assert.equal(events[0].summary_type, 'case_study');
    assert.equal(events[0].gateway_label.startsWith('case-study-'), true);
    assert.equal(events[0].model, 'anthropic/claude-sonnet-4-6');
    assert.equal(events[0].runtime, 'acp');
    assert.equal(events[1].summary_type, 'case_study');
    assert.equal(events[1].status, 'ok');
    assert.equal(events[1].output, outputFilePath);
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].gateway_label, events[0].gateway_label);
    assert.equal(fs.existsSync(outputFilePath), true);
  });

  await record('project summary emits authoritative summary lifecycle telemetry with artifact paths', async () => {
    const { runtimeRoot: projectSummaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(projectSummaryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const summaryMod = await importRuntimeModule(projectSummaryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const runtimeCoreMod = await importRuntimeModule(projectSummaryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-project-summary-ok-'));
    const logRoot = path.join(repoRoot, '.swarm', 'logs');
    fs.mkdirSync(path.join(logRoot, 'pipeline'), { recursive: true });
    const summaryModulePath = path.join(repoRoot, 'project-summary-test.mjs');
    fs.writeFileSync(summaryModulePath, `
  export async function generateSummary() {
    return {
      markdown: '# Summary\\n',
      data: { status: 'ok' },
      caseStudyBase: { project: 'behavior-project-summary-ok' },
      embeds: [],
    };
  }
  
  export async function postToDiscord() {}
  `);
  
    const config = {
      project: 'behavior-project-summary-ok',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      _runId: 'run-project-summary-ok-1',
      run_id: 'run-project-summary-ok-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _logDir: logRoot,
      paths: { project_summary_js: summaryModulePath },
    };
  
    await summaryMod.generateProjectSummary(config);
    await flushAsync();
  
    const streamKey = 'pipeline:telemetry:behavior-project-summary-ok:run-project-summary-ok-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['summary.started', 'summary.completed']);
    assert.equal(events[0].summary_type, 'project_summary');
    assert.equal(events[0].output_dir, path.join(logRoot, 'pipeline'));
    assert.equal(events[1].summary_type, 'project_summary');
    assert.equal(events[1].status, 'ok');
    assert.equal(events[1].output_dir, path.join(logRoot, 'pipeline'));
    assert.equal(events[1].markdown_path, path.join(logRoot, 'pipeline', 'project-summary.md'));
    assert.equal(events[1].data_path, path.join(logRoot, 'pipeline', 'project-summary.json'));
    assert.equal(events[1].case_study_base_path, path.join(logRoot, 'pipeline', 'case-study.base.json'));
  });
  
  await record('project summary normalizes stale lifecycle terminal fields on read', async () => {
    const { runtimeRoot: projectSummaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    const projectSummaryMod = await importRuntimeModule(projectSummaryRuntimeRoot, '/app/skills/pipeline/tools/project-summary.js');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-project-summary-normalized-'));
    const configPath = path.join(repoRoot, 'swarm.config.json');
    const project = 'behavior-project-summary-normalized';
    const projectRoot = path.join(repoRoot, 'Projects', project, 'src');
    const swarmRoot = path.join(projectRoot, '.swarm');
    const modulesRoot = path.join(swarmRoot, 'modules');

    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(modulesRoot, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ projects_root: 'Projects' }, null, 2));
    fs.writeFileSync(path.join(projectRoot, 'index.js'), 'export const ok = true;\n');
    fs.writeFileSync(path.join(swarmRoot, 'progress.json'), JSON.stringify({
      execution_order: ['01', '02', '03'],
      modules: {
        '01': { dir: '01', title: 'Pass module' },
        '02': { dir: '02', title: 'Fail module' },
        '03': { dir: '03', title: 'Retry module' },
      },
      gates: {},
    }, null, 2));

    for (const dir of ['01', '02', '03']) {
      fs.mkdirSync(path.join(modulesRoot, dir), { recursive: true });
    }

    fs.writeFileSync(path.join(modulesRoot, '01', 'status.json'), JSON.stringify({
      status: 'PASS',
      fail_count: 0,
      started_at: '2026-04-09T09:00:00.000Z',
      completed_at: '2026-04-09T10:00:00.000Z',
      completion_summary: 'All suites passed',
      cost: { total_duration_seconds: 3600 },
      history: [],
    }, null, 2));
    fs.writeFileSync(path.join(modulesRoot, '02', 'status.json'), JSON.stringify({
      status: 'FAIL',
      fail_count: 1,
      started_at: '2026-04-10T09:00:00.000Z',
      completed_at: '2026-04-10T11:00:00.000Z',
      completion_summary: 'Current buster failure detail',
      fail_summaries: [{ summary: 'Current buster failure detail' }],
      cost: { total_duration_seconds: 1800 },
      history: [],
    }, null, 2));
    fs.writeFileSync(path.join(modulesRoot, '03', 'status.json'), JSON.stringify({
      status: 'IN_PROGRESS',
      fail_count: 1,
      started_at: '2026-04-11T09:00:00.000Z',
      completed_at: '2026-04-11T12:00:00.000Z',
      completion_summary: 'Stale prior buster summary',
      cost: { total_duration_seconds: 7200 },
      history: [],
    }, null, 2));

    const result = await projectSummaryMod.generateSummary({ project, repoDir: repoRoot, configPath });
    const pipeline = result.data.pipeline;
    const passModule = pipeline.moduleStats.find((entry) => entry.id === '01');
    const failModule = pipeline.moduleStats.find((entry) => entry.id === '02');
    const retryModule = pipeline.moduleStats.find((entry) => entry.id === '03');

    assert.equal(passModule.completedAt, '2026-04-09T10:00:00.000Z');
    assert.equal(passModule.completionSummary, 'All suites passed');
    assert.equal(failModule.completedAt, null);
    assert.equal(failModule.completionSummary, 'Current buster failure detail');
    assert.equal(retryModule.completedAt, null);
    assert.equal(retryModule.completionSummary, null);
    assert.equal(pipeline.latestComplete, '2026-04-09T10:00:00.000Z');
    assert.equal(result.caseStudyBase.delivery.completed_at, '2026-04-09T10:00:00.000Z');
  });

  await record('project summary failure emits authoritative summary failure telemetry', async () => {
    const { runtimeRoot: projectSummaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(projectSummaryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const summaryMod = await importRuntimeModule(projectSummaryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const runtimeCoreMod = await importRuntimeModule(projectSummaryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-project-summary-fail-'));
    const logRoot = path.join(repoRoot, '.swarm', 'logs');
    const config = {
      project: 'behavior-project-summary-fail',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      _runId: 'run-project-summary-fail-1',
      run_id: 'run-project-summary-fail-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _logDir: logRoot,
      paths: { project_summary_js: path.join(repoRoot, 'missing-project-summary.mjs') },
    };
  
    await summaryMod.generateProjectSummary(config);
    await flushAsync();
  
    const streamKey = 'pipeline:telemetry:behavior-project-summary-fail:run-project-summary-fail-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['summary.started', 'summary.completed']);
    assert.equal(events[0].summary_type, 'project_summary');
    assert.equal(events[0].output_dir, path.join(logRoot, 'pipeline'));
    assert.equal(events[1].summary_type, 'project_summary');
    assert.equal(events[1].status, 'failed');
    assert.equal(events[1].output_dir, path.join(logRoot, 'pipeline'));
    assert.equal(typeof events[1].reason, 'string');
    assert.equal(events[1].reason.includes('missing-project-summary.mjs'), true);
  });
  
  await record('project summary Discord embeds preserve run correlation and audit mirroring', async () => {
    const { runtimeRoot: projectSummaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(projectSummaryRuntimeRoot);
  
    const summaryMod = await importRuntimeModule(projectSummaryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-project-summary-discord-'));
    const logRoot = path.join(repoRoot, '.swarm', 'logs');
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', 'run-project-summary-discord-1');
    fs.mkdirSync(runLogDir, { recursive: true });
    const summaryModulePath = path.join(repoRoot, 'project-summary-discord-test.mjs');
    fs.writeFileSync(summaryModulePath, `
  export async function generateSummary() {
    return {
      markdown: '# Summary\\n',
      data: { status: 'ok' },
      caseStudyBase: { project: 'behavior-project-summary-discord' },
      embeds: [{ title: 'Project Summary Embed', fields: [{ name: 'Status', value: 'GO', inline: true }] }],
    };
  }
  `);
  
    await summaryMod.generateProjectSummary({
      project: 'behavior-project-summary-discord',
      repo_root: repoRoot,
      _runId: 'run-project-summary-discord-1',
      run_id: 'run-project-summary-discord-1',
      _logDir: logRoot,
      _runLogDir: runLogDir,
      _disable_discord_webhooks: true,
      discord_webhook_url: 'https://example.invalid/webhook',
      paths: { project_summary_js: summaryModulePath },
    });
  
    const topLevelEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    const runScopedEntry = JSON.parse(fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(topLevelEntry.run_id, 'run-project-summary-discord-1');
    assert.equal(runScopedEntry.run_id, 'run-project-summary-discord-1');
    assert.equal(topLevelEntry.title, 'Project Summary Embed');
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Run ID' && field.value === 'run-project-summary-discord-1'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Markdown' && String(field.value).includes('project-summary.md')), true);
  });

  await record('project-summary tool Discord delivery now flows through canonical pipeline audit mirroring with run correlation', async () => {
    const { runtimeRoot: projectSummaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(projectSummaryRuntimeRoot);

    const projectSummaryMod = await importRuntimeModule(projectSummaryRuntimeRoot, '/app/skills/pipeline/tools/project-summary.js');
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-project-summary-tool-discord-'));
    const project = 'behavior-project-summary-tool-discord';
    const projectRoot = path.join(repoRoot, 'Projects', project, 'src');
    const swarmRoot = path.join(projectRoot, '.swarm');
    const logRoot = path.join(swarmRoot, 'logs');
    const runId = 'run-project-summary-tool-discord-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    const configPath = path.join(repoRoot, 'swarm.config.json');
    const outputPath = path.join(logRoot, 'pipeline', 'tool-project-summary.md');

    fs.mkdirSync(runLogDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ projects_root: 'Projects' }, null, 2));
    fs.writeFileSync(path.join(logRoot, 'pipeline', 'latest.json'), JSON.stringify({ run_id: runId }, null, 2));

    const oldWebhook = process.env.DISCORD_WEBHOOK;
    process.env.DISCORD_WEBHOOK = 'https://example.invalid/webhook';
    try {
      await projectSummaryMod.postToDiscord([{ title: 'Direct Project Summary Tool Embed', fields: [{ name: 'Status', value: 'GO', inline: true }] }], {
        project,
        repoDir: repoRoot,
        configPath,
        runId,
        outputFile: outputPath,
        disableDiscordWebhooks: true,
      });
    } finally {
      process.env.DISCORD_WEBHOOK = oldWebhook;
    }

    const topLevelEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    const runScopedEntry = JSON.parse(fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(topLevelEntry.title, 'Direct Project Summary Tool Embed');
    assert.equal(topLevelEntry.run_id, runId);
    assert.equal(runScopedEntry.run_id, runId);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Markdown' && String(field.value).includes('tool-project-summary.md')), true);
  });

  await record('pipeline review rate-limit exhaustion emits canonical operator Discord alerts with correlation and audit mirroring', async () => {
    const { runtimeRoot: summaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(summaryRuntimeRoot);

    const summaryMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const runtimeCoreMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pipeline-review-rate-limit-discord-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const logRoot = path.join(swarmDir, 'logs');
    const runId = 'run-pipeline-review-rate-limit-discord-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    fs.mkdirSync(runLogDir, { recursive: true });
    const sessionKey = 'agent:main:acp:pipeline-review-rate-limit-discord';
    const exhaustedSessionKey = 'agent:main:acp:pipeline-review-rate-limit-exhausted-status';
    const dispatchId = 'dispatch-pipeline-review-rate-limit-1';
    let pollCount = 0;

    const config = {
      project: 'behavior-pipeline-review-rate-limit-discord',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _logDir: logRoot,
      _runLogDir: runLogDir,
      _disable_discord_webhooks: true,
      discord_webhook_url: 'https://example.invalid/webhook',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 },
      _testOverrides: {
        pipelineReview: {
          spawnSession: async () => ({ childSessionKey: sessionKey, streamLogPath: null, attempt: 4 }),
          killSession: async () => true,
          trackAgent: () => {},
          untrackAgent: () => {},
          pollForFile: async () => {
            pollCount++;
            if (pollCount === 1) {
              return { ok: false, reason: 'rate_limited', status: { attempt: 4, reason: 'provider overloaded', provider: 'anthropic', dispatch_id: dispatchId } };
            }
            return {
              ok: false,
              reason: 'rate_limit_exhausted',
              rate_limit_exhausted: true,
              status: { attempt: 4, reason: 'provider overloaded', provider: 'anthropic' },
              rate_limit_status: { attempt: 4, reason: 'provider overloaded', provider: 'anthropic', session_key: exhaustedSessionKey, max_rate_limit_pauses: 1 },
              rate_limit_pauses: 1,
            };
          },
          sleep: async () => {},
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    };

    await summaryMod.generatePipelineReview(config, { pipeline_review: { attempt: 4 } });
    await flushAsync();

    const topLevelEntries = fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const runScopedEntries = fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const spawnEntry = runScopedEntries.find((entry) => entry.title === '📋 Pipeline Review Spawned');
    const pauseEntry = runScopedEntries.find((entry) => entry.title === '⏳ Rate Limited — Pause 1/1');
    const resumeEntry = runScopedEntries.find((entry) => entry.title === 'Rate limit cooldown complete');
    const exhaustedEntry = runScopedEntries.find((entry) => entry.title === '📋 Pipeline Review Rate Limit Exhausted');

    assert.equal(topLevelEntries.some((entry) => entry.title === '📋 Pipeline Review Spawned'), true);
    assert.equal(topLevelEntries.some((entry) => entry.title === '⏳ Rate Limited — Pause 1/1'), true);
    assert.equal(topLevelEntries.some((entry) => entry.title === 'Rate limit cooldown complete'), true);
    assert.equal(topLevelEntries.some((entry) => entry.title === '📋 Pipeline Review Rate Limit Exhausted'), true);
    assert.equal(Boolean(spawnEntry), true);
    assert.equal(Boolean(pauseEntry), true);
    assert.equal(Boolean(resumeEntry), true);
    assert.equal(Boolean(exhaustedEntry), true);
    assert.equal(exhaustedEntry.run_id, runId);
    assert.equal(exhaustedEntry.session_key, exhaustedSessionKey);
    assert.equal(exhaustedEntry.dispatch_id, dispatchId);
    assert.equal(exhaustedEntry.gateway_label, dispatchId);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Attempt' && field.value === '4'), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Session' && field.value === sessionKey), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Label' && field.value === dispatchId), true);
    assert.equal(resumeEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(resumeEntry.fields.some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(resumeEntry.fields.some((field) => field.name === 'Session' && field.value === sessionKey), true);
    assert.equal(resumeEntry.fields.some((field) => field.name === 'Label' && field.value === dispatchId), true);
    assert.equal(exhaustedEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(exhaustedEntry.fields.some((field) => field.name === 'Attempt' && field.value === '4'), true);
    assert.equal(exhaustedEntry.fields.some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(exhaustedEntry.fields.some((field) => field.name === 'Session' && field.value === exhaustedSessionKey), true);
    assert.equal(exhaustedEntry.fields.some((field) => field.name === 'Label' && field.value === dispatchId), true);
  });

  await record('case study rate-limit exhaustion emits canonical operator Discord alerts with correlation and audit mirroring', async () => {
    const { runtimeRoot: caseStudyRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(caseStudyRuntimeRoot);

    const caseStudyMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/services/case-study.js');
    const runtimeCoreMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-case-study-rate-limit-discord-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const logRoot = path.join(swarmDir, 'logs');
    const runId = 'run-case-study-rate-limit-discord-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    fs.mkdirSync(runLogDir, { recursive: true });
    const sessionKey = 'agent:main:acp:case-study-rate-limit-discord';
    const exhaustedSessionKey = 'agent:main:acp:case-study-rate-limit-exhausted-status';
    const dispatchId = 'dispatch-case-study-rate-limit-1';
    const attempt = 5;
    let pollCount = 0;

    const config = {
      project: 'behavior-case-study-rate-limit-discord',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _logDir: logRoot,
      _runLogDir: runLogDir,
      _disable_discord_webhooks: true,
      discord_webhook_url: 'https://example.invalid/webhook',
      rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 },
      case_study: { enabled: true },
      _testOverrides: {
        caseStudy: {
          spawnSession: async () => ({ childSessionKey: sessionKey, streamLogPath: null, attempt }),
          killSession: async () => true,
          trackAgent: () => {},
          untrackAgent: () => {},
          emitEvent: async () => {},
          pollForFile: async () => {
            pollCount++;
            if (pollCount === 1) {
              return { ok: false, reason: 'rate_limited', status: { attempt, reason: 'provider overloaded', provider: 'anthropic', dispatch_id: dispatchId } };
            }
            return {
              ok: false,
              reason: 'rate_limit_exhausted',
              rate_limit_exhausted: true,
              status: { attempt, reason: 'provider overloaded', provider: 'anthropic' },
              rate_limit_status: { attempt, reason: 'provider overloaded', provider: 'anthropic', session_key: exhaustedSessionKey, max_rate_limit_pauses: 1 },
              rate_limit_pauses: 1,
            };
          },
          sleep: async () => {},
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    };

    await caseStudyMod.generateCaseStudy(config, { case_study: { enabled: true, attempt } });
    await flushAsync();

    const topLevelEntries = fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const runScopedEntries = fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const spawnEntry = runScopedEntries.find((entry) => entry.title === '📝 Case Study Agent Spawned');
    const pauseEntry = runScopedEntries.find((entry) => entry.title === '⏳ Rate Limited — Pause 1/1');
    const resumeEntry = runScopedEntries.find((entry) => entry.title === 'Rate limit cooldown complete');
    const exhaustedEntry = runScopedEntries.find((entry) => entry.title === '📝 Case Study Rate Limit Exhausted');

    assert.equal(topLevelEntries.some((entry) => entry.title === '📝 Case Study Agent Spawned'), true);
    assert.equal(topLevelEntries.some((entry) => entry.title === '⏳ Rate Limited — Pause 1/1'), true);
    assert.equal(topLevelEntries.some((entry) => entry.title === 'Rate limit cooldown complete'), true);
    assert.equal(topLevelEntries.some((entry) => entry.title === '📝 Case Study Rate Limit Exhausted'), true);
    assert.equal(Boolean(spawnEntry), true);
    assert.equal(Boolean(pauseEntry), true);
    assert.equal(Boolean(resumeEntry), true);
    assert.equal(Boolean(exhaustedEntry), true);
    assert.equal(exhaustedEntry.run_id, runId);
    assert.equal(exhaustedEntry.session_key, exhaustedSessionKey);
    assert.equal(exhaustedEntry.dispatch_id, dispatchId);
    assert.equal(exhaustedEntry.gateway_label, dispatchId);
    assert.equal(spawnEntry.fields.some((field) => field.name === 'Attempt' && field.value === `${attempt}`), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Session' && field.value === sessionKey), true);
    assert.equal(pauseEntry.fields.some((field) => field.name === 'Label' && field.value === dispatchId), true);
    assert.equal(resumeEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(resumeEntry.fields.some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(resumeEntry.fields.some((field) => field.name === 'Session' && field.value === sessionKey), true);
    assert.equal(resumeEntry.fields.some((field) => field.name === 'Label' && field.value === dispatchId), true);
    assert.equal(exhaustedEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(exhaustedEntry.fields.some((field) => field.name === 'Attempt' && field.value === `${attempt}`), true);
    assert.equal(exhaustedEntry.fields.some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(exhaustedEntry.fields.some((field) => field.name === 'Session' && field.value === exhaustedSessionKey), true);
    assert.equal(exhaustedEntry.fields.some((field) => field.name === 'Label' && field.value === dispatchId), true);
  });

  await record('shared tracked summary rate-limit exhaustion options preserve dispatch correlation', async () => {
    const { runtimeRoot: summaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(summaryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const rateLimitMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/services/rate-limit.js');
    const runtimeCoreMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-summary-rate-limit-default-fields-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const runId = 'run-summary-rate-limit-default-fields-1';
    const dispatchId = 'dispatch-summary-rate-limit-default-fields-1';
    const sessionKey = 'agent:main:acp:summary-rate-limit-default-fields-exhausted';
    const discordCalls = [];

    const config = {
      project: 'behavior-summary-rate-limit-default-fields',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    };

    const exitResult = await rateLimitMod.finalizeSummarySessionRateLimitExit({
      ok: false,
      reason: 'rate_limit_exhausted',
      rate_limit_exhausted: true,
      status: { attempt: 6, reason: 'provider overloaded', provider: 'anthropic' },
      rate_limit_status: {
        attempt: 6,
        reason: 'provider overloaded',
        provider: 'anthropic',
        session_key: sessionKey,
        max_rate_limit_pauses: 2,
      },
      rate_limit_pauses: 2,
    }, {
      config,
      moduleId: 'pipeline-review',
      summaryType: 'pipeline_review',
      phase: 'pipeline_review',
      exhaustedReason: 'Pipeline review exceeded max ACP rate limit pauses',
      attemptFallback: 6,
      runIdFallback: runId,
      dispatchIdFallback: dispatchId,
      gatewayLabelFallback: dispatchId,
      sessionKeyFallback: sessionKey,
      maxPausesFallback: 2,
      ...rateLimitMod.createTrackedSummarySessionRateLimitExhaustionOptions({
        notifyDiscord: async (_config, _level, title, description, fields) => {
          discordCalls.push({ title, description, fields });
        },
        discordTitle: '📋 Pipeline Review Rate Limit Exhausted',
        discordSubject: 'Pipeline review',
      }),
    });
    await flushAsync();

    assert.equal(exitResult.dispatch_id, dispatchId);
    assert.equal(exitResult.gateway_label, dispatchId);
    assert.equal(exitResult.session_key, sessionKey);
    assert.equal(exitResult.max_rate_limit_pauses, 2);
    assert.equal(discordCalls.length, 1);
    assert.equal(getFieldValue(discordCalls[0].fields, 'Run ID'), runId);
    assert.equal(getFieldValue(discordCalls[0].fields, 'Attempt'), '6');
    assert.equal(getFieldValue(discordCalls[0].fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(discordCalls[0].fields, 'Session'), sessionKey);
    assert.equal(getFieldValue(discordCalls[0].fields, 'Label'), dispatchId);

    const streamKey = `pipeline:telemetry:${config.project}:${runId}`;
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['retry.exhausted', 'summary.completed']);
    assert.equal(events[0].dispatch_id, dispatchId);
    assert.equal(events[0].session_key, sessionKey);
    assert.equal(events[1].dispatch_id, dispatchId);
    assert.equal(events[1].session_key, sessionKey);
  });

  await record('pipeline review no-output failure emits canonical operator Discord alerts with correlation and audit mirroring', async () => {
    const { runtimeRoot: summaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(summaryRuntimeRoot);

    const summaryMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const runtimeCoreMod = await importRuntimeModule(summaryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pipeline-review-no-output-discord-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const logRoot = path.join(swarmDir, 'logs');
    const runId = 'run-pipeline-review-no-output-discord-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    fs.mkdirSync(runLogDir, { recursive: true });
    const sessionKey = 'agent:main:acp:pipeline-review-no-output-discord';
    const dispatchId = 'dispatch-pipeline-review-no-output-1';

    const config = {
      project: 'behavior-pipeline-review-no-output-discord',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _logDir: logRoot,
      _runLogDir: runLogDir,
      _disable_discord_webhooks: true,
      discord_webhook_url: 'https://example.invalid/webhook',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineReview: {
          spawnSession: async () => ({ childSessionKey: sessionKey, streamLogPath: null, attempt: 8 }),
          killSession: async () => true,
          trackAgent: () => {},
          untrackAgent: () => {},
          pollForFile: async () => ({ ok: false, reason: 'timeout', status: { attempt: 8, dispatch_id: dispatchId } }),
          sleep: async () => {},
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    };

    await summaryMod.generatePipelineReview(config, { pipeline_review: { attempt: 8 } });
    await flushAsync();

    const topLevelEntries = fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const runScopedEntries = fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const noOutputEntry = runScopedEntries.find((entry) => entry.title === '📋 Pipeline Review: No Output');
    const failedEntry = runScopedEntries.find((entry) => entry.title === '📋 Pipeline Review Failed');

    assert.equal(topLevelEntries.some((entry) => entry.title === '📋 Pipeline Review Spawned'), true);
    assert.equal(Boolean(noOutputEntry), true);
    assert.equal(Boolean(failedEntry), true);
    assert.equal(noOutputEntry.run_id, runId);
    assert.equal(noOutputEntry.session_key, sessionKey);
    assert.equal(noOutputEntry.dispatch_id, dispatchId);
    assert.equal(noOutputEntry.gateway_label, dispatchId);
    assert.equal(noOutputEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(noOutputEntry.fields.some((field) => field.name === 'Attempt' && field.value === '8'), true);
    assert.equal(noOutputEntry.fields.some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(noOutputEntry.fields.some((field) => field.name === 'Session' && field.value === sessionKey), true);
    assert.equal(noOutputEntry.fields.some((field) => field.name === 'Label' && field.value === dispatchId), true);
    assert.equal(failedEntry.run_id, runId);
    assert.equal(failedEntry.session_key, sessionKey);
    assert.equal(failedEntry.dispatch_id, dispatchId);
    assert.equal(failedEntry.gateway_label, dispatchId);
    assert.equal(failedEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
    assert.equal(failedEntry.fields.some((field) => field.name === 'Attempt' && field.value === '8'), true);
    assert.equal(failedEntry.fields.some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(failedEntry.fields.some((field) => field.name === 'Session' && field.value === sessionKey), true);
    assert.equal(failedEntry.fields.some((field) => field.name === 'Label' && field.value === dispatchId), true);
  });

  await record('case study no-output failure emits canonical operator Discord alerts with correlation and audit mirroring', async () => {
    const { runtimeRoot: caseStudyRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(caseStudyRuntimeRoot);

    const caseStudyMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/services/case-study.js');
    const runtimeCoreMod = await importRuntimeModule(caseStudyRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-case-study-no-output-discord-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const logRoot = path.join(swarmDir, 'logs');
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', 'run-case-study-no-output-discord-1');
    fs.mkdirSync(runLogDir, { recursive: true });
    const sessionKey = 'agent:main:acp:case-study-no-output-discord';
    const dispatchId = 'dispatch-case-study-no-output-1';

    const config = {
      project: 'behavior-case-study-no-output-discord',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: 'run-case-study-no-output-discord-1',
      run_id: 'run-case-study-no-output-discord-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _logDir: logRoot,
      _runLogDir: runLogDir,
      _disable_discord_webhooks: true,
      discord_webhook_url: 'https://example.invalid/webhook',
      case_study: { enabled: true },
      _testOverrides: {
        caseStudy: {
          spawnSession: async () => ({ childSessionKey: sessionKey, streamLogPath: null }),
          killSession: async () => true,
          trackAgent: () => {},
          untrackAgent: () => {},
          emitEvent: async () => {},
          pollForFile: async () => ({ ok: false, reason: 'timeout', status: { dispatch_id: dispatchId } }),
          sleep: async () => {},
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    };

    await caseStudyMod.generateCaseStudy(config, {});
    await flushAsync();

    const topLevelEntries = fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const runScopedEntries = fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const noOutputEntry = runScopedEntries.find((entry) => entry.title === '📝 Case Study: No Output');
    const failedEntry = runScopedEntries.find((entry) => entry.title === '📝 Case Study Failed');

    assert.equal(topLevelEntries.some((entry) => entry.title === '📝 Case Study Agent Spawned'), true);
    assert.equal(noOutputEntry.run_id, 'run-case-study-no-output-discord-1');
    assert.equal(noOutputEntry.session_key, sessionKey);
    assert.equal(noOutputEntry.dispatch_id, dispatchId);
    assert.equal(noOutputEntry.gateway_label, dispatchId);
    assert.equal(noOutputEntry.fields.some((field) => field.name === 'Run ID' && field.value === 'run-case-study-no-output-discord-1'), true);
    assert.equal(noOutputEntry.fields.some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(noOutputEntry.fields.some((field) => field.name === 'Session' && field.value === sessionKey), true);
    assert.equal(noOutputEntry.fields.some((field) => field.name === 'Full Report' && String(field.value).includes('case-study.md')), true);
    assert.equal(failedEntry.run_id, 'run-case-study-no-output-discord-1');
    assert.equal(failedEntry.session_key, sessionKey);
    assert.equal(failedEntry.dispatch_id, dispatchId);
    assert.equal(failedEntry.gateway_label, dispatchId);
    assert.equal(failedEntry.fields.some((field) => field.name === 'Dispatch' && field.value === dispatchId), true);
    assert.equal(failedEntry.fields.some((field) => field.name === 'Label' && field.value === dispatchId), true);
  });

  await record('project summary failure emits canonical operator Discord alerts with artifact correlation and audit mirroring', async () => {
    const { runtimeRoot: projectSummaryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(projectSummaryRuntimeRoot);

    const summaryMod = await importRuntimeModule(projectSummaryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-project-summary-fail-discord-'));
    const logRoot = path.join(repoRoot, '.swarm', 'logs');
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', 'run-project-summary-fail-discord-1');
    fs.mkdirSync(runLogDir, { recursive: true });

    await summaryMod.generateProjectSummary({
      project: 'behavior-project-summary-fail-discord',
      repo_root: repoRoot,
      _runId: 'run-project-summary-fail-discord-1',
      run_id: 'run-project-summary-fail-discord-1',
      _logDir: logRoot,
      _runLogDir: runLogDir,
      _disable_discord_webhooks: true,
      discord_webhook_url: 'https://example.invalid/webhook',
      paths: { project_summary_js: path.join(repoRoot, 'missing-project-summary-discord.mjs') },
    });

    const topLevelEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    const runScopedEntry = JSON.parse(fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(topLevelEntry.title, '📦 Project Summary Failed');
    assert.equal(topLevelEntry.run_id, 'run-project-summary-fail-discord-1');
    assert.equal(runScopedEntry.title, '📦 Project Summary Failed');
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Run ID' && field.value === 'run-project-summary-fail-discord-1'), true);
    assert.equal(runScopedEntry.fields.some((field) => field.name === 'Output Dir' && String(field.value).includes('logs/pipeline')), true);
  });

  await record('pipeline summary success emits canonical summary lifecycle with artifact correlation', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pipeline-summary-ok-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const logDir = path.join(swarmDir, 'logs');
    const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-pipeline-summary-ok-1');
    fs.mkdirSync(runLogDir, { recursive: true });

    const config = {
      project: 'behavior-pipeline-summary-ok',
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      telemetry: { enabled: true },
      _pluginRegistry: registry,
      _runId: 'run-pipeline-summary-ok-1',
      run_id: 'run-pipeline-summary-ok-1',
      _logDir: logDir,
      _runLogDir: runLogDir,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          generateProjectSummary: async () => {},
          generatePipelineReview: async () => {},
          generateCaseStudy: async () => {},
        },
      },
    };

    const progress = {
      execution_order: [],
      modules: {},
      gates: {},
      arch_validation: { enabled: false },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { skipArchValidation: true });
    await flushAsync();

    assert.equal(result, 0);

    const streamKey = 'pipeline:telemetry:behavior-pipeline-summary-ok:run-pipeline-summary-ok-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'pipeline.completed', 'summary.started', 'summary.completed']);
    assert.equal(events[2].summary_type, 'pipeline');
    assert.equal(events[2].exit_code, 0);
    assert.equal(events[2].exit_reason, 'PIPELINE_COMPLETE');
    assert.equal(events[2].output_dir, path.join(logDir, 'pipeline'));
    assert.equal(events[3].summary_type, 'pipeline');
    assert.equal(events[3].status, 'ok');
    assert.equal(events[3].exit_code, 0);
    assert.equal(events[3].exit_reason, 'PIPELINE_COMPLETE');
    assert.equal(events[3].output_dir, path.join(logDir, 'pipeline'));
    assert.equal(events[3].summary_json_path, path.join(runLogDir, 'summary.json'));
    assert.equal(events[3].pipeline_summary_path, path.join(logDir, 'pipeline', 'summary.json'));
    assert.equal(events[3].latest_json_path, path.join(logDir, 'pipeline', 'latest.json'));
    assert.equal(fs.existsSync(path.join(runLogDir, 'summary.json')), true);
    assert.equal(fs.existsSync(path.join(logDir, 'pipeline', 'latest.json')), true);

    const summary = JSON.parse(fs.readFileSync(path.join(runLogDir, 'summary.json'), 'utf8'));
    assert.equal(summary.completed_at != null, true);
    assert.equal(summary.telemetry_stream_key, streamKey);
    assert.equal(summary.artifacts.pipeline_jsonl, 'runs/run-pipeline-summary-ok-1/pipeline.jsonl');
    assert.equal(summary.artifacts.discord_jsonl, 'runs/run-pipeline-summary-ok-1/discord.jsonl');
    assert.equal(summary.artifacts.summary_json, 'runs/run-pipeline-summary-ok-1/summary.json');
    assert.equal(summary.artifacts.nova_injections_jsonl, 'runs/run-pipeline-summary-ok-1/nova-injections.jsonl');
  });

  await record('pipeline summary halt paths emit canonical summary lifecycle with artifact correlation', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const registry = withStubbedGeneratorStages(await buildBuiltInRegistry(pipelineRuntimeRoot));

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pipeline-summary-halt-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const logDir = path.join(swarmDir, 'logs');
    const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-pipeline-summary-halt-1');
    fs.mkdirSync(runLogDir, { recursive: true });

    const config = {
      project: 'behavior-pipeline-summary-halt',
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      telemetry: { enabled: true },
      _pluginRegistry: registry,
      _runId: 'run-pipeline-summary-halt-1',
      run_id: 'run-pipeline-summary-halt-1',
      _logDir: logDir,
      _runLogDir: runLogDir,
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      _testOverrides: {
        pipelineRunner: {
          discord: async () => {},
          output: () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          runModule: async () => ({
            exit: 10,
            reason: 'Forge fix needs Nova guidance',
            fail_count: 3,
            module_status: { session_key: 'agent:main:acp:pipeline-summary-halt-01' },
          }),
          generateProjectSummary: async () => {},
        },
      },
    };

    const progress = {
      execution_order: ['01'],
      modules: { '01': { title: 'Scaffold', dir: '01-scaffold' } },
      gates: {},
      arch_validation: { enabled: false },
    };

    const result = await pipelineRunnerMod.runPipeline(config, progress, { module: '01', skipArchValidation: true });
    await flushAsync();

    assert.equal(result, 10);

    const streamKey = 'pipeline:telemetry:behavior-pipeline-summary-halt:run-pipeline-summary-halt-1';
    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), ['pipeline.started', 'error.escalation', 'pipeline.halted', 'summary.started', 'summary.completed']);
    assert.equal(events[3].summary_type, 'pipeline');
    assert.equal(events[3].exit_code, 10);
    assert.equal(events[3].exit_reason, 'single_module:01');
    assert.equal(events[3].output_dir, path.join(logDir, 'pipeline'));
    assert.equal(events[4].summary_type, 'pipeline');
    assert.equal(events[4].status, 'failed');
    assert.equal(events[4].exit_code, 10);
    assert.equal(events[4].exit_reason, 'single_module:01');
    assert.equal(events[4].output_dir, path.join(logDir, 'pipeline'));
    assert.equal(events[4].summary_json_path, path.join(runLogDir, 'summary.json'));
    assert.equal(events[4].pipeline_summary_path, path.join(logDir, 'pipeline', 'summary.json'));
    assert.equal(events[4].latest_json_path, path.join(logDir, 'pipeline', 'latest.json'));
    assert.equal(fs.existsSync(path.join(runLogDir, 'summary.json')), true);
    assert.equal(fs.existsSync(path.join(logDir, 'pipeline', 'latest.json')), true);

    const summary = JSON.parse(fs.readFileSync(path.join(runLogDir, 'summary.json'), 'utf8'));
    assert.equal(summary.completed_at != null, true);
    assert.equal(summary.telemetry_stream_key, streamKey);
    assert.equal(summary.artifacts.pipeline_jsonl, 'runs/run-pipeline-summary-halt-1/pipeline.jsonl');
    assert.equal(summary.artifacts.discord_jsonl, 'runs/run-pipeline-summary-halt-1/discord.jsonl');
    assert.equal(summary.artifacts.summary_json, 'runs/run-pipeline-summary-halt-1/summary.json');
    assert.equal(summary.artifacts.nova_injections_jsonl, 'runs/run-pipeline-summary-halt-1/nova-injections.jsonl');
  });
}
