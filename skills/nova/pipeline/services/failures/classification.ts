import { normalizeFailureClass } from '../failure-semantics.ts';
import { reportFailureSurfaceIncident } from './incidents.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
export const FAIL_PATTERNS = {
  BUSTER_IMAGE_UNAVAILABLE: 'BUSTER_IMAGE_UNAVAILABLE',
  BUSTER_PORT_CONFLICT: 'BUSTER_PORT_CONFLICT',
  BLUEPRINT_ALREADY_RELEASED: 'BLUEPRINT_ALREADY_RELEASED',
  FORGE_TS_COMPILE_ERROR: 'FORGE_TS_COMPILE_ERROR',
  GIT_REBASE_CONFLICT: 'GIT_REBASE_CONFLICT',
  GIT_SYNC_FAILED: 'GIT_SYNC_FAILED',
  GIT_PUSH_REJECTED: 'GIT_PUSH_REJECTED',
  GIT_PUSH_FAILED: 'GIT_PUSH_FAILED',
  BUILD_OUTPUT_EMPTY: 'BUILD_OUTPUT_EMPTY',
  HEALTH_CHECK_TIMEOUT: 'HEALTH_CHECK_TIMEOUT',
  SESSION_NO_CHANGES: 'SESSION_NO_CHANGES',
  PAYLOAD_CORRUPTED: 'PAYLOAD_CORRUPTED',
  RATE_LIMIT_EXHAUSTED: 'RATE_LIMIT_EXHAUSTED',
  OUTPUT_FILE_MISSING: 'OUTPUT_FILE_MISSING',
  MODULE_ORPHANED: 'MODULE_ORPHANED',
  CLASSIFICATION_MISSING: 'classification_missing',
};

const PRETEST_REASON_MISSING = 'Pre-test failure (no details)';
const SUITE_FAILED_DETAIL_MISSING = 'failed';
const CONFIG_PRETEST_DETAIL_MISSING = 'Configuration issue during pre-test';
const INFRA_PRETEST_DETAIL_MISSING = 'Infrastructure issue during pre-test';
const CODE_PRETEST_DETAIL_MISSING = 'Pre-test failure';

function textValue(value) {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : String(value);
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function suitesRecord(verdict) {
  return selectDefinedValue(() => (objectRecord(verdict?.suites)), () => ({}));
}

function selectPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

/**
 * Structured metadata for each failure pattern.
 * class: broad grouping (build, health, session, git, infra, payload)
 * recoverability: 'retry' | 'needs_nova' | 'blocked'
 * escalation: pipeline action when retry budget is exhausted
 * guidance: operator-facing action to take
 */
export const FAILURE_CLASS_MAP = {
  BUSTER_IMAGE_UNAVAILABLE: {
    class: 'infra', recoverability: 'blocked',
    escalation: 'BLOCKED',
    summary: 'Buster container image unavailable',
    guidance: 'Verify the Buster image name and registry. The image must be present on the Docker host before the pipeline can run.',
  },
  BUSTER_PORT_CONFLICT: {
    class: 'infra', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Port already in use when starting Buster',
    guidance: 'A previous container may still be running. Check for lingering processes on the expected port and stop them before retrying.',
  },
  BLUEPRINT_ALREADY_RELEASED: {
    class: 'git', recoverability: 'needs_nova',
    escalation: 'NEEDS_NOVA',
    summary: 'Blueprint already committed — nothing to release',
    guidance: 'The module blueprint was already committed. Either the module ran twice or state is out of sync. Check git log and lifecycle run artifacts before resuming.',
  },
  FORGE_TS_COMPILE_ERROR: {
    class: 'build', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'TypeScript compile error in Forge output',
    guidance: 'Fix the TypeScript errors identified in the failure summary before retrying. Check type annotations and exported member names.',
  },
  GIT_REBASE_CONFLICT: {
    class: 'git', recoverability: 'needs_nova',
    escalation: 'NEEDS_NOVA',
    summary: 'Git rebase conflict on non-runtime files',
    guidance: 'Rebase conflicts on source files cannot be auto-resolved. Run `git rebase --abort` then resolve conflicts manually and resume the pipeline.',
  },
  GIT_SYNC_FAILED: {
    class: 'git', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Git sync failed before Buster handoff',
    guidance: 'Check network connectivity and remote repository access. If the repo is in a bad state, inspect `git status` and `git log` before resuming.',
  },
  GIT_PUSH_REJECTED: {
    class: 'git', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Git push rejected by remote (non-fast-forward)',
    guidance: 'A concurrent push created divergence. Pull and rebase local commits, then retry. Do not force-push — diverged commits may contain other pipeline work.',
  },
  GIT_PUSH_FAILED: {
    class: 'git', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Git push failed (network or auth)',
    guidance: 'Check SSH key configuration, network connectivity, and remote availability. Transient failures will auto-retry; persistent failures require operator intervention.',
  },
  BUILD_OUTPUT_EMPTY: {
    class: 'build', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Build output empty or expected artifact missing',
    guidance: 'The build ran but produced no output at the expected artifact path. Verify the build command, output directory configuration, and that Forge committed the artifact.',
  },
  HEALTH_CHECK_TIMEOUT: {
    class: 'health', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Health check timed out — service never became healthy',
    guidance: 'The container started but the health endpoint did not respond within the timeout. Check container logs for startup errors and increase the health check timeout if the service is legitimately slow to start.',
  },
  SESSION_NO_CHANGES: {
    class: 'session', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Session ended without producing changes',
    guidance: 'The agent session terminated with no file output. This may indicate the agent misread its instructions or hit a silent error. Review transcript and provide a clearer prompt before retrying.',
  },
  PAYLOAD_CORRUPTED: {
    class: 'payload', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Corrupted or unparseable status/completion payload',
    guidance: 'A lifecycle/control artifact or completion payload could not be parsed. Check the raw file for truncation or encoding issues. The pipeline will retry; repeated occurrences indicate a systemic serialization bug.',
  },
  RATE_LIMIT_EXHAUSTED: {
    class: 'infra', recoverability: 'needs_nova',
    escalation: 'NEEDS_NOVA',
    summary: 'Rate limit exhausted — recovery attempts failed',
    guidance: 'The pipeline exhausted its rate-limit recovery budget. Wait for quota to reset before resuming, or switch to a different API key / model tier.',
  },
  OUTPUT_FILE_MISSING: {
    class: 'artifact', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Expected output file missing after gate or review',
    guidance: 'A required output file was not produced after the gate or review step. Verify the gate configuration and that the agent wrote the output to the declared path.',
  },
  MODULE_ORPHANED: {
    class: 'pipeline', recoverability: 'needs_nova',
    escalation: 'NEEDS_NOVA',
    summary: 'Module blocked with no reason — likely orphaned',
    guidance: 'The module was marked BLOCKED but no failure reason was recorded. Inspect lifecycle read models and pipeline logs to determine the root cause before resuming.',
  },
  classification_missing: {
    class: 'classification_missing', recoverability: 'needs_nova',
    escalation: 'NEEDS_NOVA',
    summary: 'Failure classification missing',
    guidance: 'No failure classification rule matched the canonical error input. Review the full failure summary and pipeline logs to identify the root cause.',
  },
};

/**
 * Return structured metadata for a failure pattern code.
 * Always returns a record — uses the classification_missing entry if code not found.
 * @param {string} code - A FAIL_PATTERNS value
 * @returns {{ class: string, recoverability: string, escalation: string, summary: string, guidance: string }}
 */
export function describeFailure(code) {
  return selectTruthyValue(() => (FAILURE_CLASS_MAP[code]), () => (FAILURE_CLASS_MAP[FAIL_PATTERNS.CLASSIFICATION_MISSING]));
}

export function classifyFailPattern(text) {
  const value = textValue(text);
  if (!value.trim()) return undefined;

  if (/image not known|image pull|no such image/i.test(value)) return FAIL_PATTERNS.BUSTER_IMAGE_UNAVAILABLE;
  if (/address already in use|eaddrinuse|errno 98/i.test(value)) return FAIL_PATTERNS.BUSTER_PORT_CONFLICT;
  if (/nothing to commit|nothing added to commit/i.test(value)) return FAIL_PATTERNS.BLUEPRINT_ALREADY_RELEASED;
  if (/error TS\d+|is not assignable|has no exported member|declared but never read/i.test(value)) return FAIL_PATTERNS.FORGE_TS_COMPILE_ERROR;
  if (/rebase conflict|\bCONFLICT\b|rebase --abort/i.test(value)) return FAIL_PATTERNS.GIT_REBASE_CONFLICT;
  if (/git sync failed|failed before buster handoff/i.test(value)) return FAIL_PATTERNS.GIT_SYNC_FAILED;
  if (/\[rejected\]|non-fast-forward|push.*rejected|updates were rejected/i.test(value)) return FAIL_PATTERNS.GIT_PUSH_REJECTED;
  if (/git push (failed|error)|push.*failed.*after.*retr/i.test(value)) return FAIL_PATTERNS.GIT_PUSH_FAILED;
  if (/build output (is )?empty|expected (artifact|output) (missing|not found)|no artifact produced|artifact (missing|not found)/i.test(value)) return FAIL_PATTERNS.BUILD_OUTPUT_EMPTY;
  if (/health check (timed? out|timeout|failed)|startup (timeout|never healthy|failed to become healthy)|container (never started|not healthy)/i.test(value)) return FAIL_PATTERNS.HEALTH_CHECK_TIMEOUT;
  if (/session ended without (changes|output)|transcript terminal with no output|agent made no changes|no (changes|output) (detected|produced)/i.test(value)) return FAIL_PATTERNS.SESSION_NO_CHANGES;
  if (/parse (error|failed)|invalid json|corrupted (status|payload)|malformed (completion|payload|status)|unexpected token in json/i.test(value)) return FAIL_PATTERNS.PAYLOAD_CORRUPTED;
  if (/rate.?limit.*exhaust|rate.?limit.*recover.*fail|max.*rate.*limit.*attempt|repeated rate.?limit/i.test(value)) return FAIL_PATTERNS.RATE_LIMIT_EXHAUSTED;
  if (/output file (missing|not found)|expected output file|gate output.*missing|review.*output.*missing/i.test(value)) return FAIL_PATTERNS.OUTPUT_FILE_MISSING;
  if (/\bBLOCKED\b/i.test(value) && (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (/no reason field/i.test(value)), () => (/empty reason/i.test(value)))), () => (/\[.*\]\s*BLOCKED\s*$/i.test(value)))), () => (/^BLOCKED$/i.test(value.trim()))))) return FAIL_PATTERNS.MODULE_ORPHANED;

  return FAIL_PATTERNS.CLASSIFICATION_MISSING;
}

/**
 * Classify a git push error message into a FAIL_PATTERNS code.
 * Used to enrich pipeline failure records with structured git failure context.
 * @param {string} errorMessage
 * @returns {string} A FAIL_PATTERNS value
 */
export function classifyGitPushError(errorMessage) {
  const msg = textValue(errorMessage);
  if (/\[rejected\]|non-fast-forward|updates were rejected/i.test(msg)) return FAIL_PATTERNS.GIT_PUSH_REJECTED;
  if (/authentication failed|publickey|permission denied \(publickey\)|could not read.*passphrase/i.test(msg)) return FAIL_PATTERNS.GIT_PUSH_FAILED;
  if (/timeout|timed out|connection (refused|reset)|network (error|unreachable)/i.test(msg)) return FAIL_PATTERNS.GIT_PUSH_FAILED;
  if (/git sync failed|failed before buster handoff/i.test(msg)) return FAIL_PATTERNS.GIT_SYNC_FAILED;
  return FAIL_PATTERNS.GIT_PUSH_FAILED;
}

/**
 * Used by callers of handleFail to always provide informative anti-pattern data.
 */
export function extractAgentFailReason(status, phase) {
  const phaseHistory = [...arrayValue(status.history)].reverse()
    .find(h => h.agent === phase && h.note);
  const reason = phaseHistory?.note
    ? `[${phase}] ${phaseHistory.note}`
    : phase === 'buster' && status.completion_summary
      ? `[${phase}] ${status.completion_summary}`
      : `${phase} reported FAIL (no details from agent)`;
  return reason;
}

/**
 * Extract a Forge-actionable fail reason from a Buster Pipeline pre-test failure.
 */
export function extractPreTestFailReason(redisEntry) {
  const reason = selectDefinedValue(() => (redisEntry?.reason), () => (PRETEST_REASON_MISSING));
  let verdictDetails = '';

  if (redisEntry?.verdict) {
    try {
      const failedSuites = Object.entries(suitesRecord(parsePreTestVerdict(redisEntry)))
        .filter(([_, s]) => selectTruthyValue(() => (s.status === 'FAIL'), () => (s.status === 'ERROR')))
        .map(([name, s]) => `${name}: ${selectPresentValue(getSuiteFailureDetail(s), SUITE_FAILED_DETAIL_MISSING)}`);
      if (failedSuites.length > 0) {
        verdictDetails = ` | Failed suites: ${failedSuites.join(' | ')}`;
      }
    } catch (error) {
      reportFailureSurfaceIncident(null, 'pretest_failed_suite_summary_failed', error, 'Failed to summarize Buster pre-test suite failures', {
        scope: 'extractPreTestFailReason',
      });
    }
  }

  return `[buster/pre-test] ${reason}${verdictDetails}`;
}

export function parsePreTestVerdict(redisEntry) {
  if (!redisEntry?.verdict) return { suites: {} };
  try {
    const parsed = typeof redisEntry.verdict === 'string'
      ? JSON.parse(redisEntry.verdict)
      : redisEntry.verdict;
    if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!parsed), () => (typeof parsed !== 'object'))), () => (Array.isArray(parsed)))), () => (!parsed.suites))), () => (typeof parsed.suites !== 'object'))), () => (Array.isArray(parsed.suites)))) {
      reportFailureSurfaceIncident(null, 'pretest_verdict_shape_invalid', null, 'Invalid Buster pre-test verdict shape; using empty suite summary', {
        scope: 'parsePreTestVerdict',
      });
      return { suites: {} };
    }
    return parsed;
  } catch (error) {
    reportFailureSurfaceIncident(null, 'pretest_verdict_parse_failed', error, 'Failed to parse Buster pre-test verdict; using empty suite summary', {
      scope: 'parsePreTestVerdict',
    });
    return { suites: {} };
  }
}

export function getSuiteFailureDetail(suite) {
  if (selectTruthyValue(() => (!suite), () => (typeof suite !== 'object'))) return '';
  if (suite.error) return String(suite.error);
  if (suite.top_finding) return String(suite.top_finding);
  const topFindings = arrayValue(suite.findings)
    .slice(0, 3)
    .map(f => selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (f?.description), () => (f?.message))), () => (f?.title))), () => ('missing_failure_description')))
    .filter(Boolean)
    .join('; ');
  return selectPresentValue(topFindings, textValue(suite.reason));
}

const PRETEST_INFRA_PATTERNS = [
  {
    code: 'REGISTRY_PROTOCOL_MISMATCH',
    summary: 'Registry mirror protocol mismatch (HTTP registry accessed as HTTPS)',
    re: /http:\s*server gave HTTP response to HTTPS client/i,
  },
  {
    code: 'REGISTRY_ACCESS_FAILED',
    summary: 'Registry access failed during pre-test',
    re: /(x509|certificate signed by unknown authority|tls|authentication required|unauthorized|denied|no route to host|connection refused|network is unreachable|i\/o timeout|temporary failure in name resolution|no such host).*(registry|podman|docker)|(?:registry|podman|docker).*(x509|certificate|unauthorized|denied|connection refused|timeout)/i,
  },
  {
    code: 'SANDBOX_RUNTIME_FAILURE',
    summary: 'Sandbox or Podman runtime failed before tests could run',
    re: /(sandbox-build|sandbox-run|podman) .*?(failed|error|cannot|unable)|error: pinging container registry/i,
  },
];

const PRETEST_CONFIG_PATTERNS = [
  {
    code: 'PROGRESS_CONFIG_INVALID',
    summary: 'progress.json / test configuration looks invalid',
    re: /(progress\.json|test_config|test_suites|serve\.|suite file not found|manifest path|dockerfile .*not found|image_name.*required|secret yaml .*not found)/i,
  },
];

export function classifyPreTestFailure(redisEntry) {
  const verdict = parsePreTestVerdict(redisEntry);
  const suiteEntries = Object.entries(suitesRecord(verdict));
  const failed = suiteEntries
    .filter(([_, suite]) => selectTruthyValue(() => (suite?.status === 'FAIL'), () => (suite?.status === 'ERROR')))
    .map(([name, suite]) => ({ name, detail: selectPresentValue(getSuiteFailureDetail(suite), SUITE_FAILED_DETAIL_MISSING) }));

  const reasonText = [
    textValue(redisEntry?.reason),
    ...failed.map(({ name, detail }) => `${name}: ${detail}`),
  ].filter(Boolean).join(' | ');

  // Explicit project/progress/test-config evidence wins before broad infra regexes.
  // Example: "podman build failed: Dockerfile not found" contains a runtime token,
  // but the actionable owner is still the declared Buster test configuration.
  for (const pattern of PRETEST_CONFIG_PATTERNS) {
    if (pattern.re.test(reasonText)) {
      return {
        kind: 'config',
        code: pattern.code,
        summary: pattern.summary,
        failureClass: normalizeFailureClass('pre_check', reasonText, { preTestKind: 'config' }),
        detail: selectPresentValue(failed[0]?.detail, reasonText, CONFIG_PRETEST_DETAIL_MISSING),
      };
    }
  }

  for (const pattern of PRETEST_INFRA_PATTERNS) {
    if (pattern.re.test(reasonText)) {
      return {
        kind: 'infra',
        code: pattern.code,
        summary: pattern.summary,
        failureClass: normalizeFailureClass('buster', reasonText, { preTestKind: 'infra' }),
        detail: selectPresentValue(failed[0]?.detail, reasonText, INFRA_PRETEST_DETAIL_MISSING),
      };
    }
  }

  return {
    kind: 'code',
    code: 'PRETEST_SUITE_FAILURE',
    summary: 'Pre-test suite failure before Buster subagent spawn',
    failureClass: normalizeFailureClass('buster', reasonText, { preTestKind: 'code' }),
    detail: selectPresentValue(failed[0]?.detail, reasonText, CODE_PRETEST_DETAIL_MISSING),
  };
}

export function getPassedSuiteNames(redisEntry) {
  return Object.entries(suitesRecord(parsePreTestVerdict(redisEntry)))
    .filter(([_, s]) => s?.status === 'PASS')
    .map(([name]) => name);
}

/**
 * Extract the names of failed suites from a Redis completion entry's verdict.
 */
export function getFailedSuiteNames(redisEntry) {
  return Object.entries(suitesRecord(parsePreTestVerdict(redisEntry)))
    .filter(([_, s]) => selectTruthyValue(() => (s?.status === 'FAIL'), () => (s?.status === 'ERROR')))
    .map(([name]) => name);
}
