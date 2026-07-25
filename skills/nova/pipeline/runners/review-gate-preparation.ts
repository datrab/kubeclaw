import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { gateLintLogDir, gateLogDir, relPath } from '../core/paths.ts';
import { writePromptArtifact } from '../egress.ts';
import { resolveModuleCommit } from '../services/status-store-lifecycle/refs.ts';
import { resolveGateTargetModule } from './gate-target-module.ts';
import { loadAuthoritativeModuleState } from './pipeline-runner-shared.ts';
import { selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;

function optionalLintBlock(error: unknown): string {
  return [
    '## 📊 STATIC ANALYSIS REPORT', '',
    '⚠️ Lint report generation failed. Review the code manually for type errors, lint issues, and security concerns.',
    `Error: ${selectTruthyValue(() => error, () => 'missing_lint_error')}`, '', '---', '',
  ].join('\n');
}

function saveLintReport(context: AnyRecord, report: AnyRecord, lintDir: string | null) {
  if (!lintDir) return;
  try {
    fs.mkdirSync(lintDir, { recursive: true });
    fs.writeFileSync(path.join(lintDir, `full-attempt-${context.reviewAttempt}.json`), JSON.stringify(report, null, 2));
  } catch (error: unknown) {
    context.emitArtifactFailure('lint_report_json', error);
  }
}

function generateReviewLint(context: AnyRecord) {
  const { deps, config, progress, gateId, lintTier, reviewAttempt } = context;
  const lintDir = gateLintLogDir(config, gateId);
  const target = resolveGateTargetModule(progress, gateId);
  const state = target.moduleId ? loadAuthoritativeModuleState(config, progress, target.moduleId) : null;
  const tier = lintTier ?? 'full';
  const generated = deps.generateLintReport(config, tier, {
    moduleDir: selectTruthyValue(() => target.moduleDir, () => null),
    moduleId: selectTruthyValue(() => target.moduleId, () => gateId),
    forgeDiffStat: selectTruthyValue(() => state?.forge_diff_stat, () => null),
    commitHash: resolveModuleCommit(state),
    logPath: lintDir ? path.join(lintDir, `full-trace-attempt-${reviewAttempt}.jsonl`) : null,
  });
  if (generated.report) saveLintReport(context, generated.report, lintDir);
  return { ...generated, tier };
}

function resolveLintBlock(context: AnyRecord) {
  const generated = generateReviewLint(context);
  if (generated.report) {
    const summary = generated.report.summary;
    log('OK', `Lint report ready: ${summary.total_errors} errors, ${summary.total_warnings} warnings`);
    return { ok: true, lintBlock: context.deps.formatLintReportForReviewer(generated.report) };
  }
  if (context.lintRequired) {
    const reason = `Review lint setup failed: ${selectTruthyValue(() => generated.error, () => 'missing_lint_error')}`;
    context.emitLintSetupFailure(reason, generated.tier);
    return { ok: false, error: reason, review_setup_failed: true, lint_required: true };
  }
  log('WARN', `Optional lint report unavailable (${generated.error}) — reviewer will run without static analysis data`);
  return { ok: true, lintBlock: optionalLintBlock(generated.error) };
}

function clearStaleOutput(context: AnyRecord) {
  const { deps, config, gateId, outputFilePath, reviewAttempt, reviewer } = context;
  try {
    const archived = deps.archiveGateOutputIfPresent(config, gateId, outputFilePath, {
      attempt: reviewAttempt, label: reviewer.label,
    });
    if (archived) log('INFO', `Archived previous review output: ${relPath(config, archived)}`);
  } catch (error: unknown) {
    context.emitArtifactFailure('stale_review_output_archive', error);
  }
  try {
    if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
    return null;
  } catch (error: any) {
    context.emitArtifactFailure('stale_review_output_removal', error);
    return { ok: false, error: `Review setup failed: stale review output could not be removed: ${error.message}`, review_setup_failed: true };
  }
}

function saveReviewPrompt(context: AnyRecord, prompt: string) {
  try {
    const logDir = gateLogDir(context.config, context.gateId);
    if (!logDir) throw new Error(`Review gate '${context.gateId}' requires a canonical log directory`);
    fs.mkdirSync(logDir, { recursive: true });
    writePromptArtifact(path.join(logDir, `echo-prompt-attempt-${context.reviewAttempt}.md`), prompt, {
      gate_id: context.gateId, attempt: context.reviewAttempt, agent_type: 'echo',
    });
  } catch (error: unknown) {
    context.emitArtifactFailure('review_prompt', error);
  }
}

export function prepareReviewGateTask(context: AnyRecord) {
  const lint = resolveLintBlock(context);
  if (!lint.ok) return lint;
  let instructions: string;
  try {
    instructions = context.deps.readGateInstructions(context.config, context.gate);
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
  const built = context.deps.buildReviewerPrompt(
    context.config, context.gateId, context.gate, context.reviewer,
    instructions, lint.lintBlock, context.relOutput,
  );
  if (selectTruthyValue(() => typeof built.prompt !== 'string', () => !built.prompt)) {
    return { ok: false, error: `Review gate '${context.gateId}' produced no reviewer prompt` };
  }
  const staleFailure = clearStaleOutput(context);
  if (staleFailure) return staleFailure;
  saveReviewPrompt(context, built.prompt);
  const policy = context.deps.resolvePolicy(context.config, context.progress, 'echo', {
    scopeModel: selectTruthyValue(() => context.reviewer.model, () => null),
    scopeThinking: selectTruthyValue(() => context.reviewer.thinking_level, () => null),
    dispatchPath: context.reviewer.dispatch === 'subagent' ? 'subagent' : 'acp',
  });
  return { ok: true, reviewerPrompt: built.prompt, reviewerPolicy: policy };
}
