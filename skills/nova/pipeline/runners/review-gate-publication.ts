import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { gateLogDir, gateOutputPath, relPath } from '../core/paths.ts';
import { resolveStatusSessionKey } from '../services/correlation.ts';
import { emitGitCommitPushSoftFailDegraded } from '../services/git-soft-fail-observability.ts';
import { parseReviewOutputContent } from './review-gate-output.ts';

type AnyRecord = Record<string, any>;

function publishPaths(config: AnyRecord, paths: Array<string | null>): string[] {
  return [...new Set(paths.filter(Boolean).map((value) => relPath(config, value).split(path.sep).join('/'))
    .filter((value) => value && !value.startsWith('../')))];
}

function readReview(context: AnyRecord) {
  try {
    return { ok: true, parsed: parseReviewOutputContent(fs.readFileSync(context.outputFilePath, 'utf8')) };
  } catch (error: any) {
    log('ERROR', `Failed to read review output: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

function stageMergedOutput(context: AnyRecord): AnyRecord {
  if (!context.gate.output_file) return { ok: true, path: null };
  const mergedPath = gateOutputPath(context.config, context.gate);
  if (!mergedPath) return { ok: false, error: `Review gate '${context.gateId}' requires a canonical merged output path` };
  if (mergedPath === context.outputFilePath) return { ok: true, path: mergedPath };
  try {
    fs.mkdirSync(path.dirname(mergedPath), { recursive: true });
    fs.copyFileSync(context.outputFilePath, mergedPath);
    return { ok: true, path: mergedPath };
  } catch (error: any) {
    context.emitArtifactFailure('merged_gate_output', error);
    return { ok: false, error: `Review output publication failed: canonical gate output could not be written: ${error.message}`, output_publication_failed: true };
  }
}

async function commitReviewOutput(context: AnyRecord, mergedPath: string | null) {
  const paths = publishPaths(context.config, [context.outputFilePath, mergedPath, gateLogDir(context.config, context.gateId)]);
  const result = await context.deps.gitCommitAndPush(
    context.config,
    `[pipeline] Review: ${context.gate.review_name} (${context.reviewer.label})`,
    { softFail: true, addPaths: paths, conflictPaths: paths },
  );
  const degraded = emitGitCommitPushSoftFailDegraded(context.telemetryContext, {
    error: result?.error,
    gate_id: context.gateId,
    gate_type: context.gate.type || 'review',
    attempt: context.reviewAttempt,
    session_key: resolveStatusSessionKey(context.pollResult?.status) ?? context.sessionKey,
  });
  if (!degraded) return null;
  return { ok: false, error: `Review output publication failed: ${result?.error || 'missing_git_error_detail'}`, output_publication_failed: true };
}

function resultFields(context: AnyRecord, parsed: AnyRecord) {
  return {
    mergedResult: parsed.mergedResult,
    mergedFilePath: context.outputFilePath,
    gateway_label: context.gatewayLabel,
    session_key: context.sessionKey,
  };
}

export async function publishReviewGateResult(context: AnyRecord) {
  const read = readReview(context);
  if (!read.ok) return { ...read, gateway_label: context.gatewayLabel, session_key: context.sessionKey };
  const parsed: AnyRecord = read.parsed as AnyRecord;
  await context.emitDiscord(parsed);
  if (parsed.decision === 'invalid_contract') {
    log('ERROR', parsed.error);
    return {
      ok: false, error: parsed.error, invalid_contract: parsed.invalid_contract === true,
      ...(Object.prototype.hasOwnProperty.call(parsed, 'mergedResult') ? { mergedResult: parsed.mergedResult } : {}),
      mergedFilePath: context.outputFilePath, gateway_label: context.gatewayLabel, session_key: context.sessionKey,
    };
  }
  const staged = stageMergedOutput(context);
  if (!staged.ok) return { ...staged, ...resultFields(context, parsed) };
  const publicationFailure = await commitReviewOutput(context, staged.path);
  if (publicationFailure) return { ...publicationFailure, ...resultFields(context, parsed) };
  const passed = parsed.decision === 'pass';
  log('INFO', `Review result: ${parsed.displayStatus} — ${passed ? 'PASS' : 'FAIL'}`);
  return { ok: passed, ...resultFields(context, parsed) };
}
