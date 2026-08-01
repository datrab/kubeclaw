import { selectTruthyValue } from '../optional-absence.ts';
import { createRunnerVerdict } from './verdict-schema.ts';
import { displayValue, firstNonEmptyString, truncatedDisplay } from './pipeline-display.ts';

type AnyRecord = Record<string, any>;
const EMBED_FOOTER = { text: 'Buster Pipeline v2.0' };

export function buildPreTestVerdict(moduleId: unknown, project: unknown, suitesInfo: AnyRecord = {}): AnyRecord | null {
  const suiteResults = Array.isArray(suitesInfo?.results) ? suitesInfo.results : [];
  const suiteEntries = suiteResults
    .map((result) => {
      if (!result?.suite) return null;
      const { suite, duration_seconds, ...verdict } = result;
      return [suite, verdict];
    })
    .filter(Boolean);

  if (suiteEntries.length === 0) return null;
  return createRunnerVerdict(String(moduleId), String(project), Object.fromEntries(suiteEntries as Array<[PropertyKey, any]>));
}

export function buildSuiteArtifactData(moduleId: unknown, project: unknown, suitesInfo: AnyRecord = {}): AnyRecord {
  const preTestVerdict = buildPreTestVerdict(moduleId, project, suitesInfo);
  if (!preTestVerdict) return {};
  return {
    project,
    suite_summary: selectTruthyValue(() => (selectTruthyValue(() => (suitesInfo?.suiteSummary), () => (preTestVerdict.summary))), () => (null)),
    suite_detail_summary: selectTruthyValue(() => (suitesInfo?.suiteDetailSummary), () => (null)),
    results: Array.isArray(suitesInfo?.results) ? suitesInfo.results : [],
    suites: preTestVerdict.suites,
    verdict: preTestVerdict,
  };
}

function suiteFailureEntries(results: AnyRecord[]): AnyRecord[] {
  return results.filter((result) => ['FAIL', 'ERROR'].includes(result.status)).map((result) => {
    const findings = (Array.isArray(result.findings) ? result.findings : []).slice(0, 2)
      .map((finding: AnyRecord) => firstNonEmptyString([finding.description, finding.message, finding.title], 'missing_finding_detail'))
      .filter(Boolean).join('; ');
    return { suite: result.suite, detail: firstNonEmptyString([result.error, result.top_finding, findings, result.reason], 'suite_failed_without_detail') };
  });
}

function agentDecisionMessage(recommendation: unknown, pass: boolean): string {
  if (recommendation === 'SPAWN') return 'Agent judgment enabled — spawning after deterministic suites passed';
  if (pass) return 'Agent judgment disabled — deterministic suites are final authority';
  return 'Not spawned — deterministic suite failure is authoritative';
}

/**
 * Build a suite results embed (PASS / FAIL style with inline findings).
 */
export function buildSuiteResultsEmbed(moduleId: unknown, project: unknown, suitesInfo: AnyRecord, decision: AnyRecord = {}): AnyRecord {
  const { suiteSummary, criticalFailed, results = [] } = suitesInfo;
  const pass = !criticalFailed;
  const passCount = results.filter((r: AnyRecord) => r.status === 'PASS').length;
  const failEntries = suiteFailureEntries(results);
  const failCount = failEntries.length;
  const passSuites = results.filter((r: AnyRecord) => r.status === 'PASS').map((r: AnyRecord) => r.suite);
  const skipSuites = results.filter((r: AnyRecord) => r.status === 'SKIP').map((r: AnyRecord) => r.suite);
  const fields = [
    { name: 'Status',  value: pass ? 'PASS' : 'FAIL', inline: true },
    { name: 'Module',  value: String(moduleId),       inline: true },
    { name: 'Project', value: displayValue(project), inline: true },
    { name: 'Passed',  value: String(passCount),      inline: true },
    { name: 'Failed',  value: String(failCount),      inline: true },
  ];
  if (suiteSummary) {
    fields.push({ name: 'Summary', value: truncatedDisplay(suiteSummary), inline: false });
  }
  if (decision?.recommendation) {
    fields.push({
      name: 'Buster Agent',
      value: agentDecisionMessage(decision.recommendation, pass),
      inline: false,
    });
  }
  if (decision?.reason) {
    fields.push({ name: 'Decision Reason', value: truncatedDisplay(decision.reason), inline: false });
  }
  if (passSuites.length) {
    fields.push({ name: 'Passed Suites', value: truncatedDisplay(passSuites.join(', ')), inline: false });
  }
  if (failEntries.length) {
    fields.push({ name: 'Failed Suites', value: truncatedDisplay(failEntries.map((r: AnyRecord) => r.suite).join(', ')), inline: false });
    fields.push({ name: 'Issue', value: truncatedDisplay(failEntries.map((r: AnyRecord) => `${r.suite}: ${r.detail}`).join('\n')), inline: false });
  }
  if (skipSuites.length) {
    fields.push({ name: 'Skipped Suites', value: truncatedDisplay(skipSuites.join(', ')), inline: false });
  }
  return {
    title:     pass ? `✅ Suite Results: PASS — ${moduleId}` : `🚫 Suite Results: FAIL — ${moduleId}`,
    color:     pass ? 5763719 : 15158332,
    fields,
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a session spawn embed (info blue, includes runtime type).
 */
export function buildSessionSpawnEmbed(moduleId: unknown, project: unknown, sessionData: AnyRecord): AnyRecord {
  const agentRole = (firstNonEmptyString([sessionData.agentRole, sessionData.agent_type], 'Buster') || 'Buster')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
  return {
    title:  `🚀 ${agentRole} Session Spawned: ${moduleId}`,
    color:  3447003,
    fields: [
      { name: 'Status',  value: 'Spawned',                                  inline: true },
      { name: 'Module',  value: String(moduleId),                            inline: true },
      { name: 'Project', value: displayValue(project),                       inline: true },
      { name: 'Runtime', value: displayValue(sessionData.runtime, 'ACP'),     inline: true },
      { name: 'Session', value: displayValue(sessionData.childSessionKey),   inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a session complete embed (green for PASS, red for FAIL/TIMEOUT).
 * Includes commit hash and duration.
 */
export function buildSessionCompleteEmbed(moduleId: unknown, project: unknown, { outcome, reason, commitHash, durationSeconds, childSessionKey, source }: AnyRecord): AnyRecord {
  const pass = outcome === 'PASS';
  const normalizedReason = String(reason ?? '');
  const outputContractFailure = ['output_file_contract_failed'].includes(normalizedReason)
    ? true
    : normalizedReason.startsWith('output_file_identity_mismatch');
  return {
    title:  pass
      ? `✅ Session Complete: PASS — ${moduleId}`
      : outputContractFailure
        ? `🚫 Buster Completion Contract Failed — ${moduleId}`
      : `❌ Session Complete: ${outcome} — ${moduleId}`,
    color:  pass ? 5763719 : 15158332,
    fields: [
      { name: 'Status',   value: String(outcome),                inline: true },
      { name: 'Module',   value: String(moduleId),               inline: true },
      { name: 'Project',  value: displayValue(project),          inline: true },
      { name: 'Duration', value: `${durationSeconds}s`,          inline: true },
      { name: 'Commit',   value: displayValue(commitHash),       inline: true },
      { name: 'Reason',   value: displayValue(reason),           inline: true },
      { name: 'Source',   value: displayValue(source),           inline: true },
      { name: 'Session',  value: displayValue(childSessionKey),  inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a timeout embed (red, shows elapsed vs timeout comparison).
 */
export function buildTimeoutEmbed(moduleId: unknown, project: unknown, { elapsedSeconds, timeoutSeconds, childSessionKey }: AnyRecord): AnyRecord {
  return {
    title:  `⏱️ Session Timeout: ${moduleId}`,
    color:  15158332,
    fields: [
      { name: 'Status',   value: 'TIMEOUT',                      inline: true },
      { name: 'Module',   value: String(moduleId),               inline: true },
      { name: 'Project',  value: displayValue(project),          inline: true },
      { name: 'Elapsed',  value: `${elapsedSeconds}s`,           inline: true },
      { name: 'Timeout',  value: `${timeoutSeconds}s`,           inline: true },
      { name: 'Session',  value: displayValue(childSessionKey),  inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

export function buildTaskFailureEmbed(moduleId: unknown, project: unknown, { reason, stage, attempt, taskType, commitHash }: AnyRecord): AnyRecord {
  return {
    title:  `🚨 Task Failure: ${moduleId}`,
    color:  15158332,
    fields: [
      { name: 'Status',  value: 'FAIL',                        inline: true },
      { name: 'Module',  value: String(moduleId),              inline: true },
      { name: 'Project', value: displayValue(project),         inline: true },
      { name: 'Stage',   value: displayValue(stage, 'missing_stage'), inline: true },
      { name: 'Attempt', value: displayValue(attempt),         inline: true },
      { name: 'Type',    value: displayValue(taskType, 'missing_task_type'), inline: true },
      { name: 'Commit',  value: displayValue(commitHash),      inline: true },
      { name: 'Reason',  value: truncatedDisplay(reason, 1024, 'missing_display_value'), inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}
