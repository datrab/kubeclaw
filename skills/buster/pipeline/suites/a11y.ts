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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
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
  const serve     = context.config?.serve || {};
  const a11yConf  = context.config?.a11y  || {};

  const type = serve.type || 'static';
  const port = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  let url: string;
  try {
    url = buildLocalhostSuiteUrl(port, a11yConf.path || DEFAULTS.path, 'a11y.path');
  } catch (error) {
    const message = errorMessage(error);
    return createSuiteVerdict('a11y', STATUS.ERROR, {
      critical: false,
      duration_ms: Date.now() - startTime,
      error: message,
      findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'a11y-path' })],
    });
  }

  const tags: string[] = a11yConf.tags || DEFAULTS.tags;
  const exclude: string[] = a11yConf.exclude || DEFAULTS.exclude;
  const maxFindings = a11yConf.max_findings || DEFAULTS.max_findings;
  const thresholds = a11yConf.thresholds || null;
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

    await page.goto(url, { waitUntil: 'networkidle', timeout: a11yConf.timeout || DEFAULTS.timeout });

    let builder = new AxeBuilder({ page }).withTags(tags);
    for (const sel of exclude) builder = builder.exclude(sel);

    const results = await builder.analyze();
    await contextPw.close();

    const findings: Finding[] = [];
    for (const violation of results.violations || []) {
      for (const node of violation.nodes || []) {
        if (findings.length >= maxFindings) break;
        findings.push(createFinding(mapSeverity(violation.impact), violation.help, {
          rule: violation.id,
          element: extractSelector(node),
        }));
      }
      if (findings.length >= maxFindings) break;
    }

    const checksTotal = (results.passes || []).length + (results.violations || []).length;
    const checksFailed = (results.violations || []).length;
    const checksPassed = (results.passes || []).length;
    let status: SuiteStatus = STATUS.PASS;

    if (enforced && checksFailed > 0) {
      const counts: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      for (const violation of results.violations || []) {
        const sev = String(violation.impact || 'minor');
        counts[sev] = (counts[sev] || 0) + 1;
      }

      for (const [sev, max] of Object.entries(thresholds)) {
        if ((counts[sev] || 0) > Number(max)) {
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
        incomplete: results.incomplete?.length || 0,
        inapplicable: results.inapplicable?.length || 0,
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
