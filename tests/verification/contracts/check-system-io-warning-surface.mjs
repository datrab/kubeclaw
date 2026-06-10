#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function read(sourceRoot, relPath) {
  return fs.readFileSync(path.join(sourceRoot, relPath), 'utf8');
}

const { sourceRoot } = parseArgs();

const helperPath = 'skills/nova/pipeline/services/system-io-warning.ts';
const helper = read(sourceRoot, helperPath);
assert(helper.includes("emitTelemetryStreamEvent(config, 'system.io_warning'"), 'system I/O warning helper must emit the canonical event type');
assert(helper.includes("export function emitSystemIoWarning"), 'system I/O warning helper must expose generic warning helper');
assert(helper.includes("export function emitPolicyAuditAppendWarning"), 'system I/O warning helper must expose policy audit append specialization');
assert(helper.includes("export function emitPipelineLogAppendWarning"), 'system I/O warning helper must expose pipeline log append specialization');
assert(helper.includes("export function emitPromptArtifactWriteWarning"), 'system I/O warning helper must expose prompt artifact write specialization');
assert(helper.includes("component: 'model_policy'"), 'policy specialization must own model_policy component');
assert(helper.includes("surface: 'audit_log'"), 'policy specialization must own audit_log surface');
assert(helper.includes("reason: 'policy_audit_append_failed'"), 'policy specialization must own stable policy audit reason');
assert(helper.includes("path_role: 'model_policy_jsonl'"), 'policy specialization must own model-policy path role');
assert(helper.includes("component: 'pipeline_logger'"), 'pipeline logger specialization must own pipeline_logger component');
assert(helper.includes("reason: 'pipeline_jsonl_append_failed'"), 'pipeline logger specialization must own stable append warning reason');
assert(helper.includes("component: 'prompt_artifact'"), 'prompt artifact specialization must own prompt_artifact component');
assert(helper.includes("reason: 'prompt_artifact_write_failed'"), 'prompt artifact specialization must own stable write warning reason');
assert(helper.includes('console.error(line)'), 'system I/O warning helper must provide bare-metal stderr fallback');
assert(!helper.includes("from '../core/logger.ts'"), 'system I/O warning helper must not depend on core logger');
assert(helper.includes("if (!data?.component || !data?.surface || !data?.reason || !data?.operation || !data?.path) return false;"), 'generic helper must refuse invalid warning payloads');

const policy = read(sourceRoot, 'skills/nova/pipeline/core/policy.ts');
assert(policy.includes("import { emitPolicyAuditAppendWarning } from '../services/system-io-warning.ts';"), 'policy logger must import the system I/O warning helper');
assert(policy.includes('emitPolicyAuditAppendWarning(config,'), 'policy append failure must call the helper');
assert(!policy.includes("emitTelemetryStreamEvent(config, 'system.io_warning'"), 'policy logger must not duplicate raw system.io_warning emission');
assert(!policy.includes("void import('../services/telemetry-stream.js')"), 'policy logger must not use dynamic telemetry import for warning emission');
assert(!policy.includes("reason: 'policy_audit_append_failed'"), 'policy logger must not duplicate the stable policy audit warning reason');

const logger = read(sourceRoot, 'skills/nova/pipeline/core/logger.ts');
assert(logger.includes("import { emitPipelineLogAppendWarning } from '../services/system-io-warning.ts';"), 'core logger must import pipeline log warning specialization');
assert(logger.includes('emitPipelineLogAppendWarning(ctx.config, target, error,'), 'pipeline JSONL append failure must call the warning helper');
assert(!logger.includes('catch (_error) { /* non-critical */ }'), 'core logger must not silently swallow structural log append failures');

const statusStore = read(sourceRoot, 'skills/nova/pipeline/services/status-store.ts');
assert(statusStore.includes("import { emitPromptArtifactWriteWarning } from './system-io-warning.ts';"), 'status store must import prompt artifact warning specialization');
assert(statusStore.includes('emitPromptArtifactWriteWarning(config, filePath, e,'), 'prompt artifact write failure must call the warning helper');

const telemetryStream = read(sourceRoot, 'skills/nova/pipeline/services/telemetry-stream.ts');
assert(!telemetryStream.includes("from '../core/logger.ts'"), 'telemetry stream helper must not import core logger in the system.io_warning path');
assert(!telemetryStream.includes('getRunId'), 'telemetry stream helper must not import runtime/logger for system.io_warning emission');

console.log(JSON.stringify({ ok: true, checked: 30 }));
