import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BUILTIN_PROFILES = Object.freeze({
  desktop: Object.freeze({ name: 'desktop', browser: 'chromium', viewport: { width: 1440, height: 900 },
    colorScheme: 'light', reducedMotion: 'no-preference', locale: 'en-US', timezoneId: 'UTC', hasTouch: false, isMobile: false, deviceScaleFactor: 1 }),
  mobile: Object.freeze({ name: 'mobile', browser: 'chromium', viewport: { width: 390, height: 844 },
    colorScheme: 'light', reducedMotion: 'no-preference', locale: 'en-US', timezoneId: 'UTC', hasTouch: true, isMobile: true, deviceScaleFactor: 1 }),
});

function object(value, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code); return value; }
function inside(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\0')) throw new Error('AXE_PROFILE_FILE_DENIED');
  const candidate = path.resolve(root, relative); if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error('AXE_PROFILE_FILE_DENIED');
  let real; try { real = fs.realpathSync(candidate); } catch { throw new Error('AXE_PROFILE_FILE_DENIED'); }
  if (!real.startsWith(`${root}${path.sep}`) || !fs.statSync(real).isFile()) throw new Error('AXE_PROFILE_FILE_DENIED'); return real;
}
function endpoint(invocation, config) {
  if (invocation.inputs.some((input) => !['deployment', 'endpoint'].includes(input.name))) throw new Error('AXE_INPUT_UNKNOWN');
  if (config.url !== undefined && invocation.inputs.length) throw new Error('AXE_TARGET_AMBIGUOUS');
  if (typeof config.url === 'string') return new URL(config.url).origin;
  if (invocation.inputs.length !== 1 || invocation.inputs[0].kind !== 'value') throw new Error('AXE_TARGET_REQUIRED');
  const input = invocation.inputs[0]; const value = object(input.value, 'AXE_INPUT_INVALID');
  if (input.name === 'endpoint') {
    if (input.schemaId !== 'kubeclaw.public-endpoint-fixture@1' || value.schemaVersion !== 'public-endpoint-fixture.v1'
      || typeof value.url !== 'string') throw new Error('AXE_INPUT_INVALID'); return new URL(value.url).origin;
  }
  if (input.name !== 'deployment' || input.schemaId !== 'kubeclaw.kubernetes-deployment-fixture@1'
    || value.schemaVersion !== 'kubernetes-deployment-fixture.v1' || !Array.isArray(value.endpoints)) throw new Error('AXE_INPUT_INVALID');
  const selected = config.endpointName === undefined ? value.endpoints[0]
    : value.endpoints.find((item) => item?.name === config.endpointName);
  if (!selected || typeof selected.url !== 'string') throw new Error('AXE_ENDPOINT_NOT_FOUND'); return new URL(selected.url).origin;
}
function readProfiles(repository, config) {
  const profiles = { ...BUILTIN_PROFILES };
  if (config.profileFile !== undefined) {
    const bytes = fs.readFileSync(inside(repository, config.profileFile)); if (bytes.byteLength > 262144) throw new Error('AXE_PROFILE_FILE_TOO_LARGE');
    let document; try { document = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('AXE_PROFILE_FILE_INVALID'); }
    if (document?.schemaVersion !== 'kubeclaw.browser-profiles.v1') throw new Error('AXE_PROFILE_FILE_INVALID');
    const custom = object(document.profiles, 'AXE_PROFILE_FILE_INVALID');
    if (Object.keys(custom).length > 32) throw new Error('AXE_PROFILE_LIMIT_EXCEEDED');
    for (const [name, value] of Object.entries(custom)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(name)) throw new Error('AXE_PROFILE_INVALID');
      const profile = object(value, 'AXE_PROFILE_INVALID');
      const allowed = new Set(['browser', 'viewport', 'colorScheme', 'reducedMotion', 'locale', 'timezoneId', 'hasTouch', 'isMobile', 'deviceScaleFactor']);
      if (Object.keys(profile).some((field) => !allowed.has(field))) throw new Error('AXE_PROFILE_UNKNOWN_FIELD');
      const viewport = object(profile.viewport, 'AXE_PROFILE_INVALID');
      if (Object.keys(viewport).some((field) => !['width', 'height'].includes(field))) throw new Error('AXE_PROFILE_UNKNOWN_FIELD');
      profiles[name] = { ...profile, name };
    }
  }
  const selected = config.profiles ?? ['desktop', 'mobile'];
  return selected.map((name) => profiles[name] ?? (() => { throw new Error(`AXE_PROFILE_NOT_FOUND:${name}`); })());
}
function acceptanceFor(config, route, rule, selector) {
  const acceptance = (config.acceptances ?? []).find((item) => item.rule === rule && item.route === route && item.selector === selector);
  if (!acceptance) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(acceptance.expiresAt));
  if (!match) return null;
  const expiry = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999);
  const exact = new Date(expiry).toISOString().slice(0, 10) === acceptance.expiresAt;
  if (!exact || expiry < Date.now()) return null;
  return acceptance;
}
function severity(impact) { return impact === 'critical' ? 'critical' : impact === 'serious' ? 'high' : impact === 'moderate' ? 'medium' : impact === 'minor' ? 'low' : 'info'; }
function stable(value) { return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16); }

export function provider() { return { async execute(invocation, context) {
  const config = object(invocation.configuration.values, 'AXE_CONFIG_INVALID'); const workspace = fs.realpathSync(context.workspaceRoot);
  const repository = fs.realpathSync(path.resolve(workspace, invocation.workspace.repository));
  if (!repository.startsWith(`${workspace}${path.sep}`)) throw new Error('AXE_WORKSPACE_INVALID');
  const origin = endpoint(invocation, config); const profiles = readProfiles(repository, config);
  const combinations = config.routes.flatMap((route) => profiles.map((profile) => ({ route, profile })));
  const response = await context.invoke('browser.axe', { operation: 'scan', resource: { type: 'network.url', canonicalId: origin }, payload: {
    combinations, tags: config.tags ?? ['wcag2a', 'wcag2aa'], exclude: config.exclude ?? [], timeoutMs: config.timeoutMs ?? 30000,
  } });
  if (response.schemaVersion !== 'browser-axe-result.v1' || !Array.isArray(response.results)) throw new Error('AXE_CAPABILITY_RESULT_INVALID');
  const evidence = []; const findings = []; let violations = 0; let accepted = 0; let incomplete = 0; let passes = 0;
  for (const result of response.results) {
    const axe = object(result.axe, 'AXE_CAPABILITY_RESULT_INVALID'); const route = String(result.route); const profile = String(result.profile);
    passes += Array.isArray(axe.passes) ? axe.passes.length : 0; incomplete += Array.isArray(axe.incomplete) ? axe.incomplete.length : 0;
    for (const violation of Array.isArray(axe.violations) ? axe.violations : []) for (const node of Array.isArray(violation.nodes) ? violation.nodes : []) {
      violations += 1; const selector = String(node?.target?.[0] ?? '<unknown>'); const acceptedFinding = acceptanceFor(config, route, String(violation.id), selector);
      if (acceptedFinding) accepted += 1;
      const viewport = result.context?.viewport; const conditions = `${result.browser} ${viewport?.width ?? '?'}x${viewport?.height ?? '?'}`;
      findings.push({ id: `axe:${stable(`${route}\0${profile}\0${result.browser}\0${violation.id}\0${selector}`)}`,
        severity: severity(violation.impact), rule: String(violation.id),
        message: `${acceptedFinding ? `Accepted until ${acceptedFinding.expiresAt} (${acceptedFinding.reason}): ` : ''}${route} ${profile} ${conditions} ${selector}: ${String(violation.help)}` });
    }
    for (const item of Array.isArray(axe.incomplete) ? axe.incomplete : []) findings.push({
      id: `axe-incomplete:${stable(`${route}\0${profile}\0${item.id}`)}`, severity: 'info', rule: String(item.id),
      message: `Incomplete review: ${route} ${profile}: ${String(item.help)}`,
    });
    for (const [index, screenshot] of (Array.isArray(result.screenshots) ? result.screenshots : []).entries()) {
      const bytes = Buffer.from(String(screenshot.data), 'base64'); const file = `axe-${stable(`${route}\0${profile}\0${index}`)}.png`;
      fs.writeFileSync(path.join(workspace, invocation.workspace.evidence, file), bytes);
      evidence.push({ evidenceId: `axe-screenshot-${stable(file)}`, type: 'screenshot', file, mediaType: 'image/png' });
    }
  }
  const report = { ...response, results: response.results.map((result) => ({ ...result,
    screenshots: (Array.isArray(result.screenshots) ? result.screenshots : []).map((screenshot) => ({ selector: screenshot.selector })) })) };
  const reportFile = 'axe-results.json'; fs.writeFileSync(path.join(workspace, invocation.workspace.evidence, reportFile), `${JSON.stringify(report, null, 2)}\n`);
  evidence.unshift({ evidenceId: 'axe-results', type: 'test-report', file: reportFile, mediaType: 'application/vnd.kubeclaw.axe+json' });
  const unaccepted = violations - accepted; const outcome = unaccepted > 0 ? 'failed' : 'passed';
  return { schemaVersion: 'provider-result.v1', outcome,
    summary: `${response.results.length} browser combination(s); ${violations} violation node(s); ${accepted} accepted; ${incomplete} incomplete.`,
    counts: { total: passes + violations, passed: passes + accepted, failed: unaccepted, skipped: 0 }, findings, metrics: [
      { name: 'axe.violation_nodes', value: violations, unit: 'count' }, { name: 'axe.incomplete_rules', value: incomplete, unit: 'count' },
    ], evidenceFiles: evidence, reports: [], outputs: [], exitCode: null, signal: null,
    providerDetails: { schemaId: 'kubeclaw.axe-details.v1', schemaDigest: `sha256:${crypto.createHash('sha256').update('kubeclaw.axe-details.v1').digest('hex')}`,
      values: { combinations: response.results.map((item) => ({ route: item.route, profile: item.profile, browser: item.browser, browserVersion: item.browserVersion })), violations, accepted, incomplete } },
  };
} }; }
