import type {
  ArtifactRef,
  PluginInvocationContext,
  StageResult,
} from '@kubeclaw/plugin-sdk';

interface DeliveryLintInput {
  readonly moduleId: string;
  readonly dockerfile: string | null;
  readonly staticPath: string | null;
}

interface Failure {
  readonly code: string;
  readonly message: string;
  readonly nextStep: string;
}

function safeRepositoryPath(value: string, field: string): string {
  if (value.includes('\0') || /[\r\n]/.test(value)) throw new Error(`${field} contains forbidden characters`);
  if (value.startsWith('/') || value.split(/[\\/]+/).includes('..')) {
    throw new Error(`${field} must be repository-relative without parent traversal`);
  }
  return value.replaceAll('\\', '/');
}

function safeContainerPath(value: string): string {
  if (value.includes('\0') || /[\r\n]/.test(value)) throw new Error('staticPath contains forbidden characters');
  if (value.split(/[\\/]+/).includes('..')) throw new Error('staticPath must not contain parent traversal');
  return value.replaceAll('\\', '/');
}

function copyDestinations(dockerfile: string): readonly string[] {
  return dockerfile.split('\n').flatMap((line) => {
    const match = line.trim().match(/^COPY(?:\s+--\S+)*\s+\S+\s+(\S+)/i);
    return match?.[1] ? [match[1].replace(/\/$/, '')] : [];
  });
}

function artifactRef(value: Readonly<Record<string, unknown>>): ArtifactRef {
  const artifact = value.artifact;
  if (!artifact || typeof artifact !== 'object') throw new Error('artifact adapter returned no artifact reference');
  return artifact as ArtifactRef;
}

async function writeReport(
  context: PluginInvocationContext,
  input: DeliveryLintInput,
  failures: readonly Failure[],
): Promise<ArtifactRef> {
  const result = await context.invoke('artifacts.write', {
    operation: 'put_json',
    resource: {
      type: 'artifact.object',
      canonicalId: `delivery-lint:${input.moduleId}`,
    },
    payload: {
      namespace: 'kubeclaw.delivery-lint',
      mediaType: 'application/json',
      value: { moduleId: input.moduleId, passed: failures.length === 0, failures },
    },
  });
  return artifactRef(result);
}

export async function execute(
  input: DeliveryLintInput,
  context: PluginInvocationContext,
): Promise<StageResult> {
  if (input.dockerfile === null) {
    const artifact = await writeReport(context, input, []);
    return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [artifact] };
  }
  let dockerfilePath: string;
  let staticPath: string | null;
  try {
    dockerfilePath = safeRepositoryPath(input.dockerfile, 'dockerfile');
    staticPath = input.staticPath === null ? null : safeContainerPath(input.staticPath);
  } catch (error) {
    const failure = {
      code: 'delivery_lint.path_invalid',
      message: error instanceof Error ? error.message : String(error),
      nextStep: 'Use repository-relative paths without traversal.',
    };
    const artifact = await writeReport(context, input, [failure]);
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'blocked',
      reason: { code: failure.code, message: failure.message },
      artifacts: [artifact],
    };
  }
  let content: string;
  try {
    const response = await context.invoke('git.repository.read', {
      operation: 'read_text',
      resource: { type: 'git.repository.path', canonicalId: dockerfilePath },
      payload: {},
    });
    if (typeof response.content !== 'string') throw new Error('repository adapter returned non-text content');
    content = response.content;
  } catch (error) {
    const failure = {
      code: 'delivery_lint.dockerfile_unavailable',
      message: error instanceof Error ? error.message : String(error),
      nextStep: `Create a readable Dockerfile at ${dockerfilePath}.`,
    };
    const artifact = await writeReport(context, input, [failure]);
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'request_fix',
      reason: { code: failure.code, message: failure.message },
      artifacts: [artifact],
    };
  }
  const normalizedStatic = staticPath?.replace(/\/$/, '') ?? null;
  const destinations = copyDestinations(content);
  const failures: Failure[] = normalizedStatic !== null
    && destinations.length > 0
    && !destinations.includes(normalizedStatic)
    ? [{
      code: 'delivery_lint.static_path_mismatch',
      message: `No Dockerfile COPY destination matches '${staticPath}'.`,
      nextStep: `Align a COPY destination with '${staticPath}'.`,
    }]
    : [];
  const artifact = await writeReport(context, input, failures);
  if (failures.length > 0) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'request_fix',
      reason: { code: failures[0]!.code, message: failures[0]!.message },
      artifacts: [artifact],
    };
  }
  return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [artifact] };
}
