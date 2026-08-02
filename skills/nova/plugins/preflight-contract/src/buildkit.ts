import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';

interface BuildkitInput {
  readonly repositoryRoot: string;
  readonly testConfig: Readonly<Record<string, unknown>>;
  readonly task: Readonly<Record<string, unknown>>;
  readonly moduleId: string;
  readonly attempt: number;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function buildEvidence(response: Readonly<Record<string, unknown>>): {
  readonly image: string;
  readonly digest: string;
  readonly healthCode: number;
} {
  if (!Array.isArray(response.results)) throw new Error('BUILDKIT_PREFLIGHT_RESULTS_INVALID');
  const verdict = response.results.find((entry) => record(entry) && entry.suite === 'build');
  if (!record(verdict) || verdict.status !== 'PASS' || verdict.critical !== true || !record(verdict.metadata)) {
    throw new Error('BUILDKIT_PREFLIGHT_BUILD_FAILED');
  }
  const image = requiredText(verdict.metadata.registry_image, 'BUILDKIT_PREFLIGHT_IMAGE_MISSING');
  const digest = requiredText(verdict.metadata.registry_image_digest, 'BUILDKIT_PREFLIGHT_DIGEST_MISSING');
  if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) throw new Error('BUILDKIT_PREFLIGHT_DIGEST_INVALID');
  const healthCode = Number(verdict.metadata.health_http_code);
  if (!Number.isSafeInteger(healthCode) || healthCode < 200 || healthCode >= 300) {
    throw new Error('BUILDKIT_PREFLIGHT_HEALTH_INVALID');
  }
  if (verdict.metadata.tool !== 'rootless-buildkit') throw new Error('BUILDKIT_PREFLIGHT_TOOL_INVALID');
  return { image, digest, healthCode };
}

function registryManifestUrl(registryOrigin: string, image: string, digest: string): string {
  const origin = new URL(registryOrigin);
  const reference = new URL(`http://${image}`);
  if (reference.host !== origin.host) throw new Error('BUILDKIT_PREFLIGHT_REGISTRY_MISMATCH');
  const repository = reference.pathname.replace(/^\/+|:[^/]+$/gu, '');
  if (!repository || repository.split('/').some((part) => !part)) {
    throw new Error('BUILDKIT_PREFLIGHT_REPOSITORY_INVALID');
  }
  return new URL(`/v2/${repository}/manifests/${digest}`, origin).href;
}

export async function execute(input: BuildkitInput, context: PluginInvocationContext): Promise<StageResult> {
  try {
    const suite = await context.invoke('test.suite.execute', {
      operation: 'run',
      resource: { type: 'test.suite-plan', canonicalId: `buildkit-preflight:${input.moduleId}` },
      payload: {
        repositoryRoot: input.repositoryRoot,
        suites: ['build'],
        testConfig: input.testConfig,
        task: input.task,
        moduleId: input.moduleId,
        attempt: input.attempt,
      },
    });
    const evidence = buildEvidence(suite);
    const registryOrigin = requiredText(
      context.contract.config.registryOrigin,
      'BUILDKIT_PREFLIGHT_REGISTRY_ORIGIN_MISSING',
    );
    const manifest = await context.invoke('network.http', {
      operation: 'request',
      resource: {
        type: 'network.url',
        canonicalId: registryManifestUrl(registryOrigin, evidence.image, evidence.digest),
      },
      payload: {
        method: 'GET',
        headers: {
          accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
        },
      },
    });
    const headers = record(manifest.headers) ? manifest.headers : {};
    if (manifest.status !== 200 || headers['docker-content-digest'] !== evidence.digest || !record(manifest.body)) {
      throw new Error('BUILDKIT_PREFLIGHT_REGISTRY_PROOF_INVALID');
    }
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'passed',
      artifacts: [],
      facts: {
        'buildkit.preflight': 'passed',
        'buildkit.digest': evidence.digest,
        'buildkit.health-code': evidence.healthCode,
      },
    };
  } catch (error) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'blocked',
      reason: {
        code: 'buildkit_preflight.failed',
        message: error instanceof Error ? error.message : String(error),
      },
      artifacts: [],
    };
  }
}
