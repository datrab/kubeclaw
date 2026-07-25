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

function textValue(value: any) {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : String(value);
}

function arrayValue(value: any) {
  return Array.isArray(value) ? value : [];
}

function objectRecord(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function suitesRecord(verdict: any) {
  return selectDefinedValue(() => (objectRecord(verdict?.suites)), () => ({}));
}

function selectPresentValue(...values: any) {
  return values.find((value: any) => value !== undefined && value !== null && value !== '');
}

const FAILURE_TEXT_RULES = [
  [/image not known|image pull|no such image/i, FAIL_PATTERNS.BUSTER_IMAGE_UNAVAILABLE],
  [/address already in use|eaddrinuse|errno 98/i, FAIL_PATTERNS.BUSTER_PORT_CONFLICT],
  [/nothing to commit|nothing added to commit/i, FAIL_PATTERNS.BLUEPRINT_ALREADY_RELEASED],
  [/error TS\d+|is not assignable|has no exported member|declared but never read/i, FAIL_PATTERNS.FORGE_TS_COMPILE_ERROR],
  [/rebase conflict|\bCONFLICT\b|rebase --abort/i, FAIL_PATTERNS.GIT_REBASE_CONFLICT],
  [/git sync failed|failed before buster handoff/i, FAIL_PATTERNS.GIT_SYNC_FAILED],
  [/\[rejected\]|non-fast-forward|push.*rejected|updates were rejected/i, FAIL_PATTERNS.GIT_PUSH_REJECTED],
  [/git push (failed|error)|push.*failed.*after.*retr/i, FAIL_PATTERNS.GIT_PUSH_FAILED],
  [/build output (is )?empty|expected (artifact|output) (missing|not found)|no artifact produced|artifact (missing|not found)/i, FAIL_PATTERNS.BUILD_OUTPUT_EMPTY],
  [/health check (timed? out|timeout|failed)|startup (timeout|never healthy|failed to become healthy)|container (never started|not healthy)/i, FAIL_PATTERNS.HEALTH_CHECK_TIMEOUT],
  [/session ended without (changes|output)|transcript terminal with no output|agent made no changes|no (changes|output) (detected|produced)/i, FAIL_PATTERNS.SESSION_NO_CHANGES],
  [/parse (error|failed)|invalid json|corrupted (status|payload)|malformed (completion|payload|status)|unexpected token in json/i, FAIL_PATTERNS.PAYLOAD_CORRUPTED],
  [/rate.?limit.*exhaust|rate.?limit.*recover.*fail|max.*rate.*limit.*attempt|repeated rate.?limit/i, FAIL_PATTERNS.RATE_LIMIT_EXHAUSTED],
  [/output file (missing|not found)|expected output file|gate output.*missing|review.*output.*missing/i, FAIL_PATTERNS.OUTPUT_FILE_MISSING],
] as const;

export function classifyFailPattern(text: any) {
  const value = textValue(text);
  if (!value.trim()) return undefined;

  const matched = FAILURE_TEXT_RULES.find(([pattern]) => pattern.test(value));
  if (matched) return matched[1];
  if (/\bBLOCKED\b/i.test(value) && (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (/no reason field/i.test(value)), () => (/empty reason/i.test(value)))), () => (/\[.*\]\s*BLOCKED\s*$/i.test(value)))), () => (/^BLOCKED$/i.test(value.trim()))))) return FAIL_PATTERNS.MODULE_ORPHANED;

  return FAIL_PATTERNS.CLASSIFICATION_MISSING;
}

/**
 * Classify a git push error message into a FAIL_PATTERNS code.
 * Used to enrich pipeline failure records with structured git failure context.
 * @param {string} errorMessage
 * @returns {string} A FAIL_PATTERNS value
 */
function classifyGitPushError(errorMessage: any) {
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
export function extractAgentFailReason(status: any, phase: any) {
  const phaseHistory = [...arrayValue(status.history)].reverse()
    .find((h: any) => h.agent === phase && h.note);
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
export function extractPreTestFailReason(redisEntry: any) {
  const reason = selectDefinedValue(() => (redisEntry?.reason), () => (PRETEST_REASON_MISSING));
  let verdictDetails = '';

  if (redisEntry?.verdict) {
    try {
      const failedSuites = Object.entries(suitesRecord(parsePreTestVerdict(redisEntry)))
        .filter(([_, s]: any) => selectTruthyValue(() => (s.status === 'FAIL'), () => (s.status === 'ERROR')))
        .map(([name, s]: any) => `${name}: ${selectPresentValue(getSuiteFailureDetail(s), SUITE_FAILED_DETAIL_MISSING)}`);
      if (failedSuites.length > 0) {
        verdictDetails = ` | Failed suites: ${failedSuites.join(' | ')}`;
      }
    } catch (error: any) {
      reportFailureSurfaceIncident(null, 'pretest_failed_suite_summary_failed', error, 'Failed to summarize Buster pre-test suite failures', {
        scope: 'extractPreTestFailReason',
      });
    }
  }

  return `[buster/pre-test] ${reason}${verdictDetails}`;
}

export function parsePreTestVerdict(redisEntry: any) {
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
  } catch (error: any) {
    reportFailureSurfaceIncident(null, 'pretest_verdict_parse_failed', error, 'Failed to parse Buster pre-test verdict; using empty suite summary', {
      scope: 'parsePreTestVerdict',
    });
    return { suites: {} };
  }
}

export function getSuiteFailureDetail(suite: any) {
  if (selectTruthyValue(() => (!suite), () => (typeof suite !== 'object'))) return '';
  if (suite.error) return String(suite.error);
  if (suite.top_finding) return String(suite.top_finding);
  const topFindings = arrayValue(suite.findings)
    .slice(0, 3)
    .map((f: any) => selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (f?.description), () => (f?.message))), () => (f?.title))), () => ('missing_failure_description')))
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
    re: /(x509|certificate signed by unknown authority|tls|authentication required|unauthorized|denied|no route to host|connection refused|network is unreachable|i\/o timeout|temporary failure in name resolution|no such host).*(registry|buildkit)|(?:registry|buildkit).*(x509|certificate|unauthorized|denied|connection refused|timeout)/i,
  },
  {
    code: 'BUILDKIT_RUNTIME_FAILURE',
    summary: 'Rootless BuildKit failed before tests could run',
    re: /buildkit .*?(failed|error|cannot|unable)|error: pinging container registry/i,
  },
];

const PRETEST_CONFIG_PATTERNS = [
  {
    code: 'PROGRESS_CONFIG_INVALID',
    summary: 'progress.json / test configuration looks invalid',
    re: /(progress\.json|test_config|test_suites|serve\.|suite file not found|manifest path|dockerfile .*not found|image_name.*required|secret yaml .*not found)/i,
  },
];

export function classifyPreTestFailure(redisEntry: any) {
  const verdict = parsePreTestVerdict(redisEntry);
  const suiteEntries = Object.entries(suitesRecord(verdict));
  const failed = suiteEntries
    .filter(([_, suite]: any) => selectTruthyValue(() => (suite?.status === 'FAIL'), () => (suite?.status === 'ERROR')))
    .map(([name, suite]: any) => ({ name, detail: selectPresentValue(getSuiteFailureDetail(suite), SUITE_FAILED_DETAIL_MISSING) }));

  const reasonText = [
    textValue(redisEntry?.reason),
    ...failed.map(({ name, detail }: any) => `${name}: ${detail}`),
  ].filter(Boolean).join(' | ');

  // Explicit project/progress/test-config evidence wins before broad infra regexes.
  // Example: "BuildKit failed: Dockerfile not found" contains a runtime token,
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

export function getPassedSuiteNames(redisEntry: any) {
  return Object.entries(suitesRecord(parsePreTestVerdict(redisEntry)))
    .filter(([_, s]: any) => s?.status === 'PASS')
    .map(([name]: any) => name);
}

/**
 * Extract the names of failed suites from a Redis completion entry's verdict.
 */
export function getFailedSuiteNames(redisEntry: any) {
  return Object.entries(suitesRecord(parsePreTestVerdict(redisEntry)))
    .filter(([_, s]: any) => selectTruthyValue(() => (s?.status === 'FAIL'), () => (s?.status === 'ERROR')))
    .map(([name]: any) => name);
}
