import fs from 'node:fs';
import path from 'node:path';
import type { ProviderInvocationV1, ResolvedInputV1, ResolvedPlanNodeV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderExecutionContext } from '@kubeclaw/plugin-sdk';
import type { LoadedTestProvider } from './provider-loader.ts';
import type { AttemptExecution } from './runner-types.ts';
import { createLogCapture } from './runner-log-capture.ts';
import { detail } from './runner-values.ts';
export interface FixtureOwner {
 readonly workspaceRoot: string;
 readonly cleanupErrors: { nodeId: string; message: string }[];
 cleanupTimeoutMs(): number;
 context(signal: AbortSignal, log: TestProviderExecutionContext['log'], granted: ReadonlySet<string>,
   inputs: readonly ResolvedInputV1[]): TestProviderExecutionContext;
}
interface RetainedFixture { readonly node: ResolvedPlanNodeV1; readonly execution: AttemptExecution; }
async function cleanupInstance(owner: FixtureOwner,
    node: ResolvedPlanNodeV1,
    execution: AttemptExecution,
  ): Promise<boolean> {
    if (!execution.instance?.cleanup) return true;
    return cleanupRetainedProvider(owner,
      node,
      execution.instance,
      execution.invocation,
      createLogCapture(execution.invocation.limits.logBytes).contextLog,
    );
  }

export async function cleanupRetainedProvider(owner: FixtureOwner,
    node: ResolvedPlanNodeV1,
    instance: LoadedTestProvider,
    invocation: ProviderInvocationV1,
    log: TestProviderExecutionContext["log"],
  ): Promise<boolean> {
    if (!instance.cleanup) return true;
    const controller = new AbortController();
    const timeoutMs = owner.cleanupTimeoutMs();
    let timer: NodeJS.Timeout | undefined;
    const context = owner.context(
      controller.signal,
      log,
      new Set(invocation.grantedCapabilities),
      invocation.inputs,
    );
    try {
      await Promise.race([
        instance.cleanup(invocation, context),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort(new Error("TEST_PROVIDER_CLEANUP_TIMEOUT"));
            reject(new Error("TEST_PROVIDER_CLEANUP_TIMEOUT"));
          }, timeoutMs);
        }),
      ]);
      return true;
    } catch (error) {
      owner.cleanupErrors.push({ nodeId: node.id, message: detail(error) });
      await instance.terminate();
      return false;
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort(new Error("TEST_PROVIDER_CLEANUP_COMPLETE"));
    }
  }

export async function cleanupRetainedFixtures(owner: FixtureOwner, retainedFixtures: readonly RetainedFixture[]): Promise<void> {
    for (const retained of [...retainedFixtures].reverse()) {
      if (!await cleanupInstance(owner,retained.node, retained.execution)) continue;
      await retained.execution.instance?.terminate();
      {
        const repository = path.resolve(owner.workspaceRoot, retained.execution.invocation.workspace.repository);
        const attemptsRoot = path.join(path.resolve(owner.workspaceRoot), 'test-attempts');
        const attemptRoot = path.dirname(repository);
        const relative = path.relative(attemptsRoot, attemptRoot);
        if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) {
          throw new Error('TEST_PROVIDER_ATTEMPT_PATH_INVALID');
        }
        fs.rmSync(repository, { recursive: true, force: true });
      }
    }
  }
