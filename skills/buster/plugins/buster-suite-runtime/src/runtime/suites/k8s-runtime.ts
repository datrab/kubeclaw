import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildSubprocessEnv } from '../security.ts';
import type { K8sCommandEnv } from './k8s-command-env.ts';
import {
  errorMessage, errorOutput, execFileAsync, isSuccessfulHttpStatus, parseKubectlJson,
  renderManifestForK8sSuiteWithStats, trimOut,
} from './k8s-base.ts';
import type { AnyRecord, SuiteLog } from './k8s-base.ts';

export async function applyManifests(manifestPaths: string[], imageName: string, registryTag: string, targetNs: string, timeoutMs: number, log: SuiteLog, env: K8sCommandEnv): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8s-suite-'));
  log(`Applying ${manifestPaths.length} manifest(s) to ${targetNs}`);
  log(`Overriding image "${imageName}" → "${registryTag}"`);
  try {
    let rendered = 0;
    let imageRewrites = 0;
    for (const manifestPath of manifestPaths) {
      if (!fs.existsSync(manifestPath)) throw new Error(`Requested manifest not found: ${manifestPath}`);
      const overridden = renderManifestForK8sSuiteWithStats(fs.readFileSync(manifestPath, 'utf8'), imageName, registryTag, targetNs, log);
      imageRewrites += overridden.imageRewrites;
      fs.writeFileSync(path.join(tmpDir, `${rendered}-${path.basename(manifestPath)}`), overridden.content);
      rendered++;
    }
    if (imageRewrites === 0) {
      throw new Error(`No Kubernetes workload image matched k8s.image_name "${imageName}"; refusing to apply manifests without using ${registryTag}`);
    }
    log(`Image overrides applied: ${imageRewrites}`);
    const { stdout } = await execFileAsync('kubectl', ['apply', '-n', targetNs, '-f', tmpDir], { timeout: timeoutMs, encoding: 'utf8', env });
    log(`Applied:\n${stdout.trim()}`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); }
    catch (error) { log(`non-blocking manifest temp cleanup failed: ${errorMessage(error)}`); }
  }
}

async function listPodNames(ns: string, env: K8sCommandEnv): Promise<string[]> {
  const { stdout } = await execFileAsync('kubectl', ['get', 'pods', '-n', ns, '-o', 'json'], { timeout: 10000, encoding: 'utf8', env });
  const parsed = parseKubectlJson(stdout, 'kubectl get pods');
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return items
    .map((item: AnyRecord) => item?.metadata?.name)
    .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);
}

export async function waitForPods(ns: string, timeoutSeconds: number, log: SuiteLog, env: K8sCommandEnv): Promise<void> {
  log(`Waiting for pods in ${ns} (max ${timeoutSeconds}s)…`);
  const deadline = Date.now() + Math.max(1, timeoutSeconds) * 1000;
  let lastError: unknown = null;
  let observedPods = false;
  let readinessAttempt = 0;

  while (Date.now() < deadline) {
    const remainingSeconds = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
    let podNames: string[] = [];
    try {
      podNames = await listPodNames(ns, env);
    } catch (error) {
      lastError = error;
      log(`Pod discovery failed: ${trimOut(errorOutput(error), 300)}`);
    }

    if (podNames.length === 0) {
      log(`No pods visible in ${ns} yet; retrying`);
      await sleepMs(Math.min(2000, Math.max(250, deadline - Date.now())));
      continue;
    }

    observedPods = true;
    const waitSeconds = Math.max(1, Math.min(remainingSeconds, 30));
    readinessAttempt += 1;
    log(`Pod readiness attempt ${readinessAttempt}: waiting for ${podNames.length} pod(s): ${podNames.join(', ')}`);
    try {
      await execFileAsync('kubectl', ['wait', '--for=condition=Ready', 'pod', '--all', '-n', ns, `--timeout=${waitSeconds}s`], { timeout: (waitSeconds + 10) * 1000, encoding: 'utf8', env });
      if (readinessAttempt > 1) log(`Pod readiness settled after ${readinessAttempt} attempt(s)`);
      return;
    } catch (error) {
      lastError = error;
      log(`Pod readiness pending after attempt ${readinessAttempt}; retrying until timeout: ${trimOut(errorOutput(error), 300)}`);
      if (Date.now() < deadline) await sleepMs(Math.min(2000, Math.max(250, deadline - Date.now())));
    }
  }

  const reason = observedPods
    ? `pod readiness did not settle before timeout: ${trimOut(errorOutput(lastError), 500)}`
    : `no pods became visible before timeout: ${trimOut(errorOutput(lastError), 500)}`;
  throw new Error(reason);
}

export async function getPodStatus(ns: string, env: K8sCommandEnv): Promise<string> {
  try {
    const { stdout } = await execFileAsync('kubectl', ['get', 'pods', '-n', ns, '-o', 'wide'], { timeout: 10000, encoding: 'utf8', env });
    return stdout.trim().split('\n').slice(0, 10).join('\n');
  } catch (_error) {
    return '(could not retrieve pod status)';
  }
}

async function httpHealthCheck(url: string, log: SuiteLog): Promise<number> {
  log(`Health check: ${url}`);
  const { stdout } = await execFileAsync('curl', ['-sS', '--connect-timeout', '10', '--max-time', '30', '-o', '/dev/null', '-w', '%{http_code}', url], { timeout: 45000, encoding: 'utf8', env: buildSubprocessEnv() });
  const code = parseInt(stdout.trim(), 10);
  log(`Health check: HTTP ${code}`);
  return code;
}

export function shouldUsePortForwardHealthCheck({ purpose, previewExposureProvider }: { purpose: string; previewExposureProvider: string }): boolean {
  return !(purpose === 'final-preview' && previewExposureProvider === 'tailscale-ingress');
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryHttpHealthCheck(url: string, log: SuiteLog, retries: number, baseDelayMs: number): Promise<number> {
  let lastError: unknown = null;
  const attempts = Math.max(1, Math.floor(retries));
  const delayMs = Math.max(0, Math.floor(baseDelayMs));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const code = await httpHealthCheck(url, log);
      if (code >= 200 && code < 400) return code;
      lastError = new Error(`HTTP ${code} (expected 2xx/3xx)`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      log(`Health check attempt ${attempt}/${attempts} not ready: ${trimOut(errorOutput(lastError), 300)}; retrying in ${delayMs}ms`);
      if (delayMs > 0) await sleepMs(delayMs);
    }
  }

  const failureDetail = trimOut(errorOutput(lastError), 300);
  throw new Error(failureDetail ? failureDetail : 'health_check_failed_without_detail');
}

async function httpTextCheck(url: string, expectedText: string | null, log: SuiteLog): Promise<{ body: string; statusCode: number }> {
  log(`Internal service check: ${url}`);
  const { stdout } = await execFileAsync('curl', ['-sS', '-L', '--connect-timeout', '10', '--max-time', '30', '-w', '\n%{http_code}', url], {
    timeout: 45000,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    env: buildSubprocessEnv(),
  });
  const newline = stdout.lastIndexOf('\n');
  const body = newline >= 0 ? stdout.slice(0, newline) : stdout;
  const statusCode = parseInt((newline >= 0 ? stdout.slice(newline + 1) : '').trim(), 10);
  if (!isSuccessfulHttpStatus(statusCode)) {
    throw new Error(`HTTP ${Number.isInteger(statusCode) ? statusCode : 'missing_http_status'} (expected 2xx/3xx)`);
  }
  if (expectedText && !body.includes(expectedText)) {
    throw new Error(`Internal service did not serve expected text "${expectedText}"`);
  }
  log(`Internal service check: HTTP ${statusCode}, ${body.length} byte(s)${expectedText ? ` containing "${expectedText}"` : ''}`);
  return { body, statusCode };
}

export async function retryHttpTextCheck(url: string, expectedText: string | null, log: SuiteLog, retries: number, baseDelayMs: number): Promise<{ body: string; statusCode: number }> {
  let lastError: unknown = null;
  const attempts = Math.max(1, Math.floor(retries));
  const delayMs = Math.max(0, Math.floor(baseDelayMs));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await httpTextCheck(url, expectedText, log);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      log(`Internal service check attempt ${attempt}/${attempts} not ready: ${trimOut(errorOutput(lastError), 300)}; retrying in ${delayMs}ms`);
      if (delayMs > 0) await sleepMs(delayMs);
    }
  }

  const failureDetail = trimOut(errorOutput(lastError), 300);
  throw new Error(failureDetail ? failureDetail : 'internal_service_check_failed_without_detail');
}
