import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const COMPARISON_PROFILES = Object.freeze({
  'strict-v1': Object.freeze({ maximumDifferencePercent: 0, pixelThreshold: 0.1, uncertaintyMarginPercent: 0 }),
  'balanced-v1': Object.freeze({ maximumDifferencePercent: 0.5, pixelThreshold: 0.1, uncertaintyMarginPercent: 0.25 }),
});
function object(value, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code); return value; }
function exact(value, fields, code) { if (Object.keys(value).some((field) => !fields.includes(field))) throw new Error(code); }
function number(value, minimum, maximum, code) { if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(code); return value; }
function fileInside(repository, relative, code) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\0')) throw new Error(code);
  const candidate = path.resolve(repository, relative); if (!candidate.startsWith(`${repository}${path.sep}`)) throw new Error(code);
  let real; try { real = fs.realpathSync(candidate); } catch { throw new Error(code); }
  if (!real.startsWith(`${repository}${path.sep}`) || !fs.statSync(real).isFile()) throw new Error(code); return real;
}
function jsonFile(repository, relative, code) {
  const file = fileInside(repository, relative, code); const bytes = fs.readFileSync(file);
  if (bytes.byteLength > 1024 * 1024) throw new Error(`${code}_TOO_LARGE`);
  try { return object(JSON.parse(bytes.toString('utf8')), code); } catch (error) { if (error?.message === code) throw error; throw new Error(code); }
}
function samePageConditions(actual, profile) {
  const expected = { colorScheme: profile.colorScheme ?? null, reducedMotion: profile.reducedMotion ?? null,
    locale: profile.locale ?? null, timezoneId: profile.timezoneId ?? null, deviceScaleFactor: profile.deviceScaleFactor ?? 1,
    hasTouch: profile.hasTouch ?? false, isMobile: profile.isMobile ?? false, fullPage: true };
  try { const value = object(actual, 'VISUAL_BASELINE_IDENTITY_MISMATCH'); exact(value, Object.keys(expected), 'VISUAL_BASELINE_IDENTITY_MISMATCH');
    return Object.entries(expected).every(([name, expectedValue]) => value[name] === expectedValue); } catch { return false; }
}
function origin(value, code) {
  let url; try { url = new URL(value); } catch { throw new Error(code); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/'
    || url.search || url.hash) throw new Error(code);
  return url.origin;
}
function base64(value, code) {
  if (typeof value !== 'string' || !value.length || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw new Error(code);
  const bytes = Buffer.from(value, 'base64'); if (bytes.toString('base64') !== value) throw new Error(code); return bytes;
}
function pngDimensions(bytes, maximumDecodedBytes, code) {
  if (bytes.byteLength < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(code);
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (!width || !height || width > 16384 || height > 16384 || width * height > Math.floor(maximumDecodedBytes / 4)) {
    throw new Error('VISUAL_BASELINE_DECODED_IMAGE_LIMIT_EXCEEDED');
  }
}
function endpoint(invocation, config) {
  if (invocation.inputs.some((input) => !['deployment', 'endpoint'].includes(input.name))) throw new Error('VISUAL_INPUT_UNKNOWN');
  if (config.url !== undefined && invocation.inputs.length) throw new Error('VISUAL_TARGET_AMBIGUOUS');
  if (typeof config.url === 'string') return origin(config.url, 'VISUAL_TARGET_INVALID');
  if (invocation.inputs.length !== 1 || invocation.inputs[0].kind !== 'value') throw new Error('VISUAL_TARGET_REQUIRED');
  const input = invocation.inputs[0]; const value = object(input.value, 'VISUAL_INPUT_INVALID');
  if (input.name === 'endpoint') {
    if (input.schemaId !== 'kubeclaw.public-endpoint-fixture@1' || value.schemaVersion !== 'public-endpoint-fixture.v1'
      || typeof value.url !== 'string') throw new Error('VISUAL_INPUT_INVALID'); return origin(value.url, 'VISUAL_INPUT_INVALID');
  }
  if (input.name !== 'deployment' || input.schemaId !== 'kubeclaw.kubernetes-deployment-fixture@1'
    || value.schemaVersion !== 'kubernetes-deployment-fixture.v1' || !Array.isArray(value.endpoints)) throw new Error('VISUAL_INPUT_INVALID');
  const selected = config.endpointName === undefined ? value.endpoints[0] : value.endpoints.find((item) => item?.name === config.endpointName);
  if (!selected || typeof selected.url !== 'string') throw new Error('VISUAL_ENDPOINT_NOT_FOUND'); return origin(selected.url, 'VISUAL_INPUT_INVALID');
}
function profiles(repository, relative) {
  const document = jsonFile(repository, relative, 'VISUAL_PROFILE_FILE_INVALID');
  if (document.schemaVersion !== 'kubeclaw.browser-profiles.v1') throw new Error('VISUAL_PROFILE_FILE_INVALID');
  exact(document, ['schemaVersion', 'profiles'], 'VISUAL_PROFILE_FILE_INVALID'); const values = object(document.profiles, 'VISUAL_PROFILE_FILE_INVALID');
  if (!Object.keys(values).length || Object.keys(values).length > 32) throw new Error('VISUAL_PROFILE_FILE_INVALID');
  const result = {};
  for (const [name, raw] of Object.entries(values)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(name)) throw new Error('VISUAL_PROFILE_INVALID');
    const value = object(raw, 'VISUAL_PROFILE_INVALID'); exact(value, ['browser', 'viewport', 'colorScheme', 'reducedMotion', 'locale', 'timezoneId', 'hasTouch', 'isMobile', 'deviceScaleFactor'], 'VISUAL_PROFILE_INVALID');
    const viewport = object(value.viewport, 'VISUAL_PROFILE_INVALID'); exact(viewport, ['width', 'height'], 'VISUAL_PROFILE_INVALID');
    if (!['chromium', 'firefox', 'webkit'].includes(value.browser) || !Number.isSafeInteger(viewport.width) || viewport.width < 240 || viewport.width > 3840
      || !Number.isSafeInteger(viewport.height) || viewport.height < 240 || viewport.height > 2160) throw new Error('VISUAL_PROFILE_INVALID');
    result[name] = { ...value, name };
  }
  return result;
}
function manifest(repository, relative, profileMap, limits) {
  const document = jsonFile(repository, relative, 'VISUAL_MANIFEST_INVALID');
  if (document.schemaVersion !== 'kubeclaw.visual-baselines.v1') throw new Error('VISUAL_MANIFEST_INVALID');
  exact(document, ['schemaVersion', 'baselineBundleDigest', 'entries'], 'VISUAL_MANIFEST_INVALID');
  if (!Array.isArray(document.entries) || !document.entries.length || document.entries.length > 128) throw new Error('VISUAL_MANIFEST_INVALID');
  const ids = new Set(); const entries = new Map();
  for (const raw of document.entries) {
    const entry = object(raw, 'VISUAL_MANIFEST_INVALID'); exact(entry, ['id', 'route', 'profile', 'baselineFile', 'sha256', 'browser', 'viewport', 'pageConditions'], 'VISUAL_MANIFEST_INVALID');
    if (typeof entry.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(entry.id) || ids.has(entry.id)
      || typeof entry.route !== 'string' || entry.route.length > 1024 || !entry.route.startsWith('/') || entry.route.startsWith('//') || /[?#\r\n]/u.test(entry.route)
      || typeof entry.profile !== 'string' || !profileMap[entry.profile] || typeof entry.baselineFile !== 'string'
      || typeof entry.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(entry.sha256)) throw new Error('VISUAL_MANIFEST_INVALID');
    const profile = profileMap[entry.profile]; const viewport = object(entry.viewport, 'VISUAL_MANIFEST_INVALID');
    if (entry.browser !== profile.browser || viewport.width !== profile.viewport.width || viewport.height !== profile.viewport.height
      || !samePageConditions(entry.pageConditions, profile)) {
      throw new Error('VISUAL_BASELINE_IDENTITY_MISMATCH');
    }
    const baseline = fileInside(repository, entry.baselineFile, 'VISUAL_BASELINE_FILE_DENIED');
    const stat = fs.statSync(baseline); const maximumBytes = Math.min(64 * 1024 * 1024, limits.artifactBytes);
    if (stat.size <= 0 || stat.size > maximumBytes) throw new Error('VISUAL_BASELINE_BYTES_EXCEEDED');
    const bytes = fs.readFileSync(baseline); pngDimensions(bytes, limits.memoryBytes, 'VISUAL_BASELINE_PNG_INVALID');
    const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    if (digest !== entry.sha256) throw new Error('VISUAL_BASELINE_DIGEST_MISMATCH');
    ids.add(entry.id); entries.set(entry.id, { ...entry, baseline, profile });
  }
  const bundleDigest = `sha256:${crypto.createHash('sha256').update([...entries.values()].map((entry) => entry.sha256).sort().join('\n')).digest('hex')}`;
  if (document.baselineBundleDigest !== undefined && document.baselineBundleDigest !== bundleDigest) throw new Error('VISUAL_BASELINE_BUNDLE_DIGEST_MISMATCH');
  return { entries, baselineBundleDigest: bundleDigest,
    manifestDigest: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(fileInside(repository, relative, 'VISUAL_MANIFEST_INVALID'))).digest('hex')}` };
}
function comparison(config) {
  const name = config.comparisonProfile ?? 'strict-v1'; const base = COMPARISON_PROFILES[name];
  if (!base) throw new Error('VISUAL_COMPARISON_PROFILE_INVALID'); const overrides = config.overrides ?? {};
  exact(overrides, ['maximumDifferencePercent', 'pixelThreshold', 'uncertaintyMarginPercent'], 'VISUAL_COMPARISON_OVERRIDE_INVALID');
  const resolved = {
    maximumDifferencePercent: overrides.maximumDifferencePercent ?? base.maximumDifferencePercent,
    pixelThreshold: overrides.pixelThreshold ?? base.pixelThreshold,
    uncertaintyMarginPercent: overrides.uncertaintyMarginPercent ?? base.uncertaintyMarginPercent,
  };
  number(resolved.maximumDifferencePercent, 0, 100, 'VISUAL_COMPARISON_OVERRIDE_INVALID');
  number(resolved.pixelThreshold, 0, 1, 'VISUAL_COMPARISON_OVERRIDE_INVALID');
  number(resolved.uncertaintyMarginPercent, 0, 100, 'VISUAL_COMPARISON_OVERRIDE_INVALID');
  return { name, ...resolved };
}
function stable(value) { return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16); }

export function provider() { return { async execute(invocation, context) {
  const config = object(invocation.configuration.values, 'VISUAL_CONFIG_INVALID'); const workspace = fs.realpathSync(context.workspaceRoot);
  const repository = fs.realpathSync(path.resolve(workspace, invocation.workspace.repository));
  if (!repository.startsWith(`${workspace}${path.sep}`)) throw new Error('VISUAL_WORKSPACE_INVALID');
  const profileMap = profiles(repository, config.profileFile); const baselineManifest = manifest(repository, config.manifestFile, profileMap, invocation.limits);
  if (!Array.isArray(config.targets) || !config.targets.length || config.targets.length > 64 || new Set(config.targets).size !== config.targets.length) throw new Error('VISUAL_TARGETS_INVALID');
  if ((config.targets.length * 3) + 1 > invocation.limits.artifactFiles) throw new Error('VISUAL_EVIDENCE_FILE_LIMIT_EXCEEDED');
  const selected = config.targets.map((id) => baselineManifest.entries.get(id) ?? (() => { throw new Error(`VISUAL_TARGET_NOT_FOUND:${id}`); })());
  const masks = new Map(); for (const raw of config.masks ?? []) {
    const value = object(raw, 'VISUAL_MASK_INVALID'); if (!config.targets.includes(value.target) || !Array.isArray(value.selectors)) throw new Error('VISUAL_MASK_INVALID');
    if (masks.has(value.target)) throw new Error('VISUAL_MASK_INVALID'); masks.set(value.target, value.selectors);
  }
  const targetOrigin = endpoint(invocation, config); const policy = comparison(config);
  const response = await context.invoke('browser.visual', { operation: 'capture', resource: { type: 'network.url', canonicalId: targetOrigin }, payload: {
    combinations: selected.map((entry) => ({ id: entry.id, route: entry.route, profile: entry.profile, masks: masks.get(entry.id) ?? [] })),
    timeoutMs: config.timeoutMs ?? 30000,
  } });
  if (response.schemaVersion !== 'browser-visual-result.v1' || !Array.isArray(response.results)
    || response.results.length !== selected.length) throw new Error('VISUAL_CAPABILITY_RESULT_INVALID');
  const evidenceFiles = []; const pendingEvidence = []; const findings = []; const results = []; let failed = 0;
  for (const entry of selected) {
    const current = response.results.find((item) => item.id === entry.id);
    if (!current || current.route !== entry.route || current.profile !== entry.profile.name || current.browser !== entry.profile.browser
      || current.viewport?.width !== entry.viewport.width || current.viewport?.height !== entry.viewport.height
      || !samePageConditions(current.pageConditions, entry.profile)
      || JSON.stringify(current.masks) !== JSON.stringify(masks.get(entry.id) ?? [])) throw new Error('VISUAL_CAPABILITY_RESULT_INVALID');
    const actualBytes = base64(current.data, 'VISUAL_CAPABILITY_RESULT_INVALID');
    if (`sha256:${crypto.createHash('sha256').update(actualBytes).digest('hex')}` !== current.sha256) throw new Error('VISUAL_CAPABILITY_RESULT_INVALID');
    const baselineBytes = fs.readFileSync(entry.baseline); const compared = await context.invoke('browser.visual', {
      operation: 'compare', resource: { type: 'visual.comparison', canonicalId: 'pixelmatch-v1' },
      payload: { baseline: baselineBytes.toString('base64'), current: current.data, pixelThreshold: policy.pixelThreshold } });
    if (compared.schemaVersion !== 'browser-visual-comparison.v1' || !Number.isSafeInteger(compared.width)
      || !Number.isSafeInteger(compared.height) || !Number.isSafeInteger(compared.diffCount)
      || typeof compared.diffPercent !== 'number' || !Number.isFinite(compared.diffPercent) || typeof compared.difference !== 'string') throw new Error('VISUAL_CAPABILITY_RESULT_INVALID');
    const result = { width: compared.width, height: compared.height, diffCount: compared.diffCount,
      diffPercent: compared.diffPercent, diff: base64(compared.difference, 'VISUAL_CAPABILITY_RESULT_INVALID') };
    const uncertain = result.diffPercent > policy.maximumDifferencePercent
      && result.diffPercent <= policy.maximumDifferencePercent + policy.uncertaintyMarginPercent;
    const passed = result.diffPercent <= policy.maximumDifferencePercent; if (!passed) failed += 1;
    const prefix = `visual-${stable(entry.id)}`; const files = [
      [`${prefix}-baseline.png`, baselineBytes, 'visual-baseline'], [`${prefix}-current.png`, actualBytes, 'visual-current'],
      [`${prefix}-difference.png`, result.diff, 'visual-difference'],
    ];
    for (const [file, bytes, type] of files) { pendingEvidence.push({ file, bytes }); evidenceFiles.push({ evidenceId: file.slice(0, -4), type, file, mediaType: 'image/png' }); }
    if (!passed) findings.push({ id: `visual:${stable(`${entry.id}\0${result.diffPercent}`)}`, severity: uncertain ? 'medium' : 'high', rule: uncertain ? 'visual-difference-uncertain' : 'visual-difference',
      message: `${entry.id}: ${result.diffPercent.toFixed(4)}% differs from maximum ${policy.maximumDifferencePercent}%${uncertain ? '; explicit agent review is not configured, so the result fails safely' : ''}` });
    results.push({ id: entry.id, route: entry.route, profile: entry.profile.name, browser: current.browser, browserVersion: current.browserVersion,
      baselineDigest: entry.sha256, currentDigest: current.sha256, masks: current.masks, width: result.width, height: result.height,
      diffCount: result.diffCount, diffPercent: result.diffPercent, status: passed ? 'passed' : uncertain ? 'uncertain' : 'failed' });
  }
  const report = { schemaVersion: 'kubeclaw.visual-report.v1', manifestDigest: baselineManifest.manifestDigest,
    baselineBundleDigest: baselineManifest.baselineBundleDigest, comparison: policy, results };
  const reportFile = 'visual-results.json'; const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  pendingEvidence.push({ file: reportFile, bytes: reportBytes });
  if (pendingEvidence.reduce((total, item) => total + item.bytes.byteLength, 0) > invocation.limits.artifactBytes) {
    throw new Error('VISUAL_EVIDENCE_BYTES_EXCEEDED');
  }
  for (const item of pendingEvidence) fs.writeFileSync(path.join(workspace, invocation.workspace.evidence, item.file), item.bytes);
  evidenceFiles.push({ evidenceId: 'visual-results', type: 'test-report', file: reportFile, mediaType: 'application/vnd.kubeclaw.visual+json' });
  return { schemaVersion: 'provider-result.v1', outcome: failed ? 'failed' : 'passed',
    summary: `${results.length} visual target(s); ${failed} failed comparison(s).`, counts: { total: results.length, passed: results.length - failed, failed, skipped: 0 },
    findings, metrics: results.map((item) => ({ name: `visual.${item.id}.difference`, value: item.diffPercent, unit: 'percent' })),
    evidenceFiles, reports: [], outputs: [], exitCode: null, signal: null,
    providerDetails: { schemaId: 'kubeclaw.visual-details.v1', schemaDigest: `sha256:${crypto.createHash('sha256').update('kubeclaw.visual-details.v1').digest('hex')}`,
      values: { manifestDigest: baselineManifest.manifestDigest, baselineBundleDigest: baselineManifest.baselineBundleDigest,
        comparison: policy, results, workerLimits: invocation.limits } },
  };
} }; }
