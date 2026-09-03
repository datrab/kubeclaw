import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function object(value, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code); return value; }
function exact(value, fields, code) { if (Object.keys(value).some((field) => !fields.includes(field))) throw new Error(code); }
function bounded(value, minimum, maximum) { return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum; }
function inside(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\0')) throw new Error('LIGHTHOUSE_SETTINGS_FILE_DENIED');
  const candidate = path.resolve(root, relative); if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error('LIGHTHOUSE_SETTINGS_FILE_DENIED');
  let real; try { real = fs.realpathSync(candidate); } catch { throw new Error('LIGHTHOUSE_SETTINGS_FILE_DENIED'); }
  if (!real.startsWith(`${root}${path.sep}`) || !fs.statSync(real).isFile()) throw new Error('LIGHTHOUSE_SETTINGS_FILE_DENIED'); return real;
}
function endpoint(invocation, config) {
  if (invocation.inputs.some((input) => !['deployment', 'endpoint'].includes(input.name))) throw new Error('LIGHTHOUSE_INPUT_UNKNOWN');
  if (config.url !== undefined && invocation.inputs.length) throw new Error('LIGHTHOUSE_TARGET_AMBIGUOUS');
  if (typeof config.url === 'string') return new URL(config.url).origin;
  if (invocation.inputs.length !== 1 || invocation.inputs[0].kind !== 'value') throw new Error('LIGHTHOUSE_TARGET_REQUIRED');
  const input = invocation.inputs[0]; const value = object(input.value, 'LIGHTHOUSE_INPUT_INVALID');
  if (input.name === 'endpoint') {
    if (input.schemaId !== 'kubeclaw.public-endpoint-fixture@1' || value.schemaVersion !== 'public-endpoint-fixture.v1'
      || typeof value.url !== 'string') throw new Error('LIGHTHOUSE_INPUT_INVALID'); return new URL(value.url).origin;
  }
  if (input.name !== 'deployment' || input.schemaId !== 'kubeclaw.kubernetes-deployment-fixture@1'
    || value.schemaVersion !== 'kubernetes-deployment-fixture.v1' || !Array.isArray(value.endpoints)) throw new Error('LIGHTHOUSE_INPUT_INVALID');
  const selected = config.endpointName === undefined ? value.endpoints[0] : value.endpoints.find((item) => item?.name === config.endpointName);
  if (!selected || typeof selected.url !== 'string') throw new Error('LIGHTHOUSE_ENDPOINT_NOT_FOUND'); return new URL(selected.url).origin;
}
function settings(repository, config) {
  const bytes = fs.readFileSync(inside(repository, config.settingsFile));
  if (bytes.byteLength > 262144) throw new Error('LIGHTHOUSE_SETTINGS_FILE_TOO_LARGE');
  let document; try { document = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('LIGHTHOUSE_SETTINGS_FILE_INVALID'); }
  if (document?.schemaVersion !== 'kubeclaw.lighthouse-settings.v1') throw new Error('LIGHTHOUSE_SETTINGS_FILE_INVALID');
  exact(document, ['schemaVersion', 'profiles', 'budgets'], 'LIGHTHOUSE_SETTINGS_FILE_INVALID');
  const profiles = object(document.profiles, 'LIGHTHOUSE_SETTINGS_FILE_INVALID');
  const profileNames = Object.keys(profiles);
  if (profileNames.length < 1 || profileNames.length > 32
    || profileNames.some((name) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(name))) throw new Error('LIGHTHOUSE_SETTINGS_FILE_INVALID');
  for (const value of Object.values(profiles)) {
    const candidate = object(value, 'LIGHTHOUSE_PROFILE_INVALID'); exact(candidate, ['formFactor', 'screen', 'throttling'], 'LIGHTHOUSE_PROFILE_INVALID');
    if (!['mobile', 'desktop'].includes(candidate.formFactor)) throw new Error('LIGHTHOUSE_PROFILE_INVALID');
    const screen = object(candidate.screen, 'LIGHTHOUSE_PROFILE_INVALID'); exact(screen, ['width', 'height', 'deviceScaleFactor', 'mobile'], 'LIGHTHOUSE_PROFILE_INVALID');
    const throttling = object(candidate.throttling, 'LIGHTHOUSE_PROFILE_INVALID'); exact(throttling, ['rttMs', 'throughputKbps', 'cpuSlowdownMultiplier'], 'LIGHTHOUSE_PROFILE_INVALID');
    if (!Number.isSafeInteger(screen.width) || screen.width < 240 || screen.width > 3840
      || !Number.isSafeInteger(screen.height) || screen.height < 240 || screen.height > 2160
      || !bounded(screen.deviceScaleFactor, 0.5, 4) || typeof screen.mobile !== 'boolean'
      || !bounded(throttling.rttMs, 0, 5000) || !bounded(throttling.throughputKbps, Number.MIN_VALUE, 1000000)
      || !bounded(throttling.cpuSlowdownMultiplier, 1, 32)) throw new Error('LIGHTHOUSE_PROFILE_INVALID');
  }
  const profile = object(profiles[config.profile], 'LIGHTHOUSE_PROFILE_NOT_FOUND');
  const budgets = object(document.budgets, 'LIGHTHOUSE_SETTINGS_FILE_INVALID');
  const budgetNames = Object.keys(budgets);
  if (budgetNames.length > 32 || budgetNames.some((name) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(name))) {
    throw new Error('LIGHTHOUSE_SETTINGS_FILE_INVALID');
  }
  for (const value of Object.values(budgets)) {
    const candidate = object(value, 'LIGHTHOUSE_BUDGET_INVALID');
    exact(candidate, ['minimumScore', 'maximumLcpMs', 'maximumCls', 'maximumTbtMs'], 'LIGHTHOUSE_BUDGET_INVALID');
    if (!Object.keys(candidate).length || (candidate.minimumScore !== undefined && !bounded(candidate.minimumScore, 0, 100))
      || (candidate.maximumLcpMs !== undefined && !bounded(candidate.maximumLcpMs, 0, 120000))
      || (candidate.maximumCls !== undefined && !bounded(candidate.maximumCls, 0, 10))
      || (candidate.maximumTbtMs !== undefined && !bounded(candidate.maximumTbtMs, 0, 120000))) throw new Error('LIGHTHOUSE_BUDGET_INVALID');
  }
  let budget = null;
  if (config.budget !== undefined) {
    budget = object(budgets[config.budget], 'LIGHTHOUSE_BUDGET_NOT_FOUND');
  }
  return { profile: { ...profile, name: config.profile }, budget };
}
function expiryValid(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(value)); if (!match) return false;
  const expiry = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999);
  return new Date(expiry).toISOString().slice(0, 10) === value && expiry >= Date.now();
}
function accepted(config, route, audit) { return (config.acceptances ?? []).find((item) => item.route === route && item.audit === audit && expiryValid(item.expiresAt)) ?? null; }
function median(values) { const ordered = [...values].sort((a, b) => a - b); return ordered[Math.floor(ordered.length / 2)]; }
function score(report, category) { const value = report?.categories?.[category]?.score; if (typeof value !== 'number') throw new Error('LIGHTHOUSE_CATEGORY_MISSING'); return Math.round(value * 100); }
function metric(report, audit) { const value = report?.audits?.[audit]?.numericValue; if (typeof value !== 'number') throw new Error('LIGHTHOUSE_METRIC_MISSING'); return value; }
function id(value) { return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16); }
function severity(gap) { return gap >= 30 ? 'critical' : gap >= 15 ? 'high' : gap >= 5 ? 'medium' : 'low'; }

export function provider() { return { async execute(invocation, context) {
  const config = object(invocation.configuration.values, 'LIGHTHOUSE_CONFIG_INVALID'); const workspace = fs.realpathSync(context.workspaceRoot);
  const repository = fs.realpathSync(path.resolve(workspace, invocation.workspace.repository));
  if (!repository.startsWith(`${workspace}${path.sep}`)) throw new Error('LIGHTHOUSE_WORKSPACE_INVALID');
  const target = endpoint(invocation, config); const resolved = settings(repository, config);
  const runCount = config.runs ?? (config.purpose === 'performance' ? 3 : 1);
  const runs = config.routes.flatMap((route) => Array.from({ length: runCount }, () => ({ route, purpose: config.purpose, profile: resolved.profile })));
  const response = await context.invoke('browser.lighthouse', { operation: 'audit', resource: { type: 'network.url', canonicalId: target },
    payload: { runs, timeoutMs: config.timeoutMs ?? 120000 } });
  if (response.schemaVersion !== 'browser-lighthouse-result.v1' || !Array.isArray(response.results)
    || response.results.length !== runs.length) throw new Error('LIGHTHOUSE_CAPABILITY_RESULT_INVALID');
  const evidence = []; const findings = []; const routeResults = []; let failed = 0; let total = 0;
  for (const route of config.routes) {
    const reports = response.results.filter((result) => result.route === route);
    for (const [index, result] of reports.entries()) {
      const file = `lighthouse-${id(`${route}\0${config.purpose}\0${config.profile}\0${index}`)}.json`;
      fs.writeFileSync(path.join(workspace, invocation.workspace.evidence, file), `${JSON.stringify(result.report, null, 2)}\n`);
      evidence.push({ evidenceId: `lighthouse-${id(file)}`, type: 'performance-report', file,
        mediaType: 'application/vnd.google.lighthouse+json' });
    }
    if (config.purpose === 'performance') {
      const scores = reports.map((result) => score(result.report, 'performance'));
      const representative = scores.indexOf(median(scores)); const representativeReport = reports[representative].report;
      const values = { score: scores[representative], lcpMs: metric(representativeReport, 'largest-contentful-paint'),
        cls: metric(representativeReport, 'cumulative-layout-shift'), tbtMs: metric(representativeReport, 'total-blocking-time') };
      evidence[routeResults.length * runCount + representative].type = 'performance-report-representative';
      const budget = resolved.budget;
      if (budget) for (const [rule, actual, limit, comparison] of [
        ['performance-score', values.score, budget.minimumScore, 'minimum'],
        ['largest-contentful-paint', values.lcpMs, budget.maximumLcpMs, 'maximum'],
        ['cumulative-layout-shift', values.cls, budget.maximumCls, 'maximum'],
        ['total-blocking-time', values.tbtMs, budget.maximumTbtMs, 'maximum'],
      ]) if (limit !== undefined) {
        total += 1; const violation = comparison === 'minimum' ? actual < limit : actual > limit;
        if (violation) { failed += 1; findings.push({ id: `lighthouse:${id(`${route}\0${rule}`)}`, severity: severity(Math.abs(actual - limit)), rule,
          message: `${route}: ${rule} ${actual} violates ${comparison} ${limit}` }); }
      }
      routeResults.push({ route, ...values, representativeRun: representative });
    } else {
      const report = reports[0].report; const categoryScore = score(report, config.purpose); const auditRefs = report.categories?.[config.purpose]?.auditRefs;
      if (!Array.isArray(auditRefs)) throw new Error('LIGHTHOUSE_CATEGORY_MISSING');
      if (auditRefs.some((reference) => report.audits?.[reference.id]?.scoreDisplayMode === 'error')) {
        throw new Error('LIGHTHOUSE_AUDIT_EXECUTION_ERROR');
      }
      const failedAudits = auditRefs.filter((reference) => {
        const audit = report.audits?.[reference.id]; return audit && typeof audit.score === 'number' && audit.score < 1
          && !['informative', 'manual', 'notApplicable'].includes(audit.scoreDisplayMode);
      });
      for (const reference of failedAudits) {
        total += 1; const acceptance = accepted(config, route, reference.id);
        if (!acceptance) failed += 1;
        findings.push({ id: `lighthouse:${id(`${route}\0${reference.id}`)}`, severity: acceptance ? 'info' : 'medium', rule: reference.id,
          message: `${acceptance ? `Accepted until ${acceptance.expiresAt} (${acceptance.reason}): ` : ''}${route}: ${report.audits[reference.id].title}` });
      }
      routeResults.push({ route, score: categoryScore, failedAudits: failedAudits.length });
    }
  }
  const outcome = failed > 0 ? 'failed' : 'passed';
  return { schemaVersion: 'provider-result.v1', outcome,
    summary: `${config.purpose}: ${config.routes.length} route(s), ${response.results.length} report(s), ${failed} failed check(s).`,
    counts: { total, passed: total - failed, failed, skipped: 0 }, findings,
    metrics: routeResults.flatMap((result) => Object.entries(result).filter(([, value]) => typeof value === 'number')
      .map(([name, value]) => ({ name: `lighthouse.${name}`, value, unit: name === 'score' ? 'score' : name === 'cls' ? 'ratio' : 'ms' }))),
    evidenceFiles: evidence, reports: [], outputs: [], exitCode: null, signal: null,
    providerDetails: { schemaId: 'kubeclaw.lighthouse-details.v1', schemaDigest: `sha256:${crypto.createHash('sha256').update('kubeclaw.lighthouse-details.v1').digest('hex')}`,
      values: { purpose: config.purpose, profile: config.profile, routes: routeResults,
        lighthouseVersion: response.results[0]?.report?.lighthouseVersion, browserVersion: response.results[0]?.report?.environment?.hostUserAgent,
        benchmarkIndex: response.results[0]?.report?.environment?.benchmarkIndex, workerLimits: invocation.limits } },
  };
} }; }
