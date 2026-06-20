// ═══════════════════════════════════════════════════════════════
// Suite: build — Compile + Serve
// ═══════════════════════════════════════════════════════════════
//
// KEEP_TYPED_POLICY: build suite defaults establish a runnable app from
// minimal typed config; heterogeneous build output is converted into bounded
// findings; static serving may reuse healthy nginx and metadata probes are
// nonfatal; Dockerfile pre-build and early-crash diagnostics remain intentional.
// DELETE_LEGACY: image references must be canonical/fully qualified, and
// secretKeyRef env injection must fail when required secrets are unavailable.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFile } from 'child_process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { promisify } from 'util';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { Buffer } from 'buffer';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.ts';
import type { Finding, SuiteVerdict } from '../services/verdict-schema.ts';
import { REPO_DIR, resolveRepoScopedPath, stripRepoDirPrefix } from './repo-paths.ts';
import { buildCleanupPodmanLabelArgs, trackSandboxResources } from '../services/sandbox-cleanup.ts';
import { buildSubprocessEnv } from '../security.ts';
import { validateBaseImageRef } from '../services/base-images.ts';

declare const process: {
  kill(pid: number, signal?: string | number): boolean;
};

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;

interface BuildContext {
  payload?: AnyRecord;
  logSink?: LogSink | null;
  config?: { serve?: AnyRecord };
}

interface BuildResult {
  ok: boolean;
  findings: Finding[];
  output: string;
  outputSize?: string;
  port?: number;
}

interface EnvExtractionResult {
  ok: boolean;
  env: Array<{ name: string; value: string }>;
  findings: Finding[];
}

const execFileAsync = promisify(execFile) as any;

const DEFAULTS = {
  type:      'static',
  image:     'docker.io/library/node:20-slim',
  build_cmd: 'npm run build',
  start_cmd: 'npm start',
  port:      3000,
  project_dir: REPO_DIR,
  timeout:   300,
};

let _logSink: LogSink | null = null;
function log(msg: string): void {
  console.log(`[SUITE] [BUILD] ${msg}`);
  if (_logSink) _logSink({ suite: 'build', msg });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

function errorOutput(error: any): string {
  return String(`${error?.stderr || ''}${error?.stdout || ''}` || errorMessage(error));
}

function requireCanonicalImageRef(image: unknown, field = 'serve.image'): string {
  const ref = String(image || '').trim();
  const validation = validateBaseImageRef(ref);
  if (validation.ok) return validation.value;
  throw new Error(`${field} must be a fully qualified image reference with registry/namespace; shorthand image names are not supported (${validation.reason})`);
}

function validateDockerfileFromImages(dockerfilePath: string): Finding[] {
  const findings: Finding[] = [];
  const text = fs.readFileSync(dockerfilePath, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i]?.match(/^\s*FROM\s+(?:--platform=\S+\s+)?([^\s]+)/i);
    if (!match) continue;
    const imageRef = match[1];
    if (!imageRef || imageRef.startsWith('$')) {
      findings.push(createFinding(SEVERITY.CRITICAL, `Dockerfile FROM at line ${i + 1} must use a literal fully qualified image reference`, { rule: 'dockerfile-from-image' }));
      continue;
    }
    const validation = validateBaseImageRef(imageRef);
    if (!validation.ok) {
      findings.push(createFinding(SEVERITY.CRITICAL, `Dockerfile FROM "${imageRef}" at line ${i + 1} must be fully qualified with registry/namespace (${validation.reason})`, { rule: 'dockerfile-from-image' }));
    }
  }
  return findings;
}

function parseErrors(output: string, source = 'stderr'): Finding[] {
  if (!output || !output.trim()) return [];

  const findings: Finding[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/image not known|no such image|manifest unknown/i.test(trimmed)) findings.push(createFinding(SEVERITY.CRITICAL, trimmed, { rule: 'image-unavailable' }));
    else if (/error TS\d+:/i.test(trimmed)) findings.push(createFinding(SEVERITY.CRITICAL, trimmed, { rule: 'typescript' }));
    else if (/npm ERR!/i.test(trimmed)) findings.push(createFinding(SEVERITY.CRITICAL, trimmed, { rule: 'npm' }));
    else if (/SyntaxError|ReferenceError|TypeError/i.test(trimmed)) findings.push(createFinding(SEVERITY.CRITICAL, trimmed, { rule: 'runtime' }));
    else if (/ModuleNotFoundError|ImportError/i.test(trimmed)) findings.push(createFinding(SEVERITY.CRITICAL, trimmed, { rule: 'python-import' }));
    else if (/ERROR:|Error:/i.test(trimmed)) findings.push(createFinding(SEVERITY.CRITICAL, trimmed, { rule: source }));
  }

  if (findings.length === 0) {
    const truncated = output.trim().slice(0, 1000);
    findings.push(createFinding(SEVERITY.CRITICAL, truncated, { rule: source }));
  }

  return findings.slice(0, 20);
}

function dockerfileFromImages(dockerfilePath: string): string[] {
  const text = fs.readFileSync(dockerfilePath, 'utf8');
  const images: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*FROM\s+(?:--platform=\S+\s+)?([^\s]+)/i);
    if (match?.[1] && !match[1].startsWith('$')) images.push(match[1]);
  }
  return [...new Set(images)];
}

async function ensureDockerfileBaseImagesCached(dockerfilePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const imageRef of dockerfileFromImages(dockerfilePath)) {
    if (imageRef.startsWith('localhost/')) continue;
    try {
      await execFileAsync('podman', ['image', 'exists', imageRef], { timeout: 5000, encoding: 'utf8', env: buildSubprocessEnv() });
    } catch (_existsError) {
      log(`Base image missing locally, pulling before build: ${imageRef}`);
      try {
        await execFileAsync('podman', ['pull', imageRef], { timeout: 300000, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, env: buildSubprocessEnv() });
      } catch (pullError) {
        const output = errorOutput(pullError);
        findings.push(createFinding(
          SEVERITY.CRITICAL,
          `Dockerfile base image "${imageRef}" is not available locally and automatic pull failed: ${output.trim().slice(0, 1000) || errorMessage(pullError)}`,
          { rule: 'dockerfile-base-image' },
        ));
      }
    }
  }
  return findings;
}

function unquoteYamlScalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function parseSimpleYamlDocument(content: string): AnyRecord {
  const doc: AnyRecord = {};
  const kindMatch = content.match(/^\s*kind:\s*([^\n#]+)/m);
  if (kindMatch) doc.kind = unquoteYamlScalar(kindMatch[1] || '');
  const metadataNameMatch = content.match(/^\s*metadata:\s*\n(?:\s+[^\n]*\n)*?\s+name:\s*([^\n#]+)/m);
  if (metadataNameMatch) doc.metadata = { name: unquoteYamlScalar(metadataNameMatch[1] || '') };
  if (doc.kind === 'Secret') {
    const data: AnyRecord = {};
    const dataMatch = content.match(/^\s*data:\s*\n([\s\S]*?)(?=^\S|$)/m);
    for (const line of (dataMatch?.[1] || '').split(/\r?\n/)) {
      const match = line.match(/^\s+([A-Za-z0-9_.-]+):\s*([^\n#]+)/);
      if (match) data[match[1]] = unquoteYamlScalar(match[2] || '');
    }
    doc.data = data;
  }
  const env: AnyRecord[] = [];
  const secretRefRe = /-\s+name:\s*([^\n#]+)\s*\n\s+valueFrom:\s*\n\s+secretKeyRef:\s*\n\s+name:\s*([^\n#]+)\s*\n\s+key:\s*([^\n#]+)/g;
  for (const match of content.matchAll(secretRefRe)) {
    env.push({
      name: unquoteYamlScalar(match[1] || ''),
      valueFrom: {
        secretKeyRef: {
          name: unquoteYamlScalar(match[2] || ''),
          key: unquoteYamlScalar(match[3] || ''),
        },
      },
    });
  }
  if (env.length > 0) {
    doc.spec = { template: { spec: { containers: [{ env }] } } };
  }
  return doc;
}

async function loadYamlDocument(content: string): Promise<AnyRecord> {
  try {
    // @ts-expect-error Optional runtime dependency declaration is not installed for this migration island.
    const jsYaml = await import('js-yaml');
    return (jsYaml.default?.load(content) ?? jsYaml.load(content) ?? {}) as AnyRecord;
  } catch (error) {
    if (!String(errorMessage(error)).includes('Cannot find package')) throw error;
    return parseSimpleYamlDocument(content);
  }
}

async function extractEnvFromManifest(deploymentYamlPath: string, secretYamlPath: string | null): Promise<EnvExtractionResult> {
  const findings: Finding[] = [];
  if (!fs.existsSync(deploymentYamlPath)) {
    return { ok: false, env: [], findings: [createFinding(SEVERITY.CRITICAL, `serve.deployment_yaml not found: ${deploymentYamlPath}`, { rule: 'serve-deployment-yaml' })] };
  }

  let doc: any;
  try {
    doc = await loadYamlDocument(fs.readFileSync(deploymentYamlPath, 'utf8'));
  } catch (error) {
    return { ok: false, env: [], findings: [createFinding(SEVERITY.CRITICAL, `serve.deployment_yaml could not be parsed: ${errorMessage(error)}`, { rule: 'serve-deployment-yaml' })] };
  }

  const containers = Array.isArray(doc?.spec?.template?.spec?.containers) ? doc.spec.template.spec.containers : [];
  const envEntries: AnyRecord[] = [];
  for (const container of containers) {
    if (Array.isArray(container?.env)) envEntries.push(...container.env);
  }

  const secretRefs = envEntries
    .map((entry) => entry?.valueFrom?.secretKeyRef)
    .filter((ref) => ref?.name && ref?.key);

  let secretName = '';
  let secretData: AnyRecord = {};
  let secretLoaded = false;
  if (secretRefs.length > 0) {
    if (!secretYamlPath) {
      findings.push(createFinding(SEVERITY.CRITICAL, 'serve.secret_yaml is required when deployment env uses secretKeyRef', { rule: 'serve-secret-yaml-required' }));
    } else if (!fs.existsSync(secretYamlPath)) {
      findings.push(createFinding(SEVERITY.CRITICAL, `serve.secret_yaml not found: ${secretYamlPath}`, { rule: 'serve-secret-yaml' }));
    } else {
      try {
        const secretDoc = await loadYamlDocument(fs.readFileSync(secretYamlPath, 'utf8'));
        secretName = String(secretDoc?.metadata?.name || '');
        secretData = secretDoc?.data || {};
        secretLoaded = true;
      } catch (error) {
        findings.push(createFinding(SEVERITY.CRITICAL, `serve.secret_yaml could not be parsed: ${errorMessage(error)}`, { rule: 'serve-secret-yaml' }));
      }
    }
  }

  const result: Array<{ name: string; value: string }> = [];
  for (const entry of envEntries) {
    if (!entry?.name) continue;
    if (entry.value !== undefined) {
      result.push({ name: String(entry.name), value: String(entry.value) });
      continue;
    }

    const ref = entry.valueFrom?.secretKeyRef;
    if (!ref) continue;
    if (secretLoaded && String(ref.name) !== secretName) {
      findings.push(createFinding(SEVERITY.CRITICAL, `Secret ref ${ref.name}.${ref.key} is not covered by serve.secret_yaml ${secretName || '(unnamed)'}`, { rule: 'serve-secret-ref' }));
      continue;
    }
    const encoded = secretData[ref.key];
    if (!encoded) {
      findings.push(createFinding(SEVERITY.CRITICAL, `Secret ref ${ref.name}.${ref.key} not found in serve.secret_yaml`, { rule: 'serve-secret-ref' }));
      continue;
    }
    try {
      result.push({ name: String(entry.name), value: Buffer.from(String(encoded), 'base64').toString('utf8') });
    } catch (error) {
      findings.push(createFinding(SEVERITY.CRITICAL, `Secret ref ${ref.name}.${ref.key} is not valid base64: ${errorMessage(error)}`, { rule: 'serve-secret-ref' }));
    }
  }

  return { ok: findings.length === 0, env: result, findings };
}

async function buildStatic(config: AnyRecord): Promise<BuildResult> {
  let image: string;
  try {
    image = requireCanonicalImageRef(config.image || DEFAULTS.image);
  } catch (error) {
    return { ok: false, findings: [createFinding(SEVERITY.CRITICAL, errorMessage(error), { rule: 'serve-image' })], output: errorMessage(error) };
  }

  const buildCmd = config.build_cmd || DEFAULTS.build_cmd;
  const projectDir = resolveRepoScopedPath(config.project_dir || DEFAULTS.project_dir, { field: 'build.project_dir' }) || DEFAULTS.project_dir;
  const timeout = (config.timeout || DEFAULTS.timeout) * 1000;

  log(`Static build: image=${image} cmd="${buildCmd}" dir=${projectDir}`);

  try {
    const { stdout, stderr } = await execFileAsync('sandbox-build', [image, projectDir, buildCmd], { timeout, encoding: 'utf8', env: buildSubprocessEnv() });
    if (stdout) log(stdout.trim());
    if (stderr) log(`stderr: ${stderr.trim().slice(0, 200)}`);
  } catch (error) {
    const output = errorOutput(error);
    return { ok: false, findings: parseErrors(output), output };
  }

  const wwwDir = '/sandbox/www';
  if (!fs.existsSync(wwwDir) || fs.readdirSync(wwwDir).length === 0) {
    return { ok: false, findings: [createFinding(SEVERITY.CRITICAL, `Build output empty: ${wwwDir}`, { rule: 'build-output' })], output: '' };
  }

  log('Starting nginx on :9999...');
  try {
    const pidFile = '/run/nginx.pid';
    let running = false;
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
        process.kill(pid, 0);
        running = true;
      } catch (_error) {
        log('Stale nginx pid file ignored');
      }
    }
    if (running) await execFileAsync('nginx', ['-s', 'reload'], { timeout: 10000, encoding: 'utf8', env: buildSubprocessEnv() });
    else await execFileAsync('nginx', [], { timeout: 10000, encoding: 'utf8', env: buildSubprocessEnv() });
  } catch (error: any) {
    return { ok: false, findings: [createFinding(SEVERITY.CRITICAL, `nginx start failed: ${errorMessage(error)}`, { rule: 'nginx' })], output: String(error?.stderr || '') };
  }

  let outputSize = 'unknown';
  try {
    const { stdout } = await execFileAsync('du', ['-sh', '/sandbox/www/'], { encoding: 'utf8', env: buildSubprocessEnv() });
    outputSize = stdout.trim().split(/\s+/)[0] || 'unknown';
  } catch (error) {
    log(`non-blocking output-size probe failed: ${errorMessage(error)}`);
  }

  log(`Build OK. Output: /sandbox/www/ (${outputSize})`);
  return { ok: true, findings: [], output: '', outputSize };
}

function normaliseStartCmd(cmd: string, projectDir: string): string {
  if (!cmd || !projectDir) return cmd;
  let normalised = cmd;
  const rawDir = stripRepoDirPrefix(projectDir, REPO_DIR);
  if (rawDir) {
    normalised = normalised.replace(new RegExp(`cd\\s+${rawDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`), 'cd /src/');
    normalised = normalised.replace(new RegExp(`cd\\s+${projectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`), 'cd /src/');
  }
  return normalised;
}

async function buildServer(config: AnyRecord, context: BuildContext): Promise<BuildResult> {
  let image: string;
  try {
    image = requireCanonicalImageRef(config.image || DEFAULTS.image);
  } catch (error) {
    return { ok: false, findings: [createFinding(SEVERITY.CRITICAL, errorMessage(error), { rule: 'serve-image' })], output: errorMessage(error) };
  }

  const startCmd = config.start_cmd || DEFAULTS.start_cmd;
  const port = config.port || DEFAULTS.port;
  const timeout = (config.timeout || DEFAULTS.timeout) * 1000;
  const rawProjectDir = config.project_dir || DEFAULTS.project_dir;
  const projectDir = resolveRepoScopedPath(rawProjectDir, { field: 'serve.project_dir' }) || DEFAULTS.project_dir;
  const containerName = `sb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let runImage = image;
  let useVolume = true;

  log(`Server start: image=${image} cmd="${startCmd}" port=${port} project=${projectDir}`);

  if (config.dockerfile) {
    const dockerfile = resolveRepoScopedPath(config.dockerfile, { field: 'serve.dockerfile' });
    if (!dockerfile) return { ok: false, findings: [createFinding(SEVERITY.CRITICAL, 'serve.dockerfile is invalid', { rule: 'serve-dockerfile' })], output: '' };
    const dockerfileImageFindings = validateDockerfileFromImages(dockerfile);
    if (dockerfileImageFindings.length > 0) {
      const output = dockerfileImageFindings.map((finding) => finding.message).join('\n');
      return { ok: false, findings: dockerfileImageFindings, output };
    }
    const baseImageFindings = await ensureDockerfileBaseImagesCached(dockerfile);
    if (baseImageFindings.length > 0) {
      const output = baseImageFindings.map((finding) => finding.message).join('\n');
      return { ok: false, findings: baseImageFindings, output };
    }
    const buildContext = config.build_context ? resolveRepoScopedPath(config.build_context, { field: 'serve.build_context' }) : path.dirname(dockerfile);
    const buildTimeout = (config.build_timeout || 300) * 1000;
    const imageTag = config.image || `localhost/build-${containerName}`;

    if (!config.image) trackSandboxResources(context.payload || {}, { images: [imageTag] });
    log(`Dockerfile build: file=${dockerfile} context=${buildContext} tag=${imageTag}`);

    try {
      const { stdout } = await execFileAsync('podman', [
        'build',
        ...buildCleanupPodmanLabelArgs(context.payload || {}),
        '--pull=never',
        '-t', imageTag,
        '-f', dockerfile,
        buildContext,
      ], { timeout: buildTimeout, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, env: buildSubprocessEnv() });
      if (stdout) log(stdout.trim().split('\n').slice(-3).join('\n'));
      runImage = imageTag;
      useVolume = false;
    } catch (error) {
      const output = errorOutput(error);
      return { ok: false, findings: parseErrors(output, 'dockerfile-build'), output };
    }
  }

  trackSandboxResources(context.payload || {}, { containers: [containerName] });
  const normalisedCmd = normaliseStartCmd(startCmd, rawProjectDir);
  const args = [
    'run', '-d',
    '--name', containerName,
    ...buildCleanupPodmanLabelArgs(context.payload || {}),
    '--network', 'host',
    '--memory', '2g',
    '--cpus', '2',
    '--pids-limit', '256',
    '--tmpfs', '/tmp:size=512m',
    '-v', '/sandbox:/sandbox:rw',
    '-e', 'SANDBOX=true',
    '-e', 'NODE_ENV=test',
  ];

  if (config.deployment_yaml) {
    const deploymentYamlPath = resolveRepoScopedPath(config.deployment_yaml, { field: 'serve.deployment_yaml' });
    if (!deploymentYamlPath) return { ok: false, findings: [createFinding(SEVERITY.CRITICAL, 'serve.deployment_yaml is invalid', { rule: 'serve-deployment-yaml' })], output: '' };
    const secretYamlPath = config.secret_yaml ? resolveRepoScopedPath(config.secret_yaml, { field: 'serve.secret_yaml' }) : null;
    const injectedEnv = await extractEnvFromManifest(deploymentYamlPath, secretYamlPath);
    if (!injectedEnv.ok) return { ok: false, findings: injectedEnv.findings, output: injectedEnv.findings.map((finding) => finding.message).join('\n') };
    if (injectedEnv.env.length > 0) {
      log(`Injecting ${injectedEnv.env.length} env vars from deployment manifest`);
      for (const { name, value } of injectedEnv.env) args.push('-e', `${name}=${value}`);
    }
  }

  if (useVolume) args.push('-v', `${projectDir}:/src:rw`, '--workdir', '/src');
  args.push(runImage, 'sh', '-c', normalisedCmd);

  log(`podman ${useVolume ? '(volume mount)' : '(baked image)'}: ${normalisedCmd.slice(0, 120)}`);

  try {
    const { stdout } = await execFileAsync('podman', args, { timeout, encoding: 'utf8', env: buildSubprocessEnv() });
    if (stdout) log(`Container started: ${stdout.trim().slice(0, 12)}`);
  } catch (error) {
    const output = errorOutput(error);
    return { ok: false, findings: parseErrors(output), output };
  }

  log('Waiting 3s for crash detection...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    const { stdout } = await execFileAsync('podman', ['ps', '--filter', `name=${containerName}`, '--format', '{{.Names}}'], { encoding: 'utf8', timeout: 5000, env: buildSubprocessEnv() });
    if (!stdout || !stdout.includes(containerName)) {
      let crashLogs = '';
      try {
        const { stdout: logsOut, stderr: logsErr } = await execFileAsync('podman', ['logs', containerName], { encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024, env: buildSubprocessEnv() });
        crashLogs = `${logsOut || ''}${logsErr || ''}`.trim().split('\n').slice(-30).join('\n');
      } catch (error) {
        log(`non-blocking crash-log capture failed: ${errorMessage(error)}`);
      }
      return { ok: false, findings: parseErrors(crashLogs || `Server process exited within 3s (port ${port})`, 'server-crash'), output: crashLogs };
    }
  } catch (error) {
    log(`non-blocking crash-detection probe failed: ${errorMessage(error)}`);
  }

  log(`Server running on port ${port} (container: ${containerName})`);
  return { ok: true, findings: [], output: '', port };
}

export default async function buildSuite(context: BuildContext): Promise<SuiteVerdict> {
  _logSink = context.logSink || null;
  const startTime = Date.now();
  const serve = context.config?.serve || {};
  const type = serve.type || DEFAULTS.type;
  const result = type === 'server' ? await buildServer(serve, context) : await buildStatic(serve);
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
        ...(serve.image ? { image: String(serve.image) } : {}),
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
