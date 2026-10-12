from pathlib import Path
root=Path(__file__).resolve().parent/'files/skills/buster/engine/test-gates';p=root/'runner.ts';s=p.read_text();a=s.index('  async #cleanupInstance(');body=s[a:];assert body.endswith('}\n');body=body[:-2]
body=body.replace('  async #cleanupInstance(', 'async function cleanupInstance(owner: FixtureOwner,').replace('  async #cleanupProvider(', 'export async function cleanupRetainedProvider(owner: FixtureOwner,').replace('  async #cleanupFixtures(): Promise<void> {','export async function cleanupRetainedFixtures(owner: FixtureOwner, retainedFixtures: readonly RetainedFixture[]): Promise<void> {')
body=body.replace('this.#cleanupProvider(', 'cleanupRetainedProvider(owner,').replace('this.#cleanupInstance(', 'cleanupInstance(owner,').replace('this.#context(', 'owner.context(').replace('this.#cleanupErrors','owner.cleanupErrors').replace('this.#workspaceRoot','owner.workspaceRoot').replace('this.#retainedFixtures','retainedFixtures').replace('this.#options.cleanupTimeoutMs ?? 30_000','owner.cleanupTimeoutMs()')
header='''import fs from 'node:fs';
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
'''
(root/'runner-fixtures.ts').write_text(header+body)
s=s[:a]+'''  #fixtureOwner(): FixtureOwner {
    return { workspaceRoot: this.#workspaceRoot, cleanupErrors: this.#cleanupErrors,
      cleanupTimeoutMs: () => this.#options.cleanupTimeoutMs ?? 30_000,
      context: (signal, log, grants, inputs) => this.#context(signal, log, grants, inputs) };
  }

  #cleanupProvider(node: ResolvedPlanNodeV1, instance: LoadedTestProvider,
    invocation: ProviderInvocationV1, log: TestProviderExecutionContext['log']): Promise<boolean> {
    return cleanupRetainedProvider(this.#fixtureOwner(), node, instance, invocation, log);
  }

  #cleanupFixtures(): Promise<void> {
    return cleanupRetainedFixtures(this.#fixtureOwner(), this.#retainedFixtures);
  }
}
'''
s="import { cleanupRetainedProvider, cleanupRetainedFixtures, type FixtureOwner } from './runner-fixtures.ts';\n"+s
for line in ["import { grantedCapabilities, createBusterWorkerProfiles } from './runner-worker-profile.ts';\n","import { validateAndMapOutputs } from './provider-result-validation.ts';\n"]:s=s.replace(line,'')
p.write_text(s)
print({'runnerPhysicalLines':len(s.splitlines())})
