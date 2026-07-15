import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
  containerPort?: number;
}

interface EnvExtractionResult {
  ok: boolean;
  env: Array<{ name: string; value: string }>;
  findings: Finding[];
}

interface NormalizedServeConfig extends AnyRecord {
  type: 'static' | 'server';
  image: string;
  configured_image: boolean;
  build_cmd: string;
  start_cmd: string;
  port: number;
  project_dir: string;
  timeout: number;
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

export function buildDockerfileBuildCleanupLabelArgs(configuredImage: boolean, payload: AnyRecord = {}): string[] {
  return configuredImage ? [] : buildCleanupPodmanLabelArgs(payload);
}

let _logSink: LogSink | null = null;
function log(msg: string): void {
  console.log(`[SUITE] [BUILD] ${msg}`);
  if (_logSink) _logSink({ suite: 'build', msg });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error === undefined) return 'error_detail_missing';
  if (error === null) return 'error_detail_null';
  return String(error);
}

function errorOutput(error: any): string {
  const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
  const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
  const output = `${stderr}${stdout}`;
  return output ? output : errorMessage(error);
}

function requireCanonicalImageRef(image: unknown, field = 'serve.image'): string {
  if (selectTruthyValue(() => (typeof image !== 'string'), () => (!image.trim()))) {
    throw new Error(`${field} must be a non-empty fully qualified image reference`);
  }
  const ref = image.trim();
  const validation = validateBaseImageRef(ref);
  if (validation.ok) return validation.value;
  throw new Error(`${field} must be a fully qualified image reference with registry/namespace; shorthand image names are not supported (${validation.reason})`);
}

function requireContainerPort(value: unknown, field = 'serve.port'): number {
  const port = typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!Number.isInteger(port)), () => (port < 1))), () => (port > 65535))) {
    throw new Error(`${field} must be an integer between 1 and 65535`);
  }
  return port;
}

export function buildPodmanPublishArgs(containerPort: number): string[] {
  requireContainerPort(containerPort);
  return ['-p', `127.0.0.1::${containerPort}/tcp`];
}

export function parsePodmanMappedHostPort(output: string, containerPort: number): number {
  requireContainerPort(containerPort);
  const text = String(output).trim();
  const patterns = [
    new RegExp(`(?:0\\.0\\.0\\.0|127\\.0\\.0\\.1|::):([0-9]+)->${containerPort}/tcp`),
    /(?:0\.0\.0\.0|127\.0\.0\.1|::):([0-9]+)$/,
    /^([0-9]+)$/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const port = Number(match[1]);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) return port;
  }
  throw new Error(`podman did not report a mapped host port for ${containerPort}/tcp`);
}

function validateDockerfileFromImages(dockerfilePath: string): Finding[] {
  const findings: Finding[] = [];
  const text = fs.readFileSync(dockerfilePath, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i]?.match(/^\s*FROM\s+(?:--platform=\S+\s+)?([^\s]+)/i);
    if (!match) continue;
    const imageRef = match[1];
    if (selectTruthyValue(() => (!imageRef), () => (imageRef.startsWith('$')))) {
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
  if (selectTruthyValue(() => (!output), () => (!output.trim()))) return [];

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
          `Dockerfile base image "${imageRef}" is not available locally and automatic pull failed: ${selectTruthyValue(() => (output.trim().slice(0, 1000)), () => (errorMessage(pullError)))}`,
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

function normalizeServeConfig(config: AnyRecord | undefined): NormalizedServeConfig {
  const serve = selectDefinedValue(() => (config), () => ({}));
  const type = serve.type === 'server' ? 'server' : 'static';
  const projectDirInput = typeof serve.project_dir === 'string' && serve.project_dir.trim()
    ? serve.project_dir
    : DEFAULTS.project_dir;
  const configuredImage = typeof serve.image === 'string' && serve.image.trim();
  return {
    ...serve,
    type,
    image: configuredImage ? serve.image : DEFAULTS.image,
    configured_image: Boolean(configuredImage),
    build_cmd: typeof serve.build_cmd === 'string' && serve.build_cmd.trim() ? serve.build_cmd : DEFAULTS.build_cmd,
    start_cmd: typeof serve.start_cmd === 'string' && serve.start_cmd.trim() ? serve.start_cmd : DEFAULTS.start_cmd,
    port: requireContainerPort(serve.port === undefined ? DEFAULTS.port : serve.port),
    project_dir: selectDefinedValue(() => (resolveRepoScopedPath(projectDirInput, { field: 'serve.project_dir' })), () => (DEFAULTS.project_dir)),
    timeout: Number.isFinite(serve.timeout) ? Number(serve.timeout) : DEFAULTS.timeout,
  };
}

function parseSimpleYamlDocument(content: string): AnyRecord {
  const doc: AnyRecord = {};
  const kindMatch = content.match(/^\s*kind:\s*([^\n#]+)/m);
  if (kindMatch?.[1]) doc.kind = unquoteYamlScalar(kindMatch[1]);
  const metadataNameMatch = content.match(/^\s*metadata:\s*\n(?:\s+[^\n]*\n)*?\s+name:\s*([^\n#]+)/m);
  if (metadataNameMatch?.[1]) doc.metadata = { name: unquoteYamlScalar(metadataNameMatch[1]) };
  if (doc.kind === 'Secret') {
    const data: AnyRecord = {};
    const dataMatch = content.match(/^\s*data:\s*\n([\s\S]*?)(?=^\S|$)/m);
    const dataBlock = dataMatch?.[1];
    for (const line of dataBlock === undefined ? [] : dataBlock.split(/\r?\n/)) {
      const match = line.match(/^\s+([A-Za-z0-9_.-]+):\s*([^\n#]+)/);
      if (match?.[1] && match[2]) data[match[1]] = unquoteYamlScalar(match[2]);
    }
    doc.data = data;
  }
  const env: AnyRecord[] = [];
  const secretRefRe = /-\s+name:\s*([^\n#]+)\s*\n\s+valueFrom:\s*\n\s+secretKeyRef:\s*\n\s+name:\s*([^\n#]+)\s*\n\s+key:\s*([^\n#]+)/g;
  for (const match of content.matchAll(secretRefRe)) {
    if (selectTruthyValue(() => (selectTruthyValue(() => (!match[1]), () => (!match[2]))), () => (!match[3]))) continue;
    env.push({
      name: unquoteYamlScalar(match[1]),
      valueFrom: {
        secretKeyRef: {
          name: unquoteYamlScalar(match[2]),
          key: unquoteYamlScalar(match[3]),
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
    const loader = selectDefinedValue(() => (jsYaml.default?.load), () => (jsYaml.load));
    const parsed = loader(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as AnyRecord : {};
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
        if (selectTruthyValue(() => (typeof secretDoc?.metadata?.name !== 'string'), () => (!secretDoc.metadata.name.trim()))) {
          findings.push(createFinding(SEVERITY.CRITICAL, 'serve.secret_yaml metadata.name is required', { rule: 'serve-secret-yaml' }));
        } else {
          secretName = secretDoc.metadata.name;
        }
        secretData = secretDoc?.data && typeof secretDoc.data === 'object' ? secretDoc.data : {};
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
      const loadedSecretName = secretName.trim() ? secretName : 'secret_name_missing';
      findings.push(createFinding(SEVERITY.CRITICAL, `Secret ref ${ref.name}.${ref.key} is not covered by serve.secret_yaml ${loadedSecretName}`, { rule: 'serve-secret-ref' }));
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

async function buildStatic(config: NormalizedServeConfig): Promise<BuildResult> {
  let image: string;
  try {
    image = requireCanonicalImageRef(config.image);
  } catch (error) {
    return { ok: false, findings: [createFinding(SEVERITY.CRITICAL, errorMessage(error), { rule: 'serve-image' })], output: errorMessage(error) };
  }

  const buildCmd = config.build_cmd;
  const projectDir = config.project_dir;
  const timeout = config.timeout * 1000;

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
  if (selectTruthyValue(() => (!fs.existsSync(wwwDir)), () => (fs.readdirSync(wwwDir).length === 0))) {
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
    const output = typeof error?.stderr === 'string' ? error.stderr : '';
    return { ok: false, findings: [createFinding(SEVERITY.CRITICAL, `nginx start failed: ${errorMessage(error)}`, { rule: 'nginx' })], output };
  }

  let outputSize = 'missing_build_output_size';
  try {
    const { stdout } = await execFileAsync('du', ['-sh', '/sandbox/www/'], { encoding: 'utf8', env: buildSubprocessEnv() });
    outputSize = selectTruthyValue(() => (stdout.trim().split(/\s+/)[0]), () => ('missing_build_output_size'));
  } catch (error) {
    log(`non-blocking output-size probe failed: ${errorMessage(error)}`);
  }

  log(`Build OK. Output: /sandbox/www/ (${outputSize})`);
  return { ok: true, findings: [], output: '', outputSize };
}

function normaliseStartCmd(cmd: string, projectDir: string): string {
  if (selectTruthyValue(() => (!cmd), () => (!projectDir))) return cmd;
  let normalised = cmd;
  const rawDir = stripRepoDirPrefix(projectDir, REPO_DIR);
  if (rawDir) {
    normalised = normalised.replace(new RegExp(`cd\\s+${rawDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`), 'cd /src/');
    normalised = normalised.replace(new RegExp(`cd\\s+${projectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`), 'cd /src/');
  }
  return normalised;
}

async function buildServer(config: NormalizedServeConfig, context: BuildContext): Promise<BuildResult> {
  let image: string;
  try {
    image = requireCanonicalImageRef(config.image);
  } catch (error) {
    return { ok: false, findings: [createFinding(SEVERITY.CRITICAL, errorMessage(error), { rule: 'serve-image' })], output: errorMessage(error) };
  }

  const startCmd = config.start_cmd;
  let port: number;
  try {
    port = requireContainerPort(config.port);
  } catch (error) {
    return { ok: false, findings: [createFinding(SEVERITY.CRITICAL, errorMessage(error), { rule: 'serve-port' })], output: errorMessage(error) };
  }
  const timeout = config.timeout * 1000;
  const rawProjectDir = config.project_dir;
  const projectDir = config.project_dir;
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
    const buildTimeout = (Number.isFinite(config.build_timeout) ? Number(config.build_timeout) : DEFAULTS.timeout) * 1000;
    const imageTag = config.configured_image ? config.image : `localhost/build-${containerName}`;

    if (!config.configured_image) trackSandboxResources(selectDefinedValue(() => (context.payload), () => ({})), { images: [imageTag] });
    log(`Dockerfile build: file=${dockerfile} context=${buildContext} tag=${imageTag}`);

    try {
      const { stdout } = await execFileAsync('podman', [
        'build',
        ...buildDockerfileBuildCleanupLabelArgs(config.configured_image, selectDefinedValue(() => (context.payload), () => ({}))),
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

  trackSandboxResources(selectDefinedValue(() => (context.payload), () => ({})), { containers: [containerName] });
  const normalisedCmd = normaliseStartCmd(startCmd, rawProjectDir);
  const args = [
    'run', '-d',
    '--name', containerName,
    ...buildCleanupPodmanLabelArgs(selectDefinedValue(() => (context.payload), () => ({}))),
    ...buildPodmanPublishArgs(port),
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

  let hostPort: number;
  try {
    const { stdout } = await execFileAsync('podman', ['port', containerName, `${port}/tcp`], { encoding: 'utf8', timeout: 5000, env: buildSubprocessEnv() });
    hostPort = parsePodmanMappedHostPort(stdout, port);
  } catch (error) {
    const output = errorOutput(error);
    return { ok: false, findings: parseErrors(serverPortErrorOutput(output, error), 'server-port'), output };
  }

  log('Waiting 3s for crash detection...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    const { stdout } = await execFileAsync('podman', ['ps', '--filter', `name=${containerName}`, '--format', '{{.Names}}'], { encoding: 'utf8', timeout: 5000, env: buildSubprocessEnv() });
    if (selectTruthyValue(() => (!stdout), () => (!stdout.includes(containerName)))) {
      let crashLogs = '';
      try {
        const { stdout: logsOut, stderr: logsErr } = await execFileAsync('podman', ['logs', containerName], { encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024, env: buildSubprocessEnv() });
        crashLogs = `${logsOut}${logsErr}`.trim().split('\n').slice(-30).join('\n');
      } catch (error) {
        log(`non-blocking crash-log capture failed: ${errorMessage(error)}`);
      }
      const crashDetail = crashLogs.trim() ? crashLogs : `Server process exited within 3s (port ${port})`;
      return { ok: false, findings: parseErrors(crashDetail, 'server-crash'), output: crashLogs };
    }
  } catch (error) {
    log(`non-blocking crash-detection probe failed: ${errorMessage(error)}`);
  }

  log(`Server running on host port ${hostPort} -> container port ${port} (container: ${containerName})`);
  return { ok: true, findings: [], output: '', port: hostPort, containerPort: port };
}

function serverPortErrorOutput(output: string, error: unknown): string {
  if (typeof output === 'string' && output.length > 0) return output;
  return errorMessage(error);
}

export default async function buildSuite(context: BuildContext): Promise<SuiteVerdict> {
  _logSink = selectTruthyValue(() => (context.logSink), () => (null));
  const startTime = Date.now();
  const serve = normalizeServeConfig(context.config?.serve);
  const type = serve.type;
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
        image: serve.image,
        ...(result.outputSize ? { output_size: result.outputSize } : {}),
        ...(result.port ? { port: result.port } : {}),
        ...(result.containerPort ? { container_port: result.containerPort } : {}),
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
      raw_output: result.output.slice(0, 2000),
    },
  });
}
