import { selectDefinedValue } from '../optional-absence.ts';
// The build suite is a thin adapter over the canonical BuildKit + leased
// namespace k8s suite. It never runs workloads in the Buster pod.
import fs from 'fs';
import path from 'path';
import { createFinding, createSuiteVerdict, SEVERITY, STATUS } from '../services/verdict-schema.ts';
import type { SuiteVerdict } from '../services/verdict-schema.ts';
import { validateImageReference } from '../services/image-reference.ts';
import k8sSuite from './k8s.ts';
import { startServicePortForward } from './k8s-port-forward.ts';
import { buildK8sCommandEnv } from './k8s-command-env.ts';
import { resolveRepoScopedPath } from './repo-paths.ts';
import { createSuiteLog } from './support.ts';

type AnyRecord = Record<string, any>;
type BuildContext = {
  payload?: AnyRecord;
  logSink?: ((entry: any, message?: string) => void) | null;
  config?: { serve?: AnyRecord };
  repoRoot?: string;
  registerRuntimeCleanup?: (cleanup: () => Promise<void> | void) => void;
};

interface PreparedBuild {
  input: AnyRecord;
  repoRoot: string;
  type: string;
  port: number;
  projectDir: string;
  imageName: string;
  serviceName: string;
  dockerfile: string;
  manifests: string[];
}

class BuildPreparationError extends Error {
  readonly rule: string;

  constructor(message: string, rule: string) {
    super(message);
    this.rule = rule;
  }
}

const DEFAULTS = Object.freeze({
  type: 'static',
  image: 'docker.io/library/node:20-slim',
  build_cmd: 'npm run build',
  start_cmd: 'npm start',
  port: 3000,
  project_dir: '.',
  timeout: 300,
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function requirePort(value: unknown): number {
  const port = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('serve.port must be an integer between 1 and 65535');
  return Number(port);
}

function requireImage(value: unknown): string {
  const result = validateImageReference(value);
  if (result.ok) return result.value;
  throw new Error(`serve.image must be a fully qualified image reference (${result.reason})`);
}

export function validateDockerfileFromImages(dockerfilePath: string): string[] {
  const findings: string[] = [];
  const stages = new Set<string>();
  for (const [index, line] of fs.readFileSync(dockerfilePath, 'utf8').split(/\r?\n/).entries()) {
    const match = line.match(/^\s*FROM\s+(?:--platform=\S+\s+)?([^\s]+)(?:\s+AS\s+([^\s]+))?/i);
    if (!match?.[1]) continue;
    const image = match[1];
    if (image.startsWith('$')) {
      findings.push(`Dockerfile FROM "${image}" at line ${index + 1} may not use agent-controlled build arguments`);
    } else if (!stages.has(image.toLowerCase())) {
      const result = validateImageReference(image);
      if (!result.ok) findings.push(`Dockerfile FROM "${image}" at line ${index + 1} must be fully qualified with registry/namespace (${result.reason})`);
    }
    if (match[2]) stages.add(match[2].toLowerCase());
  }
  return findings;
}

function referencedSecretNames(deploymentPath: string): string[] {
  const content = fs.readFileSync(deploymentPath, 'utf8');
  return [...content.matchAll(/secretKeyRef:\s*\n\s+name:\s*['"]?([^\s'"#]+)/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}

function declaredSecretName(secretPath: string): string | null {
  const content = fs.readFileSync(secretPath, 'utf8');
  const match = content.match(/kind:\s*Secret[\s\S]*?metadata:\s*\n\s+name:\s*['"]?([^\s'"#]+)/);
  return match?.[1] ?? null;
}

function validateSecretAuthority(serve: AnyRecord): string | null {
  if (!serve.deployment_yaml || !serve.secret_yaml) return null;
  const deploymentPath = resolveRepoScopedPath(serve.deployment_yaml, { field: 'serve.deployment_yaml' });
  const secretPath = resolveRepoScopedPath(serve.secret_yaml, { field: 'serve.secret_yaml' });
  if (!deploymentPath || !secretPath) return 'serve deployment or secret path is invalid';
  const declared = declaredSecretName(secretPath);
  const missing = referencedSecretNames(deploymentPath).find((name) => name !== declared);
  return missing ? `Secret ref ${missing}.TOKEN is not covered by serve.secret_yaml ${declared ?? 'secret_name_missing'}` : null;
}

function generatedDockerfile(serve: AnyRecord, image: string, type: string): string {
  if (type === 'server') {
    return [
      `FROM ${image}`,
      'WORKDIR /app',
      'COPY . .',
      `EXPOSE ${serve.port}`,
      `CMD ["sh", "-c", ${JSON.stringify(serve.start_cmd)}]`,
      '',
    ].join('\n');
  }
  return [
    `FROM ${image} AS build`,
    'WORKDIR /src',
    'COPY . .',
    `RUN ${serve.build_cmd}`,
    "RUN mkdir -p /output && if [ -d dist ]; then cp -a dist/. /output/; elif [ -d build ]; then cp -a build/. /output/; elif [ -d out ]; then cp -a out/. /output/; else echo 'no static build output directory (dist, build, out)' >&2; exit 1; fi",
    'FROM docker.io/library/nginx:1.27-alpine',
    'COPY --from=build /output/ /usr/share/nginx/html/',
    'EXPOSE 80',
    '',
  ].join('\n');
}

function generatedManifest(imageName: string, serviceName: string, port: number): string {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${serviceName}
spec:
  replicas: 1
  selector:
    matchLabels: { app: ${serviceName} }
  template:
    metadata:
      labels: { app: ${serviceName} }
    spec:
      containers:
        - name: app
          image: ${imageName}:candidate
          ports:
            - containerPort: ${port}
---
apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
spec:
  selector: { app: ${serviceName} }
  ports:
    - port: ${port}
      targetPort: ${port}
`;
}

function failure(startedAt: number, message: string, rule: string): SuiteVerdict {
  return createSuiteVerdict('build', STATUS.FAIL, {
    critical: true,
    duration_ms: Date.now() - startedAt,
    checks_total: 1,
    checks_passed: 0,
    checks_failed: 1,
    findings: [createFinding(SEVERITY.CRITICAL, message, { rule })],
  });
}

function requireScopedPath(value: unknown, options: AnyRecord, rule: string, message: string): string {
  const resolved = resolveRepoScopedPath(value, options);
  if (!resolved) throw new BuildPreparationError(message, rule);
  return resolved;
}

function prepareDockerfile(input: AnyRecord, tempDir: string, image: string, type: string, port: number): string {
  if (input.dockerfile) {
    return requireScopedPath(input.dockerfile, { field: 'serve.dockerfile' }, 'serve-dockerfile', 'serve.dockerfile is invalid');
  }
  const dockerfile = path.join(tempDir, 'Dockerfile');
  fs.writeFileSync(dockerfile, generatedDockerfile({ ...DEFAULTS, ...input, port }, image, type));
  return dockerfile;
}

function prepareManifests(input: AnyRecord, tempDir: string, imageName: string, serviceName: string, port: number): string[] {
  let manifest: string;
  if (input.deployment_yaml) {
    manifest = requireScopedPath(input.deployment_yaml, { field: 'serve.deployment_yaml' }, 'serve-deployment-yaml', 'serve.deployment_yaml is invalid');
  } else {
    manifest = path.join(tempDir, 'deployment.yaml');
    fs.writeFileSync(manifest, generatedManifest(imageName, serviceName, port));
  }
  if (!input.secret_yaml) return [manifest];
  const secret = requireScopedPath(input.secret_yaml, { field: 'serve.secret_yaml' }, 'serve-secret-yaml', 'serve.secret_yaml is invalid');
  return [secret, manifest];
}

function prepareBuild(context: BuildContext): PreparedBuild {
  const input: AnyRecord = context.config?.serve ?? {};
  const repoRoot = context.repoRoot;
  if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot)) {
    throw new BuildPreparationError('build suite requires an absolute synchronized repository root', 'build-repo-root');
  }
  const type = input.type === 'server' ? 'server' : 'static';
  const image = requireImage(input.image ?? DEFAULTS.image);
  const port = requirePort(type === 'static' ? 80 : (input.port ?? DEFAULTS.port));
  const projectDir = requireScopedPath(input.project_dir ?? DEFAULTS.project_dir, { repoDir: repoRoot, field: 'serve.project_dir' }, 'serve-project-dir', 'serve.project_dir is invalid');
  const secretFailure = validateSecretAuthority(input);
  if (secretFailure) throw new BuildPreparationError(secretFailure, 'serve-secret-ref');

  const tempDir = path.join(projectDir, '.swarm', 'buster-build', `${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const imageName = `buster-build-${String(context.payload?.module_id ?? 'module').toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
  const serviceName = imageName.slice(0, 63);
  const dockerfile = prepareDockerfile(input, tempDir, image, type, port);
  const dockerfileFindings = validateDockerfileFromImages(dockerfile);
  if (dockerfileFindings.length) throw new BuildPreparationError(dockerfileFindings.join('\n'), 'dockerfile-from-image');

  const manifests = prepareManifests(input, tempDir, imageName, serviceName, port);
  return { input, repoRoot, type, port, projectDir, imageName, serviceName, dockerfile, manifests };
}

async function deployBuild(context: BuildContext, build: PreparedBuild): Promise<SuiteVerdict> {
  const { input, repoRoot, imageName, serviceName, dockerfile, projectDir, manifests, port } = build;
  return k8sSuite({
    ...context,
    repoRoot,
    config: { k8s: {
      image_name: imageName,
      service_name: serviceName,
      dockerfile: path.relative(repoRoot, dockerfile),
      build_context: input.build_context ?? path.relative(repoRoot, projectDir),
      manifests: manifests.map((manifestPath) => path.relative(repoRoot, manifestPath)),
      port,
      health_path: input.health_path ?? '/',
      ready_timeout_seconds: input.ready_timeout_seconds ?? 120,
      build_timeout_seconds: input.timeout ?? DEFAULTS.timeout,
      namespace_prefix: 'test',
      cleanup_policy: 'delete',
    } },
  });
}

function wrapBuildVerdict(startedAt: number, build: PreparedBuild, verdict: SuiteVerdict, extra: AnyRecord = {}): SuiteVerdict {
  return createSuiteVerdict('build', verdict.status, {
    ...verdict,
    duration_ms: Date.now() - startedAt,
    metadata: { ...(verdict.metadata ?? {}), tool: 'rootless-buildkit', serve_type: build.type, ...extra },
  });
}

export default async function buildSuite(context: BuildContext): Promise<SuiteVerdict> {
  const startedAt = Date.now();
  const log = createSuiteLog('build', 'BUILD', (entry) => context.logSink?.(entry));
  try {
    const build = prepareBuild(context);
    const verdict = await deployBuild(context, build);
    if (verdict.status !== STATUS.PASS) return wrapBuildVerdict(startedAt, build, verdict);
    if (!context.registerRuntimeCleanup) {
      return failure(startedAt, 'build suite requires task-scoped runtime cleanup authority', 'build-runtime-cleanup');
    }
    const namespace = verdict.metadata?.test_namespace;
    if (typeof namespace !== 'string' || !namespace) {
      return failure(startedAt, 'k8s suite did not return its leased namespace', 'build-runtime-namespace');
    }
    const portForward = await startServicePortForward(
      namespace,
      build.serviceName,
      build.port,
      build.input.health_path ?? '/',
      log,
      buildK8sCommandEnv(null),
    );
    context.registerRuntimeCleanup(portForward.stop);
    return wrapBuildVerdict(startedAt, build, verdict, { port: portForward.localPort, container_port: build.port });
  } catch (error) {
    const rule = error instanceof BuildPreparationError ? error.rule : 'buildkit-deploy';
    return failure(startedAt, errorMessage(error), rule);
  }
}
