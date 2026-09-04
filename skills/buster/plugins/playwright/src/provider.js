import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const STABLE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
function object(value, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code); return value; }
function relative(value, code) { if (typeof value !== 'string' || !value || value.length > 1024 || value.includes('\0') || path.isAbsolute(value) || value.split(/[\\/]/u).some((part) => part === '..' || part === '')) throw new Error(code); return value; }
function inside(root, value, code, mustExist = true) { const candidate = path.resolve(root, value); if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error(code); if (!mustExist) return candidate; let real; try { real = fs.realpathSync(candidate); } catch { throw new Error(code); } if (real !== root && !real.startsWith(`${root}${path.sep}`)) throw new Error(code); return real; }
function origin(value, code) { let url; try { url = new URL(value); } catch { throw new Error(code); } if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(code); return url.origin; }
function endpoint(invocation, config) {
  if (invocation.inputs.some((input) => !['deployment', 'endpoint'].includes(input.name))) throw new Error('PLAYWRIGHT_INPUT_UNKNOWN');
  if (config.url !== undefined && invocation.inputs.length) throw new Error('PLAYWRIGHT_TARGET_AMBIGUOUS');
  if (typeof config.url === 'string') return origin(config.url, 'PLAYWRIGHT_TARGET_INVALID');
  if (invocation.inputs.length !== 1 || invocation.inputs[0].kind !== 'value') throw new Error('PLAYWRIGHT_TARGET_REQUIRED');
  const input = invocation.inputs[0]; const value = object(input.value, 'PLAYWRIGHT_INPUT_INVALID');
  if (input.name === 'endpoint') { if (input.schemaId !== 'kubeclaw.public-endpoint-fixture@1' || value.schemaVersion !== 'public-endpoint-fixture.v1' || typeof value.url !== 'string') throw new Error('PLAYWRIGHT_INPUT_INVALID'); return origin(value.url, 'PLAYWRIGHT_INPUT_INVALID'); }
  if (input.name !== 'deployment' || input.schemaId !== 'kubeclaw.kubernetes-deployment-fixture@1' || value.schemaVersion !== 'kubernetes-deployment-fixture.v1' || !Array.isArray(value.endpoints)) throw new Error('PLAYWRIGHT_INPUT_INVALID');
  const selected = config.endpointName === undefined ? value.endpoints[0] : value.endpoints.find((item) => item?.name === config.endpointName);
  if (!selected || typeof selected.url !== 'string') throw new Error('PLAYWRIGHT_ENDPOINT_NOT_FOUND'); return origin(selected.url, 'PLAYWRIGHT_INPUT_INVALID');
}
function allTests(report) { const result = []; const visit = (suite, titles = []) => { const next = suite.title ? [...titles, suite.title] : titles; for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) result.push({ title: [...next, spec.title, test.projectName].filter(Boolean).join(' > '), spec, test }); for (const child of suite.suites ?? []) visit(child, next); }; for (const suite of report.suites ?? []) visit(suite); return result; }
function attachmentType(name, contentType) { const lower = String(name).toLowerCase(); if (contentType === 'image/png' || lower.includes('screenshot')) return 'screenshot'; if (contentType === 'application/zip' && lower.includes('trace')) return 'trace'; if (String(contentType).startsWith('video/') || lower.includes('video')) return 'video'; return 'test-artifact'; }
function safeExtension(contentType) { return contentType === 'image/png' ? '.png' : contentType === 'application/zip' ? '.zip' : contentType === 'video/webm' ? '.webm' : '.bin'; }
function copyAttachment(evidence, raw, index, budget) {
  if (!raw || typeof raw !== 'object' || typeof raw.data !== 'string') return null;
  if (raw.data.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(raw.data)) throw new Error('PLAYWRIGHT_ARTIFACT_INVALID');
  const bytes = Buffer.from(raw.data, 'base64'); if (bytes.toString('base64') !== raw.data || bytes.byteLength > budget.bytes) throw new Error('PLAYWRIGHT_ARTIFACT_BYTES_EXCEEDED');
  const type = attachmentType(raw.name, raw.contentType); const file = `playwright-${type}-${index}${safeExtension(raw.contentType)}`; const target = inside(evidence, file, 'PLAYWRIGHT_EVIDENCE_PATH_INVALID', false);
  fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 }); budget.bytes -= bytes.byteLength; budget.files -= 1;
  return { evidenceId: file.replace(/\.[^.]+$/u, ''), type, file, mediaType: typeof raw.contentType === 'string' ? raw.contentType : 'application/octet-stream' };
}
function finding(id, title, message) { return { id: `playwright:${crypto.createHash('sha256').update(`${id}\0${title}\0${message}`).digest('hex').slice(0, 16)}`, severity: 'high', rule: 'playwright-test', message: `${title}: ${message}`.slice(0, 2048) }; }

export function provider() { return { async execute(invocation, context) {
  const config = object(invocation.configuration.values, 'PLAYWRIGHT_CONFIG_INVALID'); const workspace = fs.realpathSync(context.workspaceRoot);
  const repository = inside(workspace, invocation.workspace.repository, 'PLAYWRIGHT_WORKSPACE_INVALID'); const evidence = inside(workspace, invocation.workspace.evidence, 'PLAYWRIGHT_WORKSPACE_INVALID');
  const projectDirectory = inside(repository, relative(config.projectDirectory, 'PLAYWRIGHT_PROJECT_DIRECTORY_INVALID'), 'PLAYWRIGHT_PROJECT_DIRECTORY_INVALID');
  const configFile = inside(projectDirectory, relative(config.configFile, 'PLAYWRIGHT_CONFIG_FILE_INVALID'), 'PLAYWRIGHT_CONFIG_FILE_INVALID');
  if (!fs.statSync(configFile).isFile()) throw new Error('PLAYWRIGHT_CONFIG_FILE_INVALID'); const target = endpoint(invocation, config);
  const workers = Math.max(1, Math.min(Number.isSafeInteger(config.workers) ? config.workers : 4, Math.max(1, invocation.limits.processes - 4)));
  const command = await context.invoke('browser.playwright', { operation: 'run', resource: { type: 'network.url', canonicalId: target }, payload: {
    repository: path.relative(workspace, repository), projectDirectory: path.relative(repository, projectDirectory), configFile: path.relative(projectDirectory, configFile), workers,
    timeoutMs: Math.min(config.timeoutMs ?? invocation.timeoutMs, invocation.timeoutMs), limits: {
      maximumProcesses: invocation.limits.processes, maximumMemoryBytes: invocation.limits.memoryBytes,
      maximumCpuMillis: invocation.limits.cpuMillis, maximumOutputBytes: invocation.limits.logBytes,
      maximumResultBytes: Math.min(Number.MAX_SAFE_INTEGER, invocation.limits.artifactBytes * 2 + invocation.limits.logBytes),
      maximumArtifactBytes: invocation.limits.artifactBytes, maximumArtifactFiles: invocation.limits.artifactFiles } } });
  if (command.schemaVersion !== 'browser-playwright-result.v1' || command.targetOrigin !== target || !Number.isSafeInteger(command.workers) || command.workers < 1 || command.workers > workers || !Array.isArray(command.artifacts) || !['cgroup-v2', 'sampled'].includes(command.resources?.enforcement)) throw new Error('PLAYWRIGHT_CAPABILITY_RESULT_INVALID');
  try {
    const stdout = typeof command.stdout === 'string' ? command.stdout : ''; const stderr = typeof command.stderr === 'string' ? command.stderr : '';
    if (stdout) context.log('stdout', stdout); if (stderr) context.log('stderr', stderr);
    const report = object(command.report, 'PLAYWRIGHT_REPORT_INVALID'); const reportBytes = Buffer.from(`${JSON.stringify(report)}\n`); if (!reportBytes.length || reportBytes.byteLength > invocation.limits.artifactBytes) throw new Error('PLAYWRIGHT_REPORT_BYTES_EXCEEDED');
    if (!Array.isArray(report.suites) || !report.stats || typeof report.stats !== 'object') throw new Error('PLAYWRIGHT_REPORT_INVALID');
    const tests = allTests(report); if (!tests.length) throw new Error('PLAYWRIGHT_ZERO_TESTS');
    let passed = 0; let failed = 0; let skipped = 0; let unexecuted = 0; const findings = []; const testCases = [];
    for (const [testIndex, entry] of tests.entries()) {
      const results = Array.isArray(entry.test.results) ? entry.test.results : []; const status = entry.test.status;
      if (status === 'unexpected') { failed += 1; const last = results.at(-1); findings.push(finding(String(testIndex), entry.title, last?.error?.message ?? last?.error?.value ?? 'Test failed after retries.')); }
      else if (status === 'skipped') skipped += 1; else if (!results.length) unexecuted += 1; else passed += 1;
      const project = typeof entry.test.projectName === 'string' && entry.test.projectName ? entry.test.projectName : null;
      const caseStatus = status === 'unexpected' ? 'failed' : status === 'skipped' ? 'skipped' : results.length ? 'passed' : 'unexecuted';
      testCases.push({ id: `sha256:${crypto.createHash('sha256').update(`${testIndex}\0${entry.title}\0${project ?? ''}`).digest('hex')}`,
        title: entry.title, project, browser: project, status: caseStatus, attempts: results.length,
        errors: results.flatMap((result) => typeof result?.error?.message === 'string' ? [result.error.message.slice(0, 4096)] : []) });
    }
    if (command.artifacts.length + 1 > invocation.limits.artifactFiles) throw new Error('PLAYWRIGHT_ARTIFACT_FILE_LIMIT_EXCEEDED');
    if (command.exitCode !== 0 && failed === 0) throw new Error('PLAYWRIGHT_EXECUTION_FAILED');
    const budget = { bytes: invocation.limits.artifactBytes - reportBytes.byteLength, files: invocation.limits.artifactFiles - 1 }; const evidenceFiles = [];
    for (const [index, attachment] of command.artifacts.entries()) { const copied = copyAttachment(evidence, attachment, index + 1, budget); if (copied) evidenceFiles.push(copied); }
    const reportFile = 'playwright-report.json'; fs.writeFileSync(path.join(evidence, reportFile), reportBytes, { flag: 'wx', mode: 0o600 }); evidenceFiles.push({ evidenceId: 'playwright-report', type: 'test-report', file: reportFile, mediaType: 'application/vnd.kubeclaw.playwright+json' });
    const total = passed + failed + skipped + unexecuted; const outcome = failed > 0 ? 'failed' : 'passed';
    return { schemaVersion: 'provider-result.v1', outcome, summary: `${total} Playwright test(s): ${passed} passed, ${failed} failed, ${skipped} skipped, ${unexecuted} unexecuted.`, counts: { total, passed, failed, skipped: skipped + unexecuted }, findings, metrics: [], evidenceFiles, reports: [], outputs: [], exitCode: Number.isSafeInteger(command.exitCode) ? command.exitCode : null, signal: typeof command.signal === 'string' ? command.signal : null,
      providerDetails: { schemaId: 'kubeclaw.e2e-result.v1', schemaDigest: 'sha256:fec4bcd487eb09590dee3c6d6228d6088963c5476747c8731db4d3a53a114637', values: {
        schemaVersion: 'e2e-result.v1', provider: 'playwright', targetOrigin: target, workers: command.workers,
        browserProjects: [...new Set(tests.map((entry) => entry.test.projectName).filter(Boolean))], testCases,
        counts: { total, passed, failed, skipped, unexecuted }, reportFormat: 'playwright-json', resourceEnforcement: command.resources.enforcement } } };
  } finally { /* Capability owns and removes its temporary execution overlay. */ }
} }; }
