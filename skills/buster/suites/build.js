// ═══════════════════════════════════════════════════════════════
// Suite: build — Compile + Serve
// ═══════════════════════════════════════════════════════════════
//
// Builds the project and starts serving it. Two modes:
//
//   static (Frontend):
//     sandbox-build <image> <dir> "<cmd>" → output in /sandbox/www/
//     nginx start → serves on :9999
//
//   server (Backend):
//     podman run <image> "<start_cmd>" → app on configured port
//     Optional: podman build from Dockerfile before run
//     Wait briefly to catch immediate crashes
//
// The app stays running for downstream suites (health, a11y, etc.)
// and for the subagent. Cleanup happens at task end via the Buster Pipeline.
//
// Config (from context.config.serve):
//   { type: "static", build_cmd: "npm run build", image: "docker.io/library/node:20-slim" }
//   { type: "server", start_cmd: "npm start", port: 3000, image: "docker.io/library/node:20-slim" }

import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../verdict-schema.js';
import { REPO_DIR, resolveRepoPath, stripRepoDirPrefix } from './repo-paths.js';
import { trackSandboxResources } from '../pipeline/services/sandbox-cleanup.js';

const execFileAsync = promisify(execFile);
const execAsync     = promisify(exec);

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  type:      'static',
  image:     'docker.io/library/node:20-slim',
  build_cmd: 'npm run build',
  start_cmd: 'npm start',
  port:      3000,
  project_dir: REPO_DIR,
  timeout:   300, // seconds — matches SANDBOX_TIMEOUT default
};

// ── Helpers ─────────────────────────────────────────────────────

let _logSink = null;
function log(msg) {
  console.log(`[SUITE] [BUILD] ${msg}`);
  if (_logSink) _logSink({ suite: 'build', msg });
}


function normalizeImageRef(image) {
  if (!image) return image;
  const ref = String(image).trim();
  if (!ref) return ref;
  const first = ref.split('/')[0];
  if (!ref.includes('/')) return `docker.io/library/${ref}`;
  if (!first.includes('.') && !first.includes(':') && first !== 'localhost') return `docker.io/${ref}`;
  return ref;
}

/**
 * Parse stderr/stdout for actionable error lines.
 * Returns findings array with extracted errors.
 */
function parseErrors(output, source = 'stderr') {
  if (!output || !output.trim()) return [];

  const findings = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // TypeScript errors: src/handler.ts(12,5): error TS2307: ...
    const tsMatch = line.match(/^(.+?)\((\d+),\d+\):\s*error\s+(TS\d+):\s*(.+)/);
    if (tsMatch) {
      findings.push(createFinding(SEVERITY.CRITICAL, tsMatch[4], {
        rule: tsMatch[3],
        file: tsMatch[1],
        line: parseInt(tsMatch[2]),
      }));
      continue;
    }

    // Generic "error" or "Error" lines
    const errMatch = line.match(/^(?:ERROR|Error|error)[\s:]+(.+)/);
    if (errMatch) {
      findings.push(createFinding(SEVERITY.CRITICAL, errMatch[1].trim()));
      continue;
    }

    // npm ERR! lines
    if (line.startsWith('npm ERR!')) {
      const msg = line.replace('npm ERR!', '').trim();
      if (msg && !msg.startsWith('A complete log')) {
        findings.push(createFinding(SEVERITY.CRITICAL, msg, { rule: 'npm' }));
      }
    }

    // Python traceback: File "backend/main.py", line 12, in <module>
    const pyMatch = line.match(/^\s*File "(.+?)", line (\d+)/);
    if (pyMatch) {
      // Grab the next non-empty line as the error context
      const idx = lines.indexOf(line);
      const detail = lines.slice(idx + 1, idx + 3).find(l => l.trim() && !l.trim().startsWith('File '));
      if (detail) {
        findings.push(createFinding(SEVERITY.CRITICAL, detail.trim().slice(0, 300), {
          rule: 'python',
          file: pyMatch[1],
          line: parseInt(pyMatch[2]),
        }));
      }
      continue;
    }

    // Python final error line: ModuleNotFoundError: No module named 'fastapi'
    const pyErrMatch = line.match(/^(\w*Error|\w*Exception):\s*(.+)/);
    if (pyErrMatch) {
      findings.push(createFinding(SEVERITY.CRITICAL, `${pyErrMatch[1]}: ${pyErrMatch[2]}`, { rule: 'python' }));
      continue;
    }

    // pip errors
    if (line.startsWith('ERROR: ') && /pip|install|package|requirement/i.test(line)) {
      findings.push(createFinding(SEVERITY.CRITICAL, line.replace('ERROR: ', '').trim(), { rule: 'pip' }));
    }
  }

  // If no structured errors found, include raw output (truncated)
  if (findings.length === 0 && output.trim().length > 0) {
    const truncated = output.trim().slice(0, 500);
    findings.push(createFinding(SEVERITY.CRITICAL, truncated, { rule: source }));
  }

  // Cap at 20 findings to avoid bloat
  return findings.slice(0, 20);
}

// ── Env Injection from Deployment Manifest ──────────────────────

/**
 * Parse a K8s deployment YAML and extract env var key/value pairs.
 * For secretKeyRef entries: look up values in secretYamlPath (base64-decoded).
 * For plain value entries: use directly.
 * Returns [{name, value}] — never throws.
 */
async function extractEnvFromManifest(deploymentYamlPath, secretYamlPath) {
  const result = [];
  if (!deploymentYamlPath || !fs.existsSync(deploymentYamlPath)) return result;

  let content;
  try {
    content = fs.readFileSync(deploymentYamlPath, 'utf8');
  } catch {
    return result;
  }

  // Parse env entries using js-yaml or regex fallback
  let envEntries = [];
  try {
    const jsYaml = await import('js-yaml');
    const doc = jsYaml.default.load(content);
    const containers = doc?.spec?.template?.spec?.containers || [];
    for (const c of containers) {
      if (Array.isArray(c.env)) envEntries.push(...c.env);
    }
  } catch {
    // Regex fallback — line-by-line extraction
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const nameM = lines[i].match(/^\s+- name:\s*(.+)$/);
      if (!nameM) continue;
      const varName = nameM[1].trim();
      const next    = lines[i + 1] || '';
      const valueM  = next.match(/^\s+value:\s*(.*)$/);
      if (valueM) {
        envEntries.push({ name: varName, value: valueM[1].trim().replace(/^["']|["']$/g, '') });
        continue;
      }
      if (/^\s+valueFrom:/.test(next)) {
        const refLine  = lines[i + 2] || '';
        const nameLine = lines[i + 3] || '';
        const keyLine  = lines[i + 4] || '';
        if (/secretKeyRef:/.test(refLine)) {
          const sNameM = nameLine.match(/name:\s*(.+)/);
          const sKeyM  = keyLine.match(/key:\s*(.+)/);
          if (sNameM && sKeyM) {
            envEntries.push({ name: varName, valueFrom: { secretKeyRef: { name: sNameM[1].trim(), key: sKeyM[1].trim() } } });
          }
        }
      }
    }
  }

  // Load secret data for secretKeyRef resolution
  let secretData = {};
  if (secretYamlPath && fs.existsSync(secretYamlPath)) {
    try {
      const secretContent = fs.readFileSync(secretYamlPath, 'utf8');
      let secretDoc;
      try {
        const jsYaml = await import('js-yaml');
        secretDoc = jsYaml.default.load(secretContent);
        secretData = secretDoc?.data || {};
      } catch {
        // Regex fallback for secret data
        const dataBlock = secretContent.match(/^data:\s*\n((?:[ \t]+[^\n]+\n)*)/m);
        if (dataBlock) {
          for (const m of dataBlock[1].matchAll(/^[ \t]+(\S+):\s*(.+)$/gm)) {
            secretData[m[1]] = m[2].trim();
          }
        }
      }
    } catch {
      // Secret file unreadable — continue without it
    }
  }

  // Resolve entries to name/value pairs
  for (const entry of envEntries) {
    if (!entry.name) continue;

    if (entry.value !== undefined) {
      result.push({ name: entry.name, value: String(entry.value) });
      continue;
    }

    const ref = entry.valueFrom?.secretKeyRef;
    if (ref) {
      const b64 = secretData[ref.key];
      if (b64) {
        try {
          const decoded = Buffer.from(b64, 'base64').toString('utf8');
          result.push({ name: entry.name, value: decoded });
        } catch {
          result.push({ name: entry.name, value: b64 });
        }
      } else {
        // Placeholder — value not resolvable
        log(`Warning: secretKeyRef ${ref.name}.${ref.key} not found in secret YAML — injecting placeholder`);
        result.push({ name: entry.name, value: `UNRESOLVED_SECRET_${ref.key}` });
      }
    }
  }

  return result;
}

// ── Static Build + Serve ────────────────────────────────────────

async function buildStatic(config) {
  const image      = normalizeImageRef(config.image || DEFAULTS.image);
  const buildCmd   = config.build_cmd  || DEFAULTS.build_cmd;
  const projectDir = resolveRepoPath(config.project_dir || DEFAULTS.project_dir);
  const timeout    = (config.timeout   || DEFAULTS.timeout) * 1000;

  log(`Static build: image=${image} cmd="${buildCmd}" dir=${projectDir}`);

  // 1. sandbox-build
  try {
    const { stdout, stderr } = await execFileAsync(
      'sandbox-build', [image, projectDir, buildCmd],
      { timeout, encoding: 'utf8' }
    );
    if (stdout) log(stdout.trim());
    if (stderr) log(`stderr: ${stderr.trim().slice(0, 200)}`);
  } catch (err) {
    const output = (err.stderr || '') + (err.stdout || '') || err.message;
    return {
      ok: false,
      findings: parseErrors(output),
      output,
    };
  }

  // 2. Verify build output exists
  const wwwDir = '/sandbox/www';
  if (!fs.existsSync(wwwDir) || fs.readdirSync(wwwDir).length === 0) {
    return {
      ok: false,
      findings: [createFinding(SEVERITY.CRITICAL, `Build output empty: ${wwwDir}`, { rule: 'build-output' })],
      output: '',
    };
  }

  // 3. Start nginx (NOT sandbox-serve — that would wipe /sandbox/www/)
  log('Starting nginx on :9999...');
  try {
    // Check if nginx is already running via pid file
    const pidFile = '/run/nginx.pid';
    let running = false;
    if (fs.existsSync(pidFile)) {
      try {
        const pid = fs.readFileSync(pidFile, 'utf8').trim();
        // process.kill(pid, 0) throws if process doesn't exist
        process.kill(parseInt(pid), 0);
        running = true;
      } catch {
        // Stale pid file — nginx not running
      }
    }

    if (running) {
      log('nginx already running — reloading config...');
      await execFileAsync('nginx', ['-s', 'reload'], { timeout: 10000, encoding: 'utf8' });
    } else {
      await execFileAsync('nginx', [], { timeout: 10000, encoding: 'utf8' });
    }
  } catch (err) {
    return {
      ok: false,
      findings: [createFinding(SEVERITY.CRITICAL, `nginx start failed: ${err.message}`, { rule: 'nginx' })],
      output: err.stderr || '',
    };
  }

  // 4. Get output size for metadata
  let outputSize = 'unknown';
  try {
    const { stdout } = await execAsync('du -sh /sandbox/www/ | cut -f1', { encoding: 'utf8' });
    outputSize = stdout.trim();
  } catch {}

  log(`Build OK. Output: /sandbox/www/ (${outputSize})`);
  return { ok: true, findings: [], output: '', outputSize };
}

// ── Server Build + Start ────────────────────────────────────────

/**
 * Normalise start_cmd paths: rewrite host-relative paths to /src/ (container workdir).
 * e.g. "cd Projects/kubecommand/src/backend && ..." → "cd /src/backend && ..."
 */
function normaliseStartCmd(cmd, projectDir) {
  if (!cmd || !projectDir) return cmd;
  // Strip REPO_DIR prefix and project_dir prefix from cd commands
  let normalised = cmd;
  const rawDir = stripRepoDirPrefix(projectDir, REPO_DIR);
  if (rawDir) {
    normalised = normalised.replace(new RegExp(`cd\\s+${rawDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`), 'cd /src/');
    normalised = normalised.replace(new RegExp(`cd\\s+${projectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`), 'cd /src/');
  }
  return normalised;
}

async function buildServer(config, context = {}) {
  const image     = normalizeImageRef(config.image || DEFAULTS.image);
  const startCmd  = config.start_cmd  || DEFAULTS.start_cmd;
  const port      = config.port       || DEFAULTS.port;
  const timeout   = (config.timeout   || DEFAULTS.timeout) * 1000;
  const rawProjectDir = config.project_dir || DEFAULTS.project_dir;
  const projectDir = resolveRepoPath(rawProjectDir);
  const containerName = `sb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  log(`Server start: image=${image} cmd="${startCmd}" port=${port} project=${projectDir}`);

  // ── Optional: Dockerfile pre-build ──
  let runImage = image;
  let useVolume = true; // mount project_dir at /src

  if (config.dockerfile) {
    const dockerfile = resolveRepoPath(config.dockerfile);
    const buildContext = resolveRepoPath(config.build_context) || path.dirname(dockerfile);
    const buildTimeout = (config.build_timeout || 300) * 1000;
    const imageTag = config.image || `localhost/build-${containerName}`;

    if (!config.image) {
      trackSandboxResources(context.payload || {}, { images: [imageTag] });
    }

    log(`Dockerfile build: file=${dockerfile} context=${buildContext} tag=${imageTag}`);

    try {
      const { stdout, stderr } = await execAsync(
        `podman build --pull=never -t "${imageTag}" -f "${dockerfile}" "${buildContext}"`,
        { timeout: buildTimeout, encoding: 'utf8' }
      );
      if (stdout) log(stdout.trim().split('\n').slice(-3).join('\n'));
      log(`Dockerfile build OK: ${imageTag}`);
      runImage = imageTag;
      useVolume = false; // deps baked into image, no /src mount needed
    } catch (err) {
      const output = (err.stderr || '') + (err.stdout || '') || err.message;
      return {
        ok: false,
        findings: parseErrors(output, 'dockerfile-build'),
        output,
      };
    }
  }

  trackSandboxResources(context.payload || {}, { containers: [containerName] });

  // ── Podman run ──
  const normalisedCmd = normaliseStartCmd(startCmd, rawProjectDir);
  const args = [
    'run', '-d',
    '--name', containerName,
    '--network', 'host',
    '--memory', '2g',
    '--cpus', '2',
    '--pids-limit', '256',
    '--tmpfs', '/tmp:size=512m',
    '-v', '/sandbox:/sandbox:rw',
    '-e', 'SANDBOX=true',
    '-e', 'NODE_ENV=test',
  ];

  // ── Env injection from deployment manifest ──
  if (config.deployment_yaml) {
    const deploymentYamlPath = resolveRepoPath(config.deployment_yaml);
    const secretYamlPath     = config.secret_yaml ? resolveRepoPath(config.secret_yaml) : null;
    const injectedEnv = await extractEnvFromManifest(deploymentYamlPath, secretYamlPath);
    if (injectedEnv.length > 0) {
      log(`Injecting ${injectedEnv.length} env vars from deployment manifest`);
      for (const { name, value } of injectedEnv) {
        args.push('-e', `${name}=${value}`);
      }
    }
  }

  if (useVolume && projectDir) {
    args.push('-v', `${projectDir}:/src:rw`, '--workdir', '/src');
  }

  args.push(runImage, 'sh', '-c', normalisedCmd);

  log(`podman ${useVolume ? '(volume mount)' : '(baked image)'}: ${normalisedCmd.slice(0, 120)}`);

  try {
    const { stdout } = await execFileAsync('podman', args, {
      timeout, encoding: 'utf8',
    });
    if (stdout) log(`Container started: ${stdout.trim().slice(0, 12)}`);
  } catch (err) {
    const output = (err.stderr || '') + (err.stdout || '') || err.message;
    return {
      ok: false,
      findings: parseErrors(output),
      output,
    };
  }

  // ── Crash detection ──
  log('Waiting 3s for crash detection...');
  await new Promise(r => setTimeout(r, 3000));

  try {
    const { stdout } = await execAsync(
      `podman ps --filter name=${containerName} --format "{{.Names}}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    if (!stdout || !stdout.includes(containerName)) {
      // Container crashed — grab logs for diagnosis
      let crashLogs = '';
      try {
        const { stdout: logs } = await execAsync(
          `podman logs ${containerName} 2>&1 | tail -30`,
          { encoding: 'utf8', timeout: 5000 }
        );
        crashLogs = logs;
      } catch {}

      return {
        ok: false,
        findings: parseErrors(crashLogs || `Server process exited within 3s (port ${port})`, 'server-crash'),
        output: crashLogs,
      };
    }
  } catch {}

  log(`Server running on port ${port} (container: ${containerName})`);
  return { ok: true, findings: [], output: '', port };
}

// ── Suite Entry Point ───────────────────────────────────────────

export default async function buildSuite(context) {
  _logSink = context.logSink || null;
  const startTime = Date.now();
  const serve = context.config?.serve || {};
  const type  = serve.type || DEFAULTS.type;

  let result;
  if (type === 'server') {
    result = await buildServer(serve, context);
  } else {
    result = await buildStatic(serve);
  }

  const duration_ms = Date.now() - startTime;

  if (result.ok) {
    return createSuiteVerdict('build', STATUS.PASS, {
      critical: true,
      duration_ms,
      checks_total: 1,
      checks_passed: 1,
      checks_failed: 0,
      findings: [],
      metadata: {
        tool: type === 'server' ? 'podman-run' : 'sandbox-build',
        serve_type: type,
        ...(result.outputSize ? { output_size: result.outputSize } : {}),
        ...(result.port ? { port: result.port } : {}),
      },
    });
  }

  return createSuiteVerdict('build', STATUS.FAIL, {
    critical: true,
    duration_ms,
    checks_total: 1,
    checks_passed: 0,
    checks_failed: 1,
    findings: result.findings,
    metadata: {
      tool: type === 'server' ? 'podman-run' : 'sandbox-build',
      serve_type: type,
      raw_output: (result.output || '').slice(0, 2000),
    },
  });
}
