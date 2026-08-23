import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const NAME = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const PLATFORM = /^linux\/[a-z0-9_+-]+(?:\/[a-z0-9._+-]+)?$/u;
const ARG_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const PROTECTED_ARGUMENT = /(?:TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL)/iu;

const TEMPLATES = Object.freeze({
  'node-static@1': Object.freeze({
    id: 'node-static',
    version: '1',
    dockerfile: [
      'FROM docker.io/library/node@sha256:752ea8a2f758c34002a0461bd9f1cee4f9a3c36d48494586f60ffce1fc708e0e AS build',
      'WORKDIR /src',
      'COPY package.json package-lock.json ./',
      'RUN npm ci',
      'COPY . .',
      'RUN npm run build',
      'FROM docker.io/library/nginx@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10',
      'COPY --from=build /src/dist/ /usr/share/nginx/html/',
      'EXPOSE 80',
      '',
    ].join('\n'),
  }),
});

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`CONTAINER_BUILD_CONFIG_INVALID:${label}`);
  return value;
}

function relative(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 1024 || value.includes('\0') || path.isAbsolute(value)
    || value.split(/[\\/]/u).some((part) => part === '' || part === '..')) throw new Error(`CONTAINER_BUILD_PATH_INVALID:${label}`);
  return value === '.' ? '.' : value.split(/[\\/]/u).join('/');
}

function inside(root, value, label, exists = true) {
  const candidate = path.resolve(root, value);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error(`CONTAINER_BUILD_PATH_ESCAPE:${label}`);
  if (!exists) return candidate;
  const canonical = fs.realpathSync(candidate);
  if (canonical !== root && !canonical.startsWith(`${root}${path.sep}`)) throw new Error(`CONTAINER_BUILD_SYMLINK_DENIED:${label}`);
  return canonical;
}

function config(invocation, context) {
  const value = object(invocation.configuration.values, 'root');
  const repository = inside(path.resolve(context.workspaceRoot), invocation.workspace.repository, 'repository');
  const scratch = inside(path.resolve(context.workspaceRoot), invocation.workspace.scratch, 'scratch');
  const buildContext = inside(repository, relative(value.buildContext, 'buildContext'), 'buildContext');
  if (!fs.statSync(buildContext).isDirectory()) throw new Error('CONTAINER_BUILD_CONTEXT_NOT_DIRECTORY');
  const definition = object(value.definition, 'definition');
  let dockerfile;
  let identity;
  let target;
  let buildArgs = {};
  if (definition.type === 'dockerfile') {
    dockerfile = inside(repository, relative(definition.dockerfile, 'definition.dockerfile'), 'dockerfile');
    if (!fs.statSync(dockerfile).isFile()) throw new Error('CONTAINER_BUILD_DOCKERFILE_NOT_FILE');
    identity = `dockerfile:${path.relative(repository, dockerfile).split(path.sep).join('/')}`;
    if (definition.target !== undefined && (typeof definition.target !== 'string' || !NAME.test(definition.target))) {
      throw new Error('CONTAINER_BUILD_TARGET_INVALID');
    }
    target = definition.target;
    if (definition.buildArgs !== undefined) {
      buildArgs = object(definition.buildArgs, 'definition.buildArgs');
      const entries = Object.entries(buildArgs);
      if (entries.length > 32 || entries.some(([name, item]) => !ARG_NAME.test(name) || PROTECTED_ARGUMENT.test(name)
        || typeof item !== 'string' || item.length > 4096 || item.includes('\0'))) throw new Error('CONTAINER_BUILD_ARGUMENT_INVALID');
    }
  } else if (definition.type === 'template') {
    const template = TEMPLATES[definition.template];
    if (!template) throw new Error(`CONTAINER_BUILD_TEMPLATE_UNKNOWN:${String(definition.template)}`);
    const digest = crypto.createHash('sha256').update(template.dockerfile).digest('hex');
    identity = `template:${template.id}@${template.version}:sha256:${digest}`;
    dockerfile = inside(scratch, `template-${digest}.Dockerfile`, 'template', false);
    fs.writeFileSync(dockerfile, template.dockerfile, { flag: 'wx', mode: 0o600 });
  } else {
    throw new Error('CONTAINER_BUILD_DEFINITION_INVALID');
  }
  const outputName = value.outputName ?? String(invocation.moduleId ?? invocation.nodeId).toLowerCase().replace(/[^a-z0-9._-]/gu, '-');
  if (typeof outputName !== 'string' || !NAME.test(outputName)) throw new Error('CONTAINER_BUILD_OUTPUT_NAME_INVALID');
  const platform = value.platform ?? 'linux/amd64';
  if (typeof platform !== 'string' || !PLATFORM.test(platform)) throw new Error('CONTAINER_BUILD_PLATFORM_INVALID');
  return { repository, scratch, buildContext, dockerfile, identity, outputName, platform, target, buildArgs };
}

function details(values) {
  const schemaId = 'kubeclaw.container-build-details.v1';
  return { schemaId, schemaDigest: `sha256:${crypto.createHash('sha256').update(schemaId).digest('hex')}`, values };
}

export function provider() {
  return {
    async execute(invocation, context) {
      const resolved = config(invocation, context);
      const result = await context.invoke('container.build', {
        operation: 'build_push_verify',
        resource: { type: 'container.build-definition', canonicalId: `build:${resolved.outputName}:${invocation.attemptId}` },
        payload: {
          repositoryRoot: resolved.repository,
          scratchRoot: resolved.scratch,
          buildContext: resolved.buildContext,
          dockerfile: resolved.dockerfile,
          definitionIdentity: resolved.identity,
          outputName: resolved.outputName,
          platform: resolved.platform,
          ...(resolved.target ? { target: resolved.target } : {}),
          buildArgs: resolved.buildArgs,
          limits: { maximumLogBytes: invocation.limits.logBytes, maximumExecutionMs: invocation.timeoutMs },
        },
      });
      if (typeof result.stdout === 'string' && result.stdout) context.log('stdout', result.stdout);
      if (typeof result.stderr === 'string' && result.stderr) context.log('stderr', result.stderr);
      const passed = result.ok === true;
      const finding = passed ? [] : [{ id: 'container-build-failed', severity: 'high',
        rule: String(result.errorCode ?? 'CONTAINER_BUILD_FAILED'), message: String(result.message ?? 'Container build failed.') }];
      const image = passed ? {
        schemaVersion: 'container-image.v1',
        reference: result.immutableImage,
        digest: result.digest,
        registryReference: result.registryImage,
        platform: resolved.platform,
        definitionIdentity: resolved.identity,
      } : null;
      return {
        schemaVersion: 'provider-result.v1',
        outcome: passed ? 'passed' : 'failed',
        summary: passed ? `Built and verified ${String(result.immutableImage)}.` : String(result.message ?? 'Container build failed.'),
        counts: { total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1, skipped: 0 },
        findings: finding,
        metrics: typeof result.durationMs === 'number' ? [{ name: 'container_build_duration_ms', value: result.durationMs, unit: 'ms' }] : [],
        evidenceFiles: [], reports: [],
        outputs: image ? [{ name: 'image', kind: 'value', schemaId: 'kubeclaw.container-image@1', value: image }] : [],
        exitCode: null,
        signal: null,
        providerDetails: details({ definitionIdentity: resolved.identity, platform: resolved.platform,
          registryImage: result.registryImage ?? null, immutableImage: result.immutableImage ?? null, digest: result.digest ?? null }),
      };
    },
  };
}
