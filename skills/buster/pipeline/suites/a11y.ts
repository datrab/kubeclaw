import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
} from '../services/verdict-schema.ts';
import type { Finding, SuiteStatus, SuiteVerdict } from '../services/verdict-schema.ts';
import { buildLocalhostSuiteUrl } from './url-paths.ts';

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

function createLog(logSink: LogSink | null | undefined): (msg: string) => void {
  return (msg: string): void => {
    console.log(`[SUITE] [A11Y] ${msg}`);
    if (logSink) logSink({ suite: 'a11y', msg });
  };
}

function objectRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function arrayValue<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error == null ? 'missing_error_detail' : String(error);
}

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

export default async function a11ySuite(context: A11yContext): Promise<SuiteVerdict> {
  const log = createLog(context.logSink);
  const startTime = Date.now();
  const serve     = selectDefinedValue(() => (objectRecord(context.config?.serve)), () => ({}));
  const a11yConf  = selectDefinedValue(() => (objectRecord(context.config?.a11y)), () => ({}));

  const type = selectDefinedValue(() => (nonEmptyString(serve.type)), () => ('static'));
  const port = selectDefinedValue(() => (serve.port), () => ((type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port)));
  let url: string;
  try {
    url = buildLocalhostSuiteUrl(port, selectDefinedValue(() => (nonEmptyString(a11yConf.path)), () => (DEFAULTS.path)), 'a11y.path');
  } catch (error) {
    const message = errorMessage(error);
    return createSuiteVerdict('a11y', STATUS.ERROR, {
      critical: false,
      duration_ms: Date.now() - startTime,
      error: message,
      findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'a11y-path' })],
    });
  }

  const tags: string[] = arrayValue<string>(a11yConf.tags).length > 0 ? arrayValue<string>(a11yConf.tags) : DEFAULTS.tags;
  const exclude: string[] = arrayValue<string>(a11yConf.exclude);
  const maxFindings = Number.isFinite(a11yConf.max_findings) ? a11yConf.max_findings : DEFAULTS.max_findings;
  const thresholds = selectTruthyValue(() => (a11yConf.thresholds), () => (null));
  const enforced = thresholds !== null;
  const mode = evidenceMode(enforced);

  log(`Scanning ${url} (tags: ${tags.join(',')}, mode: ${mode})`);

  let browser: any;
  try {
    let chromium: any;
    try {
      // @ts-expect-error Optional runtime dependency declaration is not installed for this migration island.
      const pw = await import('playwright');
      chromium = pw.chromium;
    } catch (_error) {
      throw new Error('playwright is not available in this environment');
    }

    let AxeBuilder: any;
    try {
      // @ts-expect-error Optional runtime dependency declaration is not installed for this migration island.
      const axeMod = await import('@axe-core/playwright');
      AxeBuilder = axeMod.AxeBuilder;
    } catch (_error) {
      throw new Error('@axe-core/playwright is not available in this environment');
    }

    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const contextPw = await browser.newContext();
    const page = await contextPw.newPage();

    await page.goto(url, { waitUntil: 'networkidle', timeout: a11yTimeoutAuthority(a11yConf) });

    let builder = new AxeBuilder({ page }).withTags(tags);
    for (const sel of exclude) builder = builder.exclude(sel);

    const results = await builder.analyze();
    await contextPw.close();

    const findings: Finding[] = [];
    const violations = arrayValue<AnyRecord>(results.violations);
    const passes = arrayValue<AnyRecord>(results.passes);
    for (const violation of violations) {
      for (const node of arrayValue(violation.nodes)) {
        if (findings.length >= maxFindings) break;
        findings.push(createFinding(mapSeverity(violation.impact), violation.help, {
          rule: violation.id,
          element: extractSelector(node),
        }));
      }
      if (findings.length >= maxFindings) break;
    }

    const checksTotal = passes.length + violations.length;
    const checksFailed = violations.length;
    const checksPassed = passes.length;
    let status: SuiteStatus = STATUS.PASS;

    if (enforced && checksFailed > 0) {
      const counts: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      for (const violation of violations) {
        const sev = selectDefinedValue(() => (nonEmptyString(violation.impact)), () => ('minor'));
        counts[sev] = (selectDefinedValue(() => (counts[sev]), () => (0))) + 1;
      }

      for (const [sev, max] of Object.entries(thresholds)) {
        if ((selectDefinedValue(() => (counts[sev]), () => (0))) > Number(max)) {
          status = STATUS.FAIL;
          break;
        }
      }
    }

    const duration_ms = Date.now() - startTime;
    const icon = status === STATUS.PASS ? '✅' : '⚠️';
    log(`${icon} ${mode}: ${checksPassed}/${checksTotal} passed, ${checksFailed} violations (${findings.length} findings)`);

    return createSuiteVerdict('a11y', status, {
      critical: false,
      duration_ms,
      checks_total: checksTotal,
      checks_passed: checksPassed,
      checks_failed: checksFailed,
      findings,
      metadata: {
        tool: `axe-core (${tags.join(',')})`,
        url_tested: url,
        mode,
        violations: checksFailed,
        passes: checksPassed,
        incomplete: arrayValue(results.incomplete).length,
        inapplicable: arrayValue(results.inapplicable).length,
        ...(enforced ? { thresholds } : {}),
      },
    });
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    const message = errorMessage(error);
    log(`ERROR: ${message}`);

    return createSuiteVerdict('a11y', STATUS.ERROR, {
      critical: false,
      duration_ms,
      error: message,
      findings: [],
    });
  } finally {
    if (browser) await browser.close().catch((error: unknown) => log(`non-blocking browser close failed: ${errorMessage(error)}`));
  }
}

function a11yTimeoutAuthority(a11yConf) {
  if (a11yConf.timeout !== undefined && a11yConf.timeout !== null) return a11yConf.timeout;
  return DEFAULTS.timeout;
}
