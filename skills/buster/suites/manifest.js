// ═══════════════════════════════════════════════════════════════
// Suite: manifest — Kubernetes Manifest Validation
// ═══════════════════════════════════════════════════════════════
//
// Static analysis suite — reads YAML files from disk, no running
// app required. Validates deployment readiness before build.
//
// Config (from context.config.manifest):
//   {
//     deployment_yaml: ".swarm/modules/01-scaffold/k8s/deployment.yaml",
//     secret_yaml:     ".swarm/modules/01-scaffold/k8s/secret.yaml",
//     required_env:    ["KEY1", "KEY2"],
//     private_registries: ["ghcr.io"],
//     thresholds: { max_issues: 0 }
//   }
//
// If deployment_yaml is not set → SKIP (no regression).
// YAML parsing uses js-yaml via dynamic import, falls back to
// regex-based extraction for common K8s patterns.

import fs   from 'fs';
import path from 'path';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../verdict-schema.js';
import { resolveRepoPath } from './repo-paths.js';

// ── Helpers ─────────────────────────────────────────────────────

let _logSink = null;
function log(msg) {
  console.log(`[SUITE] [MANIFEST] ${msg}`);
  if (_logSink) _logSink({ suite: 'manifest', msg });
}

// ── YAML Parsing ────────────────────────────────────────────────

/**
 * Try js-yaml first; fall back to regex-based extraction.
 * Returns a plain object representation of the YAML document.
 */
async function loadYaml(content) {
  try {
    const jsYaml = await import('js-yaml');
    return jsYaml.default.load(content);
  } catch {
    // js-yaml unavailable or parse error → use regex fallback
    return parseYamlFallback(content);
  }
}

/**
 * Regex-based YAML extractor for common K8s deployment patterns.
 * Returns a normalised object with the fields we care about.
 *
 * Handles:
 *   - kind:
 *   - spec.template.spec.containers[*].image
 *   - spec.template.spec.containers[*].env[*] (value + secretKeyRef)
 *   - spec.template.spec.containers[*].envFrom[*]
 *   - spec.template.spec.containers[*].resources.limits
 *   - spec.template.spec.containers[*].readinessProbe / livenessProbe
 *   - spec.template.spec.imagePullSecrets
 */
function parseYamlFallback(content) {
  const result = {
    _fallback:        true,
    kind:             null,
    images:           [],
    env:              [],  // [{name, value}] or [{name, valueFrom:{secretKeyRef:{name,key}}}]
    envFrom:          [],  // [{secretRef:{name}} | {configMapRef:{name}}]
    imagePullSecrets: false,
    hasLimits:        false,
    hasReadinessProbe: false,
    hasLivenessProbe:  false,
  };

  // kind
  const kindMatch = content.match(/^kind:\s*(\S+)/m);
  if (kindMatch) result.kind = kindMatch[1].trim();

  // images
  for (const m of content.matchAll(/^\s+image:\s*(.+)$/gm)) {
    result.images.push(m[1].trim().replace(/^["']|["']$/g, ''));
  }

  // imagePullSecrets presence
  result.imagePullSecrets = /imagePullSecrets:/m.test(content);

  // resource limits
  result.hasLimits = /^\s+limits:/m.test(content);

  // probes
  result.hasReadinessProbe = /readinessProbe:/m.test(content);
  result.hasLivenessProbe  = /livenessProbe:/m.test(content);

  // env entries — line-by-line state machine
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const nameM = lines[i].match(/^(\s+)- name:\s*(.+)$/);
    if (!nameM) continue;

    const varName   = nameM[2].trim();
    const baseIndent = nameM[1].length;

    // Next line should be value: or valueFrom:
    const next = lines[i + 1] || '';

    const valueM = next.match(/^\s+value:\s*(.*)$/);
    if (valueM) {
      result.env.push({ name: varName, value: valueM[1].trim().replace(/^["']|["']$/g, '') });
      i++;
      continue;
    }

    if (/^\s+valueFrom:/.test(next)) {
      // Look for secretKeyRef 2 lines ahead
      const refLine  = lines[i + 2] || '';
      const nameLine = lines[i + 3] || '';
      const keyLine  = lines[i + 4] || '';

      if (/secretKeyRef:/.test(refLine)) {
        const sNameM = nameLine.match(/name:\s*(.+)/);
        const sKeyM  = keyLine.match(/key:\s*(.+)/);
        if (sNameM && sKeyM) {
          result.env.push({
            name: varName,
            valueFrom: {
              secretKeyRef: {
                name: sNameM[1].trim(),
                key:  sKeyM[1].trim(),
              },
            },
          });
        }
      }
    }
  }

  // envFrom entries
  const envFromBlock = content.match(/envFrom:\s*\n((?:[ \t]+[^\n]+\n)*)/);
  if (envFromBlock) {
    for (const m of envFromBlock[1].matchAll(/secretRef:\s*\n\s+name:\s*(.+)/g)) {
      result.envFrom.push({ secretRef: { name: m[1].trim() } });
    }
    for (const m of envFromBlock[1].matchAll(/configMapRef:\s*\n\s+name:\s*(.+)/g)) {
      result.envFrom.push({ configMapRef: { name: m[1].trim() } });
    }
  }

  return result;
}

/**
 * Extract keys from a K8s Secret YAML.
 * Returns { name: string, keys: string[] }
 */
async function parseSecretYaml(content) {
  let doc;
  try {
    const jsYaml = await import('js-yaml');
    doc = jsYaml.default.load(content);
    const name = doc?.metadata?.name || '';
    const keys = Object.keys(doc?.data || {});
    return { name, keys };
  } catch {
    // Fallback
    const nameM = content.match(/^  name:\s*(.+)$/m);
    const name  = nameM ? nameM[1].trim() : '';
    const keys  = [];
    const dataBlock = content.match(/^data:\s*\n((?:[ \t]+[^\n]+\n)*)/m);
    if (dataBlock) {
      for (const m of dataBlock[1].matchAll(/^[ \t]+(\S+):/gm)) {
        keys.push(m[1]);
      }
    }
    return { name, keys };
  }
}

// ── Normalise parsed YAML to a consistent shape ──────────────────

/**
 * Extract env + envFrom + images + imagePullSecrets from a fully-parsed
 * js-yaml document (deep nested structure).
 */
function extractFromParsedDoc(doc) {
  const containers = doc?.spec?.template?.spec?.containers || [];
  const env        = [];
  const envFrom    = [];
  const images     = [];

  for (const c of containers) {
    if (c.image) images.push(c.image);
    if (Array.isArray(c.env))     env.push(...c.env);
    if (Array.isArray(c.envFrom)) envFrom.push(...c.envFrom);
  }

  const imagePullSecrets =
    (doc?.spec?.template?.spec?.imagePullSecrets || []).length > 0;

  const hasLimits = containers.some(c => c.resources?.limits);
  const hasReadinessProbe = containers.some(c => c.readinessProbe);
  const hasLivenessProbe  = containers.some(c => c.livenessProbe);
  const kind = doc?.kind || null;

  return { kind, images, env, envFrom, imagePullSecrets, hasLimits, hasReadinessProbe, hasLivenessProbe };
}

/**
 * Normalise to the same shape regardless of whether we used js-yaml or fallback.
 */
function normalise(parsed) {
  if (parsed && parsed._fallback) return parsed;
  return extractFromParsedDoc(parsed);
}

// ── Individual Checks ────────────────────────────────────────────

function checkParseable(data, findings) {
  if (!data || data.kind !== 'Deployment') {
    findings.push(createFinding(
      SEVERITY.CRITICAL,
      `Deployment YAML invalid or missing "kind: Deployment" (got: ${data?.kind || 'unknown'})`,
      { rule: 'yaml-parseable' },
    ));
    return false;
  }
  return true;
}

function checkRequiredEnvVars(data, requiredEnv, findings) {
  if (!Array.isArray(requiredEnv) || requiredEnv.length === 0) return;

  const presentNames = new Set(data.env.map(e => e.name));

  // envFrom with secretRef/configMapRef counts as "potentially present" for all vars —
  // we can't enumerate what's inside without reading the secret/configmap, so if envFrom
  // is used we only flag vars that are definitely absent AND not covered by envFrom.
  const hasEnvFrom = data.envFrom.length > 0;

  for (const required of requiredEnv) {
    if (!presentNames.has(required) && !hasEnvFrom) {
      findings.push(createFinding(
        SEVERITY.CRITICAL,
        `Required env var "${required}" not found in container spec (env or envFrom)`,
        { rule: 'required-env' },
      ));
    } else if (!presentNames.has(required) && hasEnvFrom) {
      // Warn but not critical — envFrom may cover it
      findings.push(createFinding(
        SEVERITY.MODERATE,
        `Required env var "${required}" not explicitly listed; may be provided via envFrom`,
        { rule: 'required-env-envfrom' },
      ));
    }
  }
}

function checkSecretRefs(data, secretInfo, findings) {
  if (!secretInfo) return;

  const secretKeySet = new Set(secretInfo.keys);

  for (const envEntry of data.env) {
    const ref = envEntry.valueFrom?.secretKeyRef;
    if (!ref) continue;

    if (ref.name !== secretInfo.name) {
      // Different secret — can't validate
      continue;
    }

    if (!secretKeySet.has(ref.key)) {
      findings.push(createFinding(
        SEVERITY.SERIOUS,
        `Secret ref "${ref.name}.${ref.key}" not found in secret YAML (available: ${[...secretKeySet].join(', ') || 'none'})`,
        { rule: 'secret-ref' },
      ));
    }
  }
}

function checkImagePullSecrets(data, privateRegistries, findings) {
  if (!Array.isArray(privateRegistries) || privateRegistries.length === 0) return;

  const usesPrivate = data.images.some(img =>
    privateRegistries.some(reg => img.startsWith(reg))
  );

  if (usesPrivate && !data.imagePullSecrets) {
    findings.push(createFinding(
      SEVERITY.SERIOUS,
      `Container uses private registry (${privateRegistries.join(', ')}) but imagePullSecrets is not defined`,
      { rule: 'image-pull-secrets' },
    ));
  }
}

function checkProbes(data, healthPath, findings) {
  if (!healthPath) return;

  if (!data.hasReadinessProbe) {
    findings.push(createFinding(
      SEVERITY.MODERATE,
      'App has health_path configured but deployment lacks readinessProbe',
      { rule: 'readiness-probe' },
    ));
  }
  if (!data.hasLivenessProbe) {
    findings.push(createFinding(
      SEVERITY.MODERATE,
      'App has health_path configured but deployment lacks livenessProbe',
      { rule: 'liveness-probe' },
    ));
  }
}

function checkResourceLimits(data, findings) {
  if (!data.hasLimits) {
    findings.push(createFinding(
      SEVERITY.MINOR,
      'No resource limits defined on containers (resources.limits)',
      { rule: 'resource-limits' },
    ));
  }
}

// ── Suite Entry Point ───────────────────────────────────────────

export default async function manifestSuite(context) {
  _logSink = context.logSink || null;
  const startTime = Date.now();

  const manifestCfg = context.config?.manifest || {};
  const deploymentYamlRel = manifestCfg.deployment_yaml;

  // If no deployment_yaml configured → SKIP
  if (!deploymentYamlRel) {
    return createSuiteVerdict('manifest', STATUS.SKIP, {
      reason: 'manifest.deployment_yaml not configured',
    });
  }

  const deploymentYamlPath = resolveRepoPath(deploymentYamlRel);
  const secretYamlPath     = manifestCfg.secret_yaml
    ? resolveRepoPath(manifestCfg.secret_yaml)
    : null;

  // If file doesn't exist → SKIP (not an error — may not apply yet)
  if (!fs.existsSync(deploymentYamlPath)) {
    log(`deployment_yaml not found at ${deploymentYamlPath} — skipping`);
    return createSuiteVerdict('manifest', STATUS.SKIP, {
      reason: `deployment_yaml not found: ${deploymentYamlRel}`,
    });
  }

  log(`Validating manifest: ${deploymentYamlPath}`);

  const findings = [];
  let checks = 0;

  // ── Load deployment YAML ──
  let data;
  let rawContent;
  try {
    rawContent = fs.readFileSync(deploymentYamlPath, 'utf8');
    const parsed = await loadYaml(rawContent);
    data = normalise(parsed);
  } catch (err) {
    findings.push(createFinding(SEVERITY.CRITICAL, `Failed to read/parse deployment YAML: ${err.message}`, { rule: 'yaml-parseable' }));
    const duration_ms = Date.now() - startTime;
    return createSuiteVerdict('manifest', STATUS.FAIL, {
      critical:      true,
      duration_ms,
      checks_total:  1,
      checks_passed: 0,
      checks_failed: 1,
      findings,
    });
  }

  // ── Load secret YAML (optional) ──
  let secretInfo = null;
  if (secretYamlPath && fs.existsSync(secretYamlPath)) {
    try {
      const secretContent = fs.readFileSync(secretYamlPath, 'utf8');
      secretInfo = await parseSecretYaml(secretContent);
      log(`Loaded secret YAML: ${secretYamlPath} (${secretInfo.keys.length} keys)`);
    } catch (err) {
      log(`Warning: could not parse secret YAML: ${err.message}`);
    }
  }

  // ── Run checks ──

  checks++;
  const parseable = checkParseable(data, findings);
  if (!parseable) {
    // Can't continue if basic structure is wrong
    const duration_ms = Date.now() - startTime;
    return createSuiteVerdict('manifest', STATUS.FAIL, {
      critical:      true,
      duration_ms,
      checks_total:  checks,
      checks_passed: 0,
      checks_failed: 1,
      findings,
    });
  }
  log(`kind: ${data.kind} ✓`);

  checks++;
  const prevLen = findings.length;
  checkRequiredEnvVars(data, manifestCfg.required_env, findings);
  if (findings.length === prevLen) log(`Required env vars: all present ✓`);

  checks++;
  const prevLen2 = findings.length;
  checkSecretRefs(data, secretInfo, findings);
  if (findings.length === prevLen2) log(`Secret refs: all resolvable ✓`);

  checks++;
  const prevLen3 = findings.length;
  checkImagePullSecrets(data, manifestCfg.private_registries, findings);
  if (findings.length === prevLen3) log(`imagePullSecrets: OK ✓`);

  checks++;
  const prevLen4 = findings.length;
  checkProbes(data, context.config?.serve?.health_path, findings);
  if (findings.length === prevLen4) log(`Probes: OK ✓`);

  checks++;
  const prevLen5 = findings.length;
  checkResourceLimits(data, findings);
  if (findings.length === prevLen5) log(`Resource limits: defined ✓`);

  // ── Thresholds ──
  const thresholds   = manifestCfg.thresholds || null;
  const criticalFinds = findings.filter(f => f.severity === SEVERITY.CRITICAL);
  const seriousFinds  = findings.filter(f => f.severity === SEVERITY.SERIOUS);
  const totalIssues   = findings.length;

  const hasThresholds = thresholds && typeof thresholds.max_issues === 'number';
  const exceedsThreshold = hasThresholds && totalIssues > thresholds.max_issues;

  // Critical severity findings always fail the suite
  const hasCritical = criticalFinds.length > 0;
  const shouldFail  = hasCritical || exceedsThreshold;

  const duration_ms    = Date.now() - startTime;
  const checks_failed  = findings.filter(f => [SEVERITY.CRITICAL, SEVERITY.SERIOUS].includes(f.severity)).length;
  const checks_passed  = checks - checks_failed;

  if (!shouldFail) {
    log(`✅ Manifest validation passed (${findings.length} informational finding${findings.length !== 1 ? 's' : ''})`);
    return createSuiteVerdict('manifest', STATUS.PASS, {
      critical:      false,
      duration_ms,
      checks_total:  checks,
      checks_passed: Math.max(0, checks_passed),
      checks_failed: 0,
      findings,
      metadata: {
        deployment_yaml: deploymentYamlRel,
        secret_yaml:     manifestCfg.secret_yaml || null,
        images:          data.images,
        env_count:       data.env.length,
        enforced:        hasThresholds,
      },
    });
  }

  log(`❌ Manifest validation FAIL: ${criticalFinds.length} critical, ${seriousFinds.length} serious, ${totalIssues} total`);

  return createSuiteVerdict('manifest', STATUS.FAIL, {
    critical:      hasCritical,
    duration_ms,
    checks_total:  checks,
    checks_passed: Math.max(0, checks_passed),
    checks_failed: Math.max(1, checks_failed),
    findings,
    metadata: {
      deployment_yaml: deploymentYamlRel,
      secret_yaml:     manifestCfg.secret_yaml || null,
      images:          data.images,
      env_count:       data.env.length,
      enforced:        hasThresholds,
    },
  });
}
