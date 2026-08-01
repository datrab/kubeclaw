import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
// ═══════════════════════════════════════════════════════════════
// Suite: a11y — Accessibility Check via axe-core
// ═══════════════════════════════════════════════════════════════
//
// KEEP_TYPED_POLICY: accessibility defaults allow minimal typed config;
// no-threshold findings use explicit evidence-only PASS mode; missing runtime
// dependencies become ERROR verdicts; selector fallbacks and browser cleanup
// remain nonfatal to preserve useful evidence.

import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.js';
import type { Finding, SuiteStatus, SuiteVerdict } from '../services/verdict-schema.js';
import { buildLocalhostSuiteUrl } from './url-paths.js';
import {
  createSuiteLog,
  suiteArray as arrayValue,
  suiteErrorMessage as errorMessage,
  suiteNonEmptyString as nonEmptyString,
  suiteObject as objectRecord,
  suiteObjectOrEmpty as objectRecordOrEmpty,
} from './support.js';

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;

interface A11yContext {
  logSink?: LogSink | null;
  config?: {
    serve?: AnyRecord;
    a11y?: AnyRecord;
  };
}

const DEFAULTS = {
  static_port: 9999,
  server_port: 3000,
  path:        '/',
  tags:        ['wcag2a', 'wcag2aa'],
  exclude:     [] as string[],
  max_findings: 50,
  timeout:     15000,
};

function mapSeverity(impact: unknown): Finding['severity'] {
  switch (impact) {
    case 'critical': return SEVERITY.CRITICAL;
    case 'serious':  return SEVERITY.SERIOUS;
    case 'moderate': return SEVERITY.MODERATE;
    case 'minor':    return SEVERITY.MINOR;
    default:         return SEVERITY.MINOR;
  }
}

function extractSelector(node: any): string | null {
  if (node?.target?.[0]) return String(node.target[0]);
  if (node?.html) return String(node.html).slice(0, 80);
  return null;
}

function evidenceMode(enforced: boolean): 'enforced' | 'evidence-only' {
  return enforced ? 'enforced' : 'evidence-only';
}

interface A11ySettings {
  url: string;
  tags: string[];
  exclude: string[];
  maxFindings: number;
  thresholds: AnyRecord | null;
  timeout: number;
}

function normalizeA11ySettings(context: A11yContext): A11ySettings {
  const serve = objectRecordOrEmpty(context.config?.serve);
  const config = objectRecordOrEmpty(context.config?.a11y);
  const type = nonEmptyString(serve.type);
  const effectiveType = type === null ? 'static' : type;
  const port = serve.port === undefined
    ? (effectiveType === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port)
    : serve.port;
  const configuredPath = nonEmptyString(config.path);
  const url = buildLocalhostSuiteUrl(port, configuredPath === null ? DEFAULTS.path : configuredPath, 'a11y.path');
  const configuredTags = arrayValue<string>(config.tags);
  return {
    url,
    tags: configuredTags.length === 0 ? DEFAULTS.tags : configuredTags,
    exclude: arrayValue<string>(config.exclude),
    maxFindings: Number.isFinite(config.max_findings) ? Number(config.max_findings) : DEFAULTS.max_findings,
    thresholds: objectRecord(config.thresholds),
    timeout: a11yTimeoutAuthority(config),
  };
}

async function loadA11yRuntime(): Promise<{ chromium: any; AxeBuilder: any }> {
  let chromium: any;
  let AxeBuilder: any;
  try {
    chromium = (await import('playwright')).chromium;
  } catch (_error) {
    throw new Error('playwright is not available in this environment');
  }
  try {
    AxeBuilder = (await import('@axe-core/playwright')).AxeBuilder;
  } catch (_error) {
    throw new Error('@axe-core/playwright is not available in this environment');
  }
  return { chromium, AxeBuilder };
}

function collectA11yFindings(violations: AnyRecord[], maxFindings: number): Finding[] {
  const findings: Finding[] = [];
  for (const violation of violations) {
    for (const node of arrayValue(violation.nodes)) {
      if (findings.length >= maxFindings) return findings;
      findings.push(createFinding(mapSeverity(violation.impact), violation.help, {
        rule: violation.id,
        element: extractSelector(node),
      }));
    }
  }
  return findings;
}

function a11yStatus(violations: AnyRecord[], thresholds: AnyRecord | null): SuiteStatus {
  if (thresholds === null) return STATUS.PASS;
  if (violations.length === 0) return STATUS.PASS;
  const counts: Record<string, number> = {};
  for (const violation of violations) {
    const impact = nonEmptyString(violation.impact);
    const severity = impact === null ? 'minor' : impact;
    counts[severity] = (counts[severity] === undefined ? 0 : counts[severity]) + 1;
  }
  for (const [severity, maximum] of Object.entries(thresholds)) {
    if ((counts[severity] === undefined ? 0 : counts[severity]) > Number(maximum)) return STATUS.FAIL;
  }
  return STATUS.PASS;
}

function buildA11yVerdict(settings: A11ySettings, results: AnyRecord, startTime: number, log: (message: string) => void): SuiteVerdict {
  const violations = arrayValue<AnyRecord>(results.violations);
  const passes = arrayValue<AnyRecord>(results.passes);
  const findings = collectA11yFindings(violations, settings.maxFindings);
  const checksTotal = passes.length + violations.length;
  const checksFailed = violations.length;
  const checksPassed = passes.length;
  const status = a11yStatus(violations, settings.thresholds);
  const mode = evidenceMode(settings.thresholds !== null);
  const icon = status === STATUS.PASS ? '✅' : '⚠️';
  log(`${icon} ${mode}: ${checksPassed}/${checksTotal} passed, ${checksFailed} violations (${findings.length} findings)`);
  return createSuiteVerdict('a11y', status, {
    critical: false,
    duration_ms: Date.now() - startTime,
    checks_total: checksTotal,
    checks_passed: checksPassed,
    checks_failed: checksFailed,
    findings,
    metadata: {
      tool: `axe-core (${settings.tags.join(',')})`,
      url_tested: settings.url,
      mode,
      violations: checksFailed,
      passes: checksPassed,
      incomplete: arrayValue(results.incomplete).length,
      inapplicable: arrayValue(results.inapplicable).length,
      ...(settings.thresholds === null ? {} : { thresholds: settings.thresholds }),
    },
  });
}

async function executeA11y(settings: A11ySettings, startTime: number, log: (message: string) => void): Promise<SuiteVerdict> {
  let browser: any;
  try {
    const { chromium, AxeBuilder } = await loadA11yRuntime();
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const browserContext = await browser.newContext();
    const page = await browserContext.newPage();
    await page.goto(settings.url, { waitUntil: 'networkidle', timeout: settings.timeout });
    let builder = new AxeBuilder({ page }).withTags(settings.tags);
    for (const selector of settings.exclude) builder = builder.exclude(selector);
    const results = await builder.analyze();
    await browserContext.close();
    return buildA11yVerdict(settings, results, startTime, log);
  } catch (error) {
    const message = errorMessage(error);
    log(`ERROR: ${message}`);
    return createSuiteVerdict('a11y', STATUS.ERROR, {
      critical: false,
      duration_ms: Date.now() - startTime,
      error: message,
      findings: [],
    });
  } finally {
    if (browser) await browser.close().catch((error: unknown) => log(`non-blocking browser close failed: ${errorMessage(error)}`));
  }
}

export default async function a11ySuite(context: A11yContext): Promise<SuiteVerdict> {
  const log = createSuiteLog('a11y', 'A11Y', context.logSink);
  const startTime = Date.now();
  let settings: A11ySettings;
  try {
    settings = normalizeA11ySettings(context);
  } catch (error) {
    const message = errorMessage(error);
    return createSuiteVerdict('a11y', STATUS.ERROR, {
      critical: false,
      duration_ms: Date.now() - startTime,
      error: message,
      findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'a11y-path' })],
    });
  }

  const enforced = settings.thresholds !== null;
  const mode = evidenceMode(enforced);
  log(`Scanning ${settings.url} (tags: ${settings.tags.join(',')}, mode: ${mode})`);
  return executeA11y(settings, startTime, log);
}

function a11yTimeoutAuthority(a11yConf: AnyRecord): number {
  if (typeof a11yConf.timeout === 'number' && Number.isFinite(a11yConf.timeout)) return a11yConf.timeout;
  return DEFAULTS.timeout;
}
