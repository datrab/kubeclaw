// ═══════════════════════════════════════════════════════════════
// Suite: k8s — Production Dockerfile Build + K8s Deploy
// ═══════════════════════════════════════════════════════════════
//
// Builds the production Dockerfile via Podman, pushes to the
// cluster-local registry (registry-local:5001), deploys to an
// ephemeral K8s test namespace, waits for pods to be ready, and
// health-checks the live service.
//
// By the time the LLM buster subagent starts, a real production-
// equivalent service is already running. The service URL is in
// the verdict metadata so the subagent can test against it directly.
//
// Config (from payload.test_config.k8s):
//   dockerfile              - Path relative to git repo root (required)
//   build_context           - Build context dir (default: dirname of dockerfile)
//   image_name              - Image name without registry/tag (required)
//   service_name            - K8s Service name defined in manifests (required)
//   port                    - Service port (default: 3000)
//   health_path             - HTTP health check path (default: /health)
//   manifests               - Array of manifest paths relative to repo root (required)
//   ready_timeout_seconds   - Wait time for pods (default: 120)
//   secrets_to_copy         - Secret names to copy from kubeclaw ns (default: [])
//   namespace_prefix        - Must be "buster" or "test" — VAP-enforced (default: buster)
//   build_timeout_seconds   - Podman build timeout (default: 300)
//   push_timeout_seconds    - Registry push timeout (default: 120)
//   deploy_timeout_seconds  - kubectl apply timeout (default: 30)
//
// Writes /sandbox/k8s-test-namespace so the orchestrator can
// delete the namespace during sandbox cleanup.

import { exec }    from 'child_process';
import { promisify } from 'util';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { createSuiteVerdict, createFinding, STATUS, SEVERITY } from '../verdict-schema.js';
import { emitEvent } from '../services/telemetry.js';
import { getRepoRoot } from '../services/git.js';

const execAsync = promisify(exec);

// ── Constants ────────────────────────────────────────────────────

const REGISTRY_LOCAL = 'registry-local.kubeclaw.svc.cluster.local:5001';
const KUBECLAW_NS    = 'kubeclaw';
const K8S_NS_FILE    = '/sandbox/k8s-test-namespace';

const DEFAULTS = {
  port:                   3000,
  health_path:            '/health',
  namespace_prefix:       'buster',
  ready_timeout_seconds:  120,
  build_timeout_seconds:  300,
  push_timeout_seconds:   120,
  deploy_timeout_seconds: 30,
};

// ── Helpers ──────────────────────────────────────────────────────

function resolveRepoPath(p, repoRoot) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(repoRoot, p);
}

function shortId() {
  return Math.random().toString(36).slice(2, 8);
}

function trimOut(str, max = 800) {
  const s = String(str || '').trim();
  return s.length <= max ? s : s.slice(0, max) + `…[${s.length - max} chars]`;
}

function makeCheck(name, passed, detail) {
  return { name, passed, detail: detail || '' };
}

// ── Podman Build ─────────────────────────────────────────────────

async function buildImage(dockerfile, buildContext, tag, timeoutMs, log) {
  log(`Building: ${tag}`);
  log(`  Dockerfile: ${dockerfile}`);
  log(`  Context:    ${buildContext}`);
  const { stdout, stderr } = await execAsync(
    `podman build --pull=never -t "${tag}" -f "${dockerfile}" "${buildContext}"`,
    { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  );
  const lines = (stdout + '\n' + stderr).trim().split('\n');
  log(`Build output (last 10):\n${lines.slice(-10).join('\n')}`);
}

// ── Podman Push ──────────────────────────────────────────────────

async function pushImage(localTag, registryTag, timeoutMs, log) {
  log(`Tagging: ${localTag} → ${registryTag}`);
  await execAsync(`podman tag "${localTag}" "${registryTag}"`, { timeout: 10000, encoding: 'utf8' });
  log(`Pushing to ${REGISTRY_LOCAL}`);
  const { stdout, stderr } = await execAsync(
    `podman push --tls-verify=false "${registryTag}"`,
    { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }
  );
  const lines = (stdout + stderr).trim().split('\n');
  log(`Push: ${lines.slice(-3).join(' | ')}`);
}

// ── Namespace Create ─────────────────────────────────────────────

async function createNamespace(ns, log) {
  log(`Creating namespace: ${ns}`);
  await execAsync(`kubectl create namespace "${ns}"`, { timeout: 15000, encoding: 'utf8' });
  log(`Created: ${ns}`);
}

// ── Copy Secrets ─────────────────────────────────────────────────

async function copySecrets(names, targetNs, log) {
  for (const name of names) {
    log(`Copying secret ${KUBECLAW_NS}/${name} → ${targetNs}`);
    try {
      await execAsync(
        `kubectl get secret "${name}" -n "${KUBECLAW_NS}" -o json ` +
        `| jq 'del(.metadata.namespace,.metadata.resourceVersion,.metadata.uid,` +
        `.metadata.creationTimestamp,.metadata.annotations,.metadata.managedFields)' ` +
        `| kubectl apply -n "${targetNs}" -f -`,
        { timeout: 20000, encoding: 'utf8', shell: '/bin/bash' }
      );
      log(`  ✓ ${name}`);
    } catch (e) {
      log(`  ⚠ ${name}: ${trimOut(e.message, 150)}`);
    }
  }
}

// ── Apply Manifests ──────────────────────────────────────────────

async function applyManifests(manifestPaths, imageName, registryTag, targetNs, timeoutMs, log) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8s-suite-'));
  log(`Applying ${manifestPaths.length} manifest(s) to ${targetNs}`);
  log(`Overriding image "${imageName}" → "${registryTag}"`);
  try {
    let applied = 0;
    for (const mp of manifestPaths) {
      if (!fs.existsSync(mp)) { log(`  ⚠ Not found: ${mp}`); continue; }
      const content = fs.readFileSync(mp, 'utf8');
      const overridden = content
        // Strip hardcoded namespace so -n testNs takes effect
        .replace(/^\s+namespace:\s+\S+\r?\n?/gm, '')
        .replace(
          /^(\s+image:\s+)(.+)$/gm,
          (match, prefix, imgVal) => {
            if (imgVal.trim().includes(imageName)) {
              log(`  Override: "${imgVal.trim()}" → "${registryTag}"`);
              return `${prefix}${registryTag}`;
            }
            return match;
          }
        );
      fs.writeFileSync(path.join(tmpDir, path.basename(mp)), overridden);
      applied++;
    }
    if (applied === 0) throw new Error('No manifest files found to apply');
    const { stdout } = await execAsync(
      `kubectl apply -n "${targetNs}" -f "${tmpDir}/"`,
      { timeout: timeoutMs, encoding: 'utf8' }
    );
    log(`Applied:\n${stdout.trim()}`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// ── Wait for Pods ────────────────────────────────────────────────

async function waitForPods(ns, timeoutSeconds, log) {
  log(`Waiting for pods in ${ns} (max ${timeoutSeconds}s)…`);
  await execAsync(
    `kubectl wait --for=condition=Ready pod --all -n "${ns}" --timeout="${timeoutSeconds}s"`,
    { timeout: (timeoutSeconds + 10) * 1000, encoding: 'utf8' }
  );
  log(`All pods ready in ${ns}`);
}

async function getPodStatus(ns) {
  try {
    const { stdout } = await execAsync(
      `kubectl get pods -n "${ns}" --no-headers 2>&1 | head -10`,
      { timeout: 10000, encoding: 'utf8' }
    );
    return stdout.trim();
  } catch {
    return '(could not retrieve pod status)';
  }
}

// ── Health Check ─────────────────────────────────────────────────

async function httpHealthCheck(url, log) {
  log(`Health check: ${url}`);
  const { stdout } = await execAsync(
    `curl -sf --connect-timeout 10 --max-time 30 -o /dev/null -w "%{http_code}" "${url}"`,
    { timeout: 45000, encoding: 'utf8' }
  );
  const code = parseInt(stdout.trim(), 10);
  log(`Health check: HTTP ${code}`);
  return code;
}

// ═══════════════════════════════════════════════════════════════
// Suite Entry Point
// ═══════════════════════════════════════════════════════════════

export default async function k8sSuite(context) {
  const { payload, moduleId, logSink, telemetryContext: tctx } = context;
  const startTime = Date.now();

  const log = (msg) => {
    console.log(`[SUITE] [K8S] ${msg}`);
    if (logSink) logSink('K8S', msg);
  };

  // Emit buster.k8s.step for each check so ClawDeck shows live progress
  // during the long build+deploy pipeline (can take 5+ minutes total).
  const stepTel = (check, status, detail) => {
    emitEvent(tctx, 'buster.k8s.step', {
      module_id:       moduleId,
      check,
      status,          // 'started' | 'passed' | 'failed'
      detail:          detail || null,
      elapsed_seconds: Math.ceil((Date.now() - startTime) / 1000),
    }).catch(() => {});
  };

  const k8sCfg  = payload?.test_config?.k8s || payload?.config?.k8s || {};
  const repoRoot = context.repoRoot || getRepoRoot();

  const dockerfile    = k8sCfg.dockerfile  ? resolveRepoPath(k8sCfg.dockerfile, repoRoot)  : null;
  const imageName     = k8sCfg.image_name;
  const serviceName   = k8sCfg.service_name;
  const port          = k8sCfg.port        || DEFAULTS.port;
  const manifestPaths = (k8sCfg.manifests  || []).map(m => resolveRepoPath(m, repoRoot));

  if (!dockerfile || !imageName || !serviceName || manifestPaths.length === 0) {
    log('Skipping — k8s config not set (requires: dockerfile, image_name, service_name, manifests)');
    return createSuiteVerdict('k8s', STATUS.SKIP, {
      reason: 'k8s suite not configured (requires: dockerfile, image_name, service_name, manifests)',
    });
  }

  const buildContext    = k8sCfg.build_context
    ? resolveRepoPath(k8sCfg.build_context, repoRoot)
    : path.dirname(dockerfile);
  const healthPath      = k8sCfg.health_path            || DEFAULTS.health_path;
  const readyTimeout    = k8sCfg.ready_timeout_seconds  || DEFAULTS.ready_timeout_seconds;
  const nsPrefix        = k8sCfg.namespace_prefix       || DEFAULTS.namespace_prefix;
  const secretsToCopy   = k8sCfg.secrets_to_copy        || [];
  const buildTimeoutMs  = (k8sCfg.build_timeout_seconds  || DEFAULTS.build_timeout_seconds)  * 1000;
  const pushTimeoutMs   = (k8sCfg.push_timeout_seconds   || DEFAULTS.push_timeout_seconds)   * 1000;
  const deployTimeoutMs = (k8sCfg.deploy_timeout_seconds || DEFAULTS.deploy_timeout_seconds) * 1000;

  const runId       = shortId();
  const testNs      = `${nsPrefix}-${payload?.project || 'project'}-${runId}`;
  const localTag    = `localhost/k8s-suite-${imageName}:${runId}`;
  const registryTag = `${REGISTRY_LOCAL}/${imageName}:${runId}`;

  log(`Starting: module=${moduleId} project=${payload?.project} ns=${testNs}`);

  const checks = [];
  let criticalFailed = false;

  // ── Check 1: Dockerfile build ─────────────────────────────────

  log('--- Check 1: Dockerfile build ---');
  stepTel('dockerfile-build', 'started', `Building ${imageName} from ${k8sCfg.dockerfile}`);
  try {
    await buildImage(dockerfile, buildContext, localTag, buildTimeoutMs, log);
    checks.push(makeCheck('dockerfile-build', true, `Built: ${localTag}`));
    stepTel('dockerfile-build', 'passed', `Built: ${localTag}`);
    log('✓ Dockerfile build passed');
  } catch (e) {
    const detail = trimOut((e.stderr || '') + (e.stdout || '') || e.message);
    checks.push(makeCheck('dockerfile-build', false, `Build failed: ${detail}`));
    stepTel('dockerfile-build', 'failed', detail.slice(0, 300));
    criticalFailed = true;
    log('✗ Dockerfile build failed');
  }

  // ── Check 2: Push to registry-local ──────────────────────────

  if (!criticalFailed) {
    log('--- Check 2: Push to registry-local ---');
    stepTel('registry-push', 'started', `Pushing to ${REGISTRY_LOCAL}`);
    try {
      await pushImage(localTag, registryTag, pushTimeoutMs, log);
      checks.push(makeCheck('registry-push', true, `Pushed: ${registryTag}`));
      stepTel('registry-push', 'passed', registryTag);
      log('✓ Registry push passed');
    } catch (e) {
      const detail = trimOut((e.stderr || '') + (e.stdout || '') || e.message);
      checks.push(makeCheck('registry-push', false, `Push failed: ${detail}`));
      stepTel('registry-push', 'failed', detail.slice(0, 300));
      criticalFailed = true;
      log('✗ Registry push failed');
    }
  }

  // ── Check 3: Create ephemeral test namespace ──────────────────

  if (!criticalFailed) {
    log('--- Check 3: Create test namespace ---');
    stepTel('namespace-create', 'started', testNs);
    try {
      await createNamespace(testNs, log);
      fs.writeFileSync(K8S_NS_FILE, testNs);   // orchestrator cleanup reads this
      checks.push(makeCheck('namespace-create', true, `Created: ${testNs}`));
      stepTel('namespace-create', 'passed', testNs);
      log('✓ Namespace created');
    } catch (e) {
      const detail = trimOut((e.stderr || '') + (e.stdout || '') || e.message);
      checks.push(makeCheck('namespace-create', false, `Namespace create failed: ${detail}`));
      stepTel('namespace-create', 'failed', detail.slice(0, 300));
      criticalFailed = true;
      log('✗ Namespace creation failed');
    }
  }

  // ── Check 4: Copy secrets (non-critical) ─────────────────────

  if (!criticalFailed && secretsToCopy.length > 0) {
    log(`--- Check 4: Copy ${secretsToCopy.length} secret(s) ---`);
    stepTel('secrets-copy', 'started', secretsToCopy.join(', '));
    await copySecrets(secretsToCopy, testNs, log);
    checks.push(makeCheck('secrets-copy', true, `Copied to ${testNs}`));
    stepTel('secrets-copy', 'passed', `Copied to ${testNs}`);
  }

  // ── Check 5: Apply manifests with image override ──────────────

  if (!criticalFailed) {
    log(`--- Check 5: Apply ${manifestPaths.length} manifest(s) ---`);
    stepTel('manifest-apply', 'started', `${manifestPaths.length} manifest(s) → ${testNs}`);
    try {
      await applyManifests(manifestPaths, imageName, registryTag, testNs, deployTimeoutMs, log);
      checks.push(makeCheck('manifest-apply', true, `Applied to ${testNs}`));
      stepTel('manifest-apply', 'passed', `${manifestPaths.length} manifest(s) applied`);
      log('✓ Manifests applied');
    } catch (e) {
      const detail = trimOut((e.stderr || '') + (e.stdout || '') || e.message);
      checks.push(makeCheck('manifest-apply', false, `Apply failed: ${detail}`));
      stepTel('manifest-apply', 'failed', detail.slice(0, 300));
      criticalFailed = true;
      log('✗ Manifest apply failed');
    }
  }

  // ── Check 6: Wait for all pods ready ─────────────────────────

  if (!criticalFailed) {
    log(`--- Check 6: Waiting for pods ready (${readyTimeout}s) ---`);
    stepTel('pods-ready', 'started', `Waiting up to ${readyTimeout}s in ${testNs}`);
    try {
      await waitForPods(testNs, readyTimeout, log);
      checks.push(makeCheck('pods-ready', true, `All pods ready in ${testNs}`));
      stepTel('pods-ready', 'passed', `All pods ready in ${testNs}`);
      log('✓ Pods ready');
    } catch (e) {
      const podStatus = await getPodStatus(testNs);
      const detail = `Pods not ready within ${readyTimeout}s.\nPod status:\n${podStatus}`;
      checks.push(makeCheck('pods-ready', false, detail));
      stepTel('pods-ready', 'failed', `Not ready within ${readyTimeout}s`);
      criticalFailed = true;
      log(`✗ Pods not ready within ${readyTimeout}s`);
    }
  }

  // ── Check 7: HTTP health check ────────────────────────────────

  const serviceUrl = `http://${serviceName}.${testNs}.svc.cluster.local:${port}${healthPath}`;
  let httpCode = null;

  if (!criticalFailed) {
    log(`--- Check 7: Health check → ${serviceUrl} ---`);
    stepTel('health-check', 'started', serviceUrl);
    try {
      httpCode = await httpHealthCheck(serviceUrl, log);
      const passed = httpCode >= 200 && httpCode < 400;
      checks.push(makeCheck('health-check', passed,
        passed ? `HTTP ${httpCode} OK` : `HTTP ${httpCode} (expected 2xx/3xx)`
      ));
      if (passed) {
        stepTel('health-check', 'passed', `HTTP ${httpCode}`);
        log(`✓ Health check: HTTP ${httpCode}`);
      } else {
        stepTel('health-check', 'failed', `HTTP ${httpCode} (expected 2xx/3xx)`);
        criticalFailed = true;
        log(`✗ Health check: HTTP ${httpCode}`);
      }
    } catch (e) {
      const detail = trimOut(e.message);
      checks.push(makeCheck('health-check', false, `Health check failed: ${detail}`));
      stepTel('health-check', 'failed', detail.slice(0, 200));
      criticalFailed = true;
      log('✗ Health check error');
    }
  }

  // ── Aggregate verdict ─────────────────────────────────────────

  const duration_ms   = Date.now() - startTime;
  const checks_passed = checks.filter(c => c.passed).length;
  const checks_failed = checks.filter(c => !c.passed).length;
  const status        = checks_failed === 0 ? STATUS.PASS : STATUS.FAIL;
  const topFinding    = checks.find(c => !c.passed)?.detail || null;

  const findings = checks
    .filter(c => !c.passed)
    .map(c => createFinding(SEVERITY.CRITICAL, c.detail, { rule: c.name }));

  log(`Result: ${status} — ${checks_passed}/${checks.length} checks (${duration_ms}ms)`);
  if (status === STATUS.PASS) log(`Service URL for buster: ${serviceUrl}`);

  return createSuiteVerdict('k8s', status, {
    critical: true,
    duration_ms,
    checks_total:  checks.length,
    checks_passed,
    checks_failed,
    findings,
    metadata: {
      test_namespace:   testNs,
      registry_image:   registryTag,
      service_url:      serviceUrl,
      health_http_code: httpCode,
      checks: checks.map(c => ({
        name:   c.name,
        passed: c.passed,
        detail: c.detail.slice(0, 300),
      })),
    },
    top_finding: topFinding,
  });
}
